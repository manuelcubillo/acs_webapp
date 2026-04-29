"use server";

/**
 * Upload Server Actions
 *
 * Two-step presigned-PUT flow:
 *
 *  1. requestPhotoUploadUrlAction(...) — auth + role guard + key allocation,
 *     returns a short-lived presigned PUT URL.
 *
 *  2. confirmPhotoUploadAction(...)    — HEAD the uploaded object, validate
 *     size/content type, and return a signed read URL the UI can render now.
 *
 * Persistence (writing the object key into a card / user / tenant / design)
 * is handled by the surface that owns the kind. This action only mints and
 * verifies the upload — never writes domain state.
 */

import { z } from "zod";
import {
  actionHandler,
  requireAdmin,
  requireMaster,
  requireOperator,
  type ActionResult,
} from "@/lib/api";
import { ValidationError } from "@/lib/dal/errors";
import {
  ALLOWED_OUTPUT_MIME,
  PHOTO_KINDS,
  type AllowedOutputMime,
  type PhotoKind,
} from "@/lib/storage/types";
import {
  assertHeadOk,
  assertObjectMatchesKind,
  buildObjectKey,
  getPhotoStorage,
} from "@/lib/storage";
import { canManage } from "@/lib/auth/role-hierarchy";
import {
  CARD_DESIGN_IMAGE_PROFILE,
  CARD_PHOTO_PROFILE,
  MEMBER_AVATAR_PROFILE,
  TENANT_LOGO_PROFILE,
  type ImageOptimizationProfile,
} from "@/lib/images";
import { getMemberById } from "@/lib/dal/members";

// ─── Profile lookup ─────────────────────────────────────────────────────────

const PROFILE_BY_KIND: Record<PhotoKind, ImageOptimizationProfile> = {
  "card-photo": CARD_PHOTO_PROFILE,
  "card-design-image": CARD_DESIGN_IMAGE_PROFILE,
  "member-avatar": MEMBER_AVATAR_PROFILE,
  "tenant-logo": TENANT_LOGO_PROFILE,
};

/** Server-side ceiling per kind (5% slack on top of the optimization budget). */
function maxBytesForKind(kind: PhotoKind): number {
  return Math.ceil(PROFILE_BY_KIND[kind].maxOutputBytes * 1.05);
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const PhotoKindSchema = z.enum(PHOTO_KINDS);
const OutputMimeSchema = z.enum(ALLOWED_OUTPUT_MIME);

const RequestUploadSchema = z.object({
  kind: PhotoKindSchema,
  ownerId: z.string().min(1),
  contentType: OutputMimeSchema,
  contentLength: z.number().int().positive(),
});

const ConfirmUploadSchema = z.object({
  kind: PhotoKindSchema,
  ownerId: z.string().min(1),
  key: z.string().min(1),
});

// ─── Auth dispatch ──────────────────────────────────────────────────────────

interface AuthorizedContext {
  tenantId: string;
  userId: string;
}

/**
 * Apply the role guard appropriate to `kind` and verify that `ownerId` is
 * something this caller is allowed to act on.
 *
 * - card-photo / card-design-image / tenant-logo follow strict role gates.
 * - member-avatar allows self-edit for any operator+, otherwise admin+self
 *   must outrank the target via canManage.
 */
async function authorizeFor(
  kind: PhotoKind,
  ownerId: string,
): Promise<AuthorizedContext> {
  switch (kind) {
    case "card-photo": {
      const ctx = await requireAdmin();
      return { tenantId: ctx.tenantId, userId: ctx.userId };
    }
    case "card-design-image": {
      const ctx = await requireMaster();
      return { tenantId: ctx.tenantId, userId: ctx.userId };
    }
    case "tenant-logo": {
      const ctx = await requireMaster();
      if (ownerId !== ctx.tenantId) {
        throw new ValidationError(
          "Tenant logo owner must match the current tenant",
        );
      }
      return { tenantId: ctx.tenantId, userId: ctx.userId };
    }
    case "member-avatar": {
      const ctx = await requireOperator();
      if (ownerId === ctx.userId) {
        // Self-edit always allowed for any tenant member.
        return { tenantId: ctx.tenantId, userId: ctx.userId };
      }
      // Editing another member requires admin+ AND outranking the target.
      if (ctx.role !== "admin" && ctx.role !== "master") {
        throw new ValidationError(
          "You can only update your own avatar",
        );
      }
      // ownerId is interpreted as a member's user ID.
      const target = await findMemberByUserId(ctx.tenantId, ownerId);
      if (!canManage(ctx.role, target.role)) {
        throw new ValidationError(
          "You cannot manage this member's avatar",
        );
      }
      return { tenantId: ctx.tenantId, userId: ctx.userId };
    }
  }
}

async function findMemberByUserId(tenantId: string, userId: string) {
  // Local copy of the lookup to avoid a circular import via the barrel.
  const { getMemberByUserId } = await import("@/lib/dal/members");
  return getMemberByUserId(tenantId, userId);
}

// `getMemberById` import retained for future per-member id flows; suppress
// unused warning by referencing it.
void getMemberById;

// ─── Actions ────────────────────────────────────────────────────────────────

export interface RequestUploadResult {
  uploadUrl: string;
  key: string;
  expiresAt: string;
  requiredHeaders: Record<string, string>;
}

export async function requestPhotoUploadUrlAction(
  input: unknown,
): Promise<ActionResult<RequestUploadResult>> {
  return actionHandler(async () => {
    const data = RequestUploadSchema.parse(input);
    const { tenantId } = await authorizeFor(data.kind, data.ownerId);

    const profileBudget = maxBytesForKind(data.kind);
    if (data.contentLength > profileBudget) {
      throw new ValidationError(
        `Upload exceeds the per-kind size budget (${data.contentLength} > ${profileBudget})`,
      );
    }

    const key = buildObjectKey({
      kind: data.kind,
      tenantId,
      ownerId: data.ownerId,
      mime: data.contentType as AllowedOutputMime,
    });

    const storage = getPhotoStorage();
    const presigned = await storage.getUploadUrl({
      key,
      contentType: data.contentType,
      contentLength: data.contentLength,
    });

    return {
      uploadUrl: presigned.uploadUrl,
      key: presigned.key,
      expiresAt: presigned.expiresAt,
      requiredHeaders: presigned.requiredHeaders,
    };
  });
}

export interface ConfirmUploadResult {
  key: string;
  readUrl: string;
}

export async function confirmPhotoUploadAction(
  input: unknown,
): Promise<ActionResult<ConfirmUploadResult>> {
  return actionHandler(async () => {
    const data = ConfirmUploadSchema.parse(input);
    const { tenantId } = await authorizeFor(data.kind, data.ownerId);

    assertObjectMatchesKind({
      key: data.key,
      expectedTenantId: tenantId,
      expectedKind: data.kind,
    });

    const storage = getPhotoStorage();
    const head = await storage.head(data.key);
    assertHeadOk({ head, maxBytes: maxBytesForKind(data.kind) });

    const readUrl = await storage.getReadUrl(data.key);
    return { key: data.key, readUrl };
  });
}

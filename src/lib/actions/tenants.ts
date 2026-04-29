/**
 * Server Actions — Tenants (admin)
 *
 * These actions are intended for super-admins / internal tooling.
 * Regular tenant users cannot create or delete other tenants.
 *
 * For now there is no role check beyond `requireAuth()`.
 * Add an `isSuperAdmin` guard once roles are introduced.
 */

"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  actionHandler,
  requireAuth,
  requireAdmin,
  requireMaster,
  type ActionResult,
} from "@/lib/api";
import {
  createTenant,
  getTenantById,
  updateTenant,
  updateTenantSettings,
  listTenants,
  deleteTenant,
  addMember,
  upsertDashboardSettings,
  ValidationError,
} from "@/lib/dal";
import type { Tenant } from "@/lib/dal";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const CreateTenantSchema = z.object({
  name: z.string().min(1).max(200),
});

const CreateTenantWithMasterSchema = z.object({
  name: z.string().min(1, "El nombre de la organización es requerido").max(200),
});

const UpdateTenantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
});

const UpdateTenantSettingsSchema = z.object({
  scanMode: z.enum(["camera", "external_reader", "both"]).optional(),
});

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Create a new tenant.
 */
export async function createTenantAction(
  input: unknown,
): Promise<ActionResult<Tenant>> {
  return actionHandler(async () => {
    await requireAuth();
    const data = CreateTenantSchema.parse(input);
    return createTenant({ name: data.name });
  });
}

/**
 * Bootstrap a new tenant for the currently authenticated user.
 *
 * Used by the public sign-up flow: a freshly registered user (no tenant yet)
 * creates their own organization and becomes its first `master`.
 *
 * Sequence (Neon HTTP — no interactive transactions, best-effort atomicity,
 * see ADR `2026-04-25-tenant-bootstrap-best-effort.md`):
 *   1. Create the tenant row.
 *   2. Insert the caller as `master` in `tenant_members`.
 *   3. Seed default `dashboard_settings`.
 *   4. Update `user.tenantId` via Better Auth so the session reflects it
 *      on the next request.
 *
 * If any step after (1) fails, the tenant is removed via compensating delete
 * (cascades clear member + settings) so the caller can retry cleanly.
 *
 * Refuses if the caller already has a tenant — one tenant per user for now.
 */
export async function createTenantWithMasterAction(
  input: unknown,
): Promise<ActionResult<Tenant>> {
  return actionHandler(async () => {
    const { userId } = await requireAuth();
    const data = CreateTenantWithMasterSchema.parse(input);

    const reqHeaders = await headers();
    const session = await auth.api.getSession({ headers: reqHeaders });
    const currentTenantId = (session?.user as { tenantId?: string | null } | undefined)?.tenantId;
    if (currentTenantId) {
      throw new ValidationError(
        "Esta cuenta ya está asociada a una organización.",
      );
    }

    const tenant = await createTenant({ name: data.name });

    try {
      await addMember(tenant.id, userId, { role: "master" });
      await upsertDashboardSettings(tenant.id, {});
      await auth.api.updateUser({
        body: { tenantId: tenant.id },
        headers: reqHeaders,
      });
    } catch (err) {
      // Compensating delete — cascades remove member + dashboard_settings.
      await deleteTenant(tenant.id).catch(() => {
        // Swallow secondary failure; the original error is more informative.
      });
      throw err;
    }

    return tenant;
  });
}

/**
 * Get a tenant by ID.
 */
export async function getTenantAction(
  id: string,
): Promise<ActionResult<Tenant>> {
  return actionHandler(async () => {
    await requireAuth();
    return getTenantById(id);
  });
}

/**
 * List all tenants.
 */
export async function listTenantsAction(): Promise<ActionResult<Tenant[]>> {
  return actionHandler(async () => {
    await requireAuth();
    return listTenants();
  });
}

/**
 * Update a tenant's name.
 */
export async function updateTenantAction(
  id: string,
  input: unknown,
): Promise<ActionResult<Tenant>> {
  return actionHandler(async () => {
    await requireAuth();
    const data = UpdateTenantSchema.parse(input);
    return updateTenant(id, data);
  });
}

/**
 * Update tenant-level settings (e.g. scan mode).
 * Master only.
 */
export async function updateTenantSettingsAction(
  input: unknown,
): Promise<ActionResult<Tenant>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    const data = UpdateTenantSettingsSchema.parse(input);
    return updateTenantSettings(tenantId, data);
  });
}

/**
 * Update the name of the authenticated user's own tenant.
 * Requires admin or master role.
 */
export async function updateCurrentTenantNameAction(
  input: unknown,
): Promise<ActionResult<Tenant>> {
  return actionHandler(async () => {
    const { tenantId } = await requireAdmin();
    const data = z.object({ name: z.string().min(1, "Name is required").max(200) }).parse(input);
    return updateTenant(tenantId, { name: data.name });
  });
}

/**
 * Set or clear the current tenant's logo. Master only.
 *
 * The actual upload is handled by `requestPhotoUploadUrlAction` +
 * `confirmPhotoUploadAction` (kind = `tenant-logo`). This action only
 * persists the validated key into `tenants.logo_object_key`.
 */
export async function setCurrentTenantLogoAction(
  input: unknown,
): Promise<ActionResult<Tenant>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    const data = z
      .object({ key: z.string().min(1).nullable() })
      .parse(input);
    return updateTenant(tenantId, { logoObjectKey: data.key });
  });
}

/**
 * Delete a tenant and cascade all associated data.
 * This is irreversible — use with caution.
 */
export async function deleteTenantAction(
  id: string,
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    await requireAuth();
    await deleteTenant(id);
  });
}

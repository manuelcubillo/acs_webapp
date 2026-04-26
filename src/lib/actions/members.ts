/**
 * Server Actions — Member Management
 *
 * ADMIN+ actions for managing who belongs to the current tenant and
 * what role they hold.
 *
 * Role checks use the role-hierarchy helpers (canManage, canAssignRole) so
 * that every permission decision is consistent across the codebase.
 *
 * All actions are @role admin (masters are included because master > admin).
 */

"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { user, session, tenantMembers } from "@/lib/db/schema";
import {
  actionHandler,
  requireAdmin,
  type ActionResult,
  type TenantRole,
} from "@/lib/api";
import { auth } from "@/lib/auth";
import {
  addMember,
  getMemberById,
  getMemberByUserId,
  updateMemberRole,
  deactivateMember,
  activateMember,
  removeMember,
  updateMemberProfile,
  listMembers,
  countActiveMasters,
} from "@/lib/dal";
import { ValidationError, ForbiddenOperationError } from "@/lib/dal/errors";
import { canManage, canAssignRole } from "@/lib/auth/role-hierarchy";
import type { TenantMember, MemberWithUser } from "@/lib/dal";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const TenantRoleSchema = z.enum(["operator", "admin", "master"]);

const AddExistingUserSchema = z.object({
  email: z.string().email(),
  role: TenantRoleSchema,
});

const UpdateMemberRoleSchema = z.object({
  role: TenantRoleSchema,
});

const UpdateMemberProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
});

const CreateAndAddMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1, "El nombre es requerido").max(100),
  username: z
    .string()
    .min(2, "Mínimo 2 caracteres")
    .max(50)
    .regex(/^[a-z0-9_.-]+$/, "Solo letras minúsculas, números, guiones y puntos"),
  password: z.string().min(8, "Mínimo 8 caracteres").max(128),
  role: TenantRoleSchema,
});

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Associate an existing Better Auth user (by email) with the current tenant.
 * If the user had a deactivated or removed membership, it is reactivated.
 *
 * @role admin
 */
export async function addExistingUserAction(
  input: unknown,
): Promise<ActionResult<TenantMember>> {
  return actionHandler(async () => {
    const { tenantId, role: actorRole } = await requireAdmin();
    const data = AddExistingUserSchema.parse(input);

    if (!canAssignRole(actorRole, data.role as TenantRole)) {
      throw new ForbiddenOperationError(
        `You cannot assign the "${data.role}" role (your role is "${actorRole}").`,
      );
    }

    const [found] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, data.email.toLowerCase()))
      .limit(1);

    if (!found) {
      throw new ValidationError(
        `No account found for "${data.email}". ` +
          "Use the email invitation flow to invite new users.",
      );
    }

    // If a deactivated/removed membership exists, check canManage before reactivating.
    const [existing] = await db
      .select()
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.tenantId, tenantId),
          eq(tenantMembers.userId, found.id),
        ),
      )
      .limit(1);

    if (existing && (!existing.isActive || existing.removedAt !== null)) {
      if (!canManage(actorRole, existing.role as TenantRole)) {
        throw new ForbiddenOperationError(
          "You do not have permission to reactivate this member.",
        );
      }
    }

    return addMember(tenantId, found.id, { role: data.role as TenantRole });
  });
}

/**
 * Change the role of a tenant member.
 *
 * Enforces:
 * - canManage(actorRole, currentRole) — actor outranks the target
 * - canAssignRole(actorRole, newRole) — actor can assign the new role
 * - last-master invariant
 *
 * @param memberId - TenantMember UUID.
 * @role admin
 */
export async function updateMemberRoleAction(
  memberId: string,
  input: unknown,
): Promise<ActionResult<TenantMember>> {
  return actionHandler(async () => {
    const { tenantId, userId: actorId, role: actorRole } = await requireAdmin();
    const { role: newRole } = UpdateMemberRoleSchema.parse(input);

    const member = await getMemberById(tenantId, memberId);

    if (member.userId === actorId) {
      throw new ForbiddenOperationError("You cannot change your own role.");
    }

    if (!canManage(actorRole, member.role as TenantRole)) {
      throw new ForbiddenOperationError(
        "You do not have permission to manage this member's role.",
      );
    }

    if (!canAssignRole(actorRole, newRole as TenantRole)) {
      throw new ForbiddenOperationError(
        `You cannot assign the "${newRole}" role.`,
      );
    }

    return updateMemberRole(tenantId, memberId, newRole as TenantRole);
  });
}

/**
 * Activate or deactivate a tenant membership.
 * On deactivation, all active sessions for the user are invalidated.
 *
 * @param memberId - TenantMember UUID.
 * @param isActive - true to activate, false to deactivate.
 * @role admin
 */
export async function setMemberActiveAction(
  memberId: string,
  isActive: boolean,
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    const { tenantId, userId: actorId, role: actorRole } = await requireAdmin();
    const member = await getMemberById(tenantId, memberId);

    if (member.userId === actorId) {
      throw new ForbiddenOperationError(
        "You cannot change the active status of your own account.",
      );
    }

    if (!canManage(actorRole, member.role as TenantRole)) {
      throw new ForbiddenOperationError(
        "You do not have permission to manage this member.",
      );
    }

    if (!isActive) {
      // Deactivating: enforce last-master guard.
      if (member.role === "master") {
        const masterCount = await countActiveMasters(tenantId);
        if (masterCount <= 1) {
          throw new ValidationError(
            "Cannot deactivate the last active master. " +
              "Assign another master first.",
          );
        }
      }

      await deactivateMember(tenantId, memberId, actorId);

      // Invalidate all sessions for the deactivated user.
      await db.delete(session).where(eq(session.userId, member.userId));
    } else {
      await activateMember(tenantId, memberId);
    }
  });
}

/**
 * Soft-remove a member from the tenant.
 * Sets removedAt + isActive=false, invalidates sessions, clears user.tenantId
 * if this was their only tenant.
 *
 * @param memberId - TenantMember UUID.
 * @role admin
 */
export async function removeMemberAction(
  memberId: string,
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    const { tenantId, userId: actorId, role: actorRole } = await requireAdmin();
    const member = await getMemberById(tenantId, memberId);

    if (member.userId === actorId) {
      throw new ForbiddenOperationError("You cannot remove yourself.");
    }

    if (!canManage(actorRole, member.role as TenantRole)) {
      throw new ForbiddenOperationError(
        "You do not have permission to remove this member.",
      );
    }

    const { userId: removedUserId } = await removeMember(
      tenantId,
      memberId,
      actorId,
    );

    // Invalidate all sessions for the removed user.
    await db.delete(session).where(eq(session.userId, removedUserId));

    // Clear user.tenantId since we only support one tenant per user.
    await db
      .update(user)
      .set({ tenantId: null, updatedAt: new Date() })
      .where(eq(user.id, removedUserId));
  });
}

/**
 * Update a member's Better Auth user profile (name, email).
 * Does NOT touch the password — use triggerPasswordResetForMemberAction for that.
 *
 * On email change, all active sessions for the user are invalidated.
 *
 * @param memberId - TenantMember UUID.
 * @role admin
 */
export async function updateMemberProfileAction(
  memberId: string,
  input: unknown,
): Promise<ActionResult<TenantMember>> {
  return actionHandler(async () => {
    const { tenantId, userId: actorId, role: actorRole } = await requireAdmin();
    const data = UpdateMemberProfileSchema.parse(input);

    const member = await getMemberById(tenantId, memberId);

    if (member.userId === actorId) {
      throw new ForbiddenOperationError(
        "Edit your own profile in Configuración → Cuenta.",
      );
    }

    if (!canManage(actorRole, member.role as TenantRole)) {
      throw new ForbiddenOperationError(
        "You do not have permission to edit this member's profile.",
      );
    }

    const updated = await updateMemberProfile(tenantId, memberId, data);

    // Invalidate sessions when email changes (forces re-login with new credentials).
    if (data.email) {
      await db.delete(session).where(eq(session.userId, member.userId));
    }

    return updated;
  });
}

/**
 * Send a password-reset email to a member on behalf of an admin.
 * The user receives a link to /reset-password.
 *
 * @param memberId - TenantMember UUID.
 * @role admin
 */
export async function triggerPasswordResetForMemberAction(
  memberId: string,
): Promise<ActionResult<{ email: string }>> {
  return actionHandler(async () => {
    const { tenantId, userId: actorId, role: actorRole } = await requireAdmin();
    const member = await getMemberById(tenantId, memberId);

    if (member.userId === actorId) {
      throw new ForbiddenOperationError(
        "Use the forgot-password flow from the login page to reset your own password.",
      );
    }

    if (!canManage(actorRole, member.role as TenantRole)) {
      throw new ForbiddenOperationError(
        "You do not have permission to reset this member's password.",
      );
    }

    // Fetch the member's email from the user table.
    const [targetUser] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, member.userId))
      .limit(1);

    if (!targetUser) {
      throw new ValidationError("User account not found.");
    }

    const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

    await auth.api.requestPasswordReset({
      body: {
        email: targetUser.email,
        redirectTo: `${origin}/reset-password`,
      },
    });

    return { email: targetUser.email };
  });
}

/**
 * Check whether the current user's membership is still active.
 * Called by LoginClient after a successful sign-in to catch deactivated/removed
 * members before they reach the dashboard layout.
 *
 * Returns { status: 'ok' } or { status: 'deactivated' }.
 * Never throws — designed to be called without a role guard.
 */
export async function checkOwnMembershipStatusAction(): Promise<
  ActionResult<{ status: "ok" | "deactivated" }>
> {
  return actionHandler(async () => {
    const hdrs = await headers();
    const sessionData = await auth.api.getSession({ headers: hdrs });

    if (!sessionData?.user) {
      return { status: "ok" as const };
    }

    const tenantId = (sessionData.user as { tenantId?: string | null }).tenantId;
    if (!tenantId) {
      return { status: "ok" as const };
    }

    try {
      const member = await getMemberByUserId(tenantId, sessionData.user.id);
      // getMemberByUserId already filters isActive=true and removedAt IS NULL,
      // so reaching here means the membership is valid.
      void member;
      return { status: "ok" as const };
    } catch {
      return { status: "deactivated" as const };
    }
  });
}

/**
 * Create a new user account and immediately add them to the current tenant.
 * Rejects if the email is already registered to any user (prevents multi-tenant membership).
 *
 * @role admin
 */
export async function createAndAddMemberAction(
  input: unknown,
): Promise<ActionResult<TenantMember>> {
  return actionHandler(async () => {
    const { tenantId, role: actorRole } = await requireAdmin();
    const data = CreateAndAddMemberSchema.parse(input);

    if (!canAssignRole(actorRole, data.role as TenantRole)) {
      throw new ForbiddenOperationError(
        `You cannot assign the "${data.role}" role (your role is "${actorRole}").`,
      );
    }

    // Reject if email is already registered in any tenant.
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, data.email.toLowerCase()))
      .limit(1);

    if (existing) {
      throw new ValidationError(
        `An account with email "${data.email}" already exists. ` +
          "Use the email invitation flow to invite existing users.",
      );
    }

    // Create the Better Auth user. tenantId is set after addMember succeeds.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signUpBody = {
      name: data.name,
      email: data.email,
      username: data.username,
      password: data.password,
      tenantId: null,
    } as any;

    const signUpResult = await auth.api.signUpEmail({ body: signUpBody });

    if (!signUpResult?.user?.id) {
      throw new ValidationError(
        "Failed to create user account. The username may already be taken.",
      );
    }

    const newUserId = signUpResult.user.id;

    // Add to tenant — best-effort (no interactive transaction on Neon HTTP).
    const member = await addMember(tenantId, newUserId, {
      role: data.role as TenantRole,
    });

    // Link user to tenant now that membership is confirmed.
    await db
      .update(user)
      .set({ tenantId, updatedAt: new Date() })
      .where(eq(user.id, newUserId));

    return member;
  });
}

/**
 * List all non-removed members of the current tenant.
 *
 * @role admin
 */
export async function listMembersAction(): Promise<
  ActionResult<MemberWithUser[]>
> {
  return actionHandler(async () => {
    const { tenantId } = await requireAdmin();
    return listMembers(tenantId);
  });
}

/**
 * Get a single tenant member by their member ID.
 *
 * @param memberId - TenantMember UUID.
 * @role admin
 */
export async function getMemberAction(
  memberId: string,
): Promise<ActionResult<TenantMember>> {
  return actionHandler(async () => {
    const { tenantId } = await requireAdmin();
    return getMemberById(tenantId, memberId);
  });
}

/**
 * Server Actions — Member Management
 *
 * MASTER-only actions for managing who belongs to the current tenant and
 * what role they hold.
 *
 * Terminology:
 *   member  — a row in `tenant_members` (user + tenant + role association)
 *   user    — a row in the Better Auth `user` table
 *
 * Current limitations (TODO markers):
 *   - Invitations for users not yet in the system are not implemented.
 *     `inviteMemberAction` currently only works for existing users.
 *   - Only one active tenant per user (tenantId stored on the user row).
 *     Multi-tenant support will require extending the session mechanism.
 *
 * All actions are @role master.
 */

"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import {
  actionHandler,
  requireMaster,
  type ActionResult,
  type TenantRole,
} from "@/lib/api";
import {
  addMember,
  getMemberById,
  updateMemberRole,
  deactivateMember,
  listMembers,
} from "@/lib/dal";
import { ValidationError } from "@/lib/dal/errors";
import type { TenantMember, MemberWithUser } from "@/lib/dal";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const TenantRoleSchema = z.enum(["operator", "admin", "master"]);

const InviteMemberSchema = z.object({
  email: z.string().email(),
  role: TenantRoleSchema,
});

const UpdateMemberRoleSchema = z.object({
  role: TenantRoleSchema,
});

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Associate an existing user (by email) with the current tenant and assign
 * them the given role.
 *
 * If the user is not yet registered in the system, this action fails with a
 * descriptive error.
 *
 * TODO: INVITATIONS — when invitation emails are implemented, create a pending
 * invitation row here so the user is automatically added when they sign up.
 *
 * @role master
 */
export async function inviteMemberAction(
  input: unknown,
): Promise<ActionResult<TenantMember>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    const data = InviteMemberSchema.parse(input);

    // Look up the user by email in the Better Auth user table.
    const [found] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, data.email.toLowerCase()))
      .limit(1);

    if (!found) {
      throw new ValidationError(
        `No account found for "${data.email}". ` +
          "The user must register before they can be added to a tenant. " +
          "(TODO: INVITATIONS — send an invitation email instead)",
      );
    }

    return addMember(tenantId, found.id, { role: data.role });
  });
}

/**
 * Change the role of a tenant member.
 *
 * Protections (enforced in the DAL):
 * - Cannot downgrade the last active master.
 *
 * @param memberId - TenantMember UUID.
 * @role master
 */
export async function updateMemberRoleAction(
  memberId: string,
  input: unknown,
): Promise<ActionResult<TenantMember>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    const { role } = UpdateMemberRoleSchema.parse(input);
    return updateMemberRole(tenantId, memberId, role as TenantRole);
  });
}

/**
 * Deactivate a tenant membership (soft delete).
 *
 * Protections (enforced in the DAL):
 * - Cannot deactivate yourself.
 * - Cannot deactivate the last active master.
 *
 * @param memberId - TenantMember UUID.
 * @role master
 */
export async function deactivateMemberAction(
  memberId: string,
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    const { tenantId, userId } = await requireMaster();
    await deactivateMember(tenantId, memberId, userId);
  });
}

/**
 * List all members of the current tenant (active and inactive),
 * enriched with their Better Auth user name and email.
 *
 * @role master
 */
export async function listMembersAction(): Promise<
  ActionResult<MemberWithUser[]>
> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    return listMembers(tenantId);
  });
}

/**
 * Get a single tenant member by their member ID.
 *
 * @param memberId - TenantMember UUID.
 * @role master
 */
export async function getMemberAction(
  memberId: string,
): Promise<ActionResult<TenantMember>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    return getMemberById(tenantId, memberId);
  });
}

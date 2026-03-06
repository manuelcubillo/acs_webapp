/**
 * Members DAL
 *
 * CRUD operations for tenant_members: the association between a user and a
 * tenant with an assigned role (operator | admin | master).
 *
 * Business rules enforced here:
 * - A tenant must always have at least one active master.
 * - A user can only have one membership per tenant (enforced by DB unique constraint).
 */

import { eq, and, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenantMembers, user } from "@/lib/db/schema";
import { NotFoundError, ValidationError } from "./errors";
import type {
  TenantMember,
  TenantRole,
  MemberWithUser,
  AddMemberInput,
} from "./types";

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Check whether a user is an active member of a tenant.
 *
 * @param userId   - Better Auth user ID.
 * @param tenantId - Tenant UUID.
 */
export async function isMemberOfTenant(
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: tenantMembers.id })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.userId, userId),
        eq(tenantMembers.isActive, true),
      ),
    )
    .limit(1);

  return !!row;
}

/**
 * Get a member record by user ID within a tenant.
 *
 * @param tenantId - Tenant UUID.
 * @param userId   - Better Auth user ID.
 * @throws {NotFoundError} If no active membership exists.
 */
export async function getMemberByUserId(
  tenantId: string,
  userId: string,
): Promise<TenantMember> {
  const [row] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.userId, userId),
        eq(tenantMembers.isActive, true),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("TenantMember", `user=${userId} tenant=${tenantId}`);
  }

  return row;
}

/**
 * Get a member record by its own ID within a tenant.
 *
 * @param tenantId - Tenant UUID (for isolation).
 * @param memberId - TenantMember UUID.
 * @throws {NotFoundError} If not found.
 */
export async function getMemberById(
  tenantId: string,
  memberId: string,
): Promise<TenantMember> {
  const [row] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.id, memberId),
        eq(tenantMembers.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("TenantMember", memberId);
  }

  return row;
}

/**
 * List all members (active and inactive) for a tenant, enriched with user info.
 *
 * @param tenantId - Tenant UUID.
 * @returns Members with user name and email, ordered by creation date.
 */
export async function listMembers(tenantId: string): Promise<MemberWithUser[]> {
  const rows = await db
    .select({
      id: tenantMembers.id,
      tenantId: tenantMembers.tenantId,
      userId: tenantMembers.userId,
      role: tenantMembers.role,
      isActive: tenantMembers.isActive,
      createdAt: tenantMembers.createdAt,
      updatedAt: tenantMembers.updatedAt,
      userName: user.name,
      userEmail: user.email,
    })
    .from(tenantMembers)
    .innerJoin(user, eq(tenantMembers.userId, user.id))
    .where(eq(tenantMembers.tenantId, tenantId))
    .orderBy(tenantMembers.createdAt);

  return rows;
}

/**
 * Count active master members in a tenant.
 * Used to enforce the "at least one master" invariant.
 *
 * @param tenantId - Tenant UUID.
 */
export async function countActiveMasters(tenantId: string): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.role, "master"),
        eq(tenantMembers.isActive, true),
      ),
    );

  return total;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Add a user to a tenant with a given role.
 *
 * If a (deactivated) membership already exists, it is reactivated with the
 * new role instead of creating a duplicate.
 *
 * @param tenantId - Tenant UUID.
 * @param userId   - Better Auth user ID.
 * @param input    - Role to assign.
 * @returns The created or reactivated member record.
 */
export async function addMember(
  tenantId: string,
  userId: string,
  input: AddMemberInput,
): Promise<TenantMember> {
  // Check for existing membership (active or inactive).
  const [existing] = await db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.userId, userId),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.isActive) {
      throw new ValidationError(
        `User is already an active member of this tenant with role "${existing.role}".`,
      );
    }

    // Reactivate with the new role.
    const [reactivated] = await db
      .update(tenantMembers)
      .set({ role: input.role, isActive: true, updatedAt: new Date() })
      .where(eq(tenantMembers.id, existing.id))
      .returning();

    return reactivated;
  }

  const [created] = await db
    .insert(tenantMembers)
    .values({ tenantId, userId, role: input.role })
    .returning();

  return created;
}

/**
 * Change the role of a tenant member.
 *
 * Protections:
 * - If the member is currently a master and the role is being downgraded,
 *   ensures at least one other active master remains in the tenant.
 *
 * @param tenantId - Tenant UUID.
 * @param memberId - TenantMember UUID.
 * @param newRole  - The new role to assign.
 * @throws {NotFoundError}   If the member doesn't exist.
 * @throws {ValidationError} If downgrading the last active master.
 */
export async function updateMemberRole(
  tenantId: string,
  memberId: string,
  newRole: TenantRole,
): Promise<TenantMember> {
  const member = await getMemberById(tenantId, memberId);

  // Guard: cannot downgrade the last active master.
  if (member.role === "master" && newRole !== "master") {
    const masterCount = await countActiveMasters(tenantId);
    if (masterCount <= 1) {
      throw new ValidationError(
        "Cannot change the role of the last active master. " +
          "Assign another master first.",
      );
    }
  }

  const [updated] = await db
    .update(tenantMembers)
    .set({ role: newRole, updatedAt: new Date() })
    .where(
      and(
        eq(tenantMembers.id, memberId),
        eq(tenantMembers.tenantId, tenantId),
      ),
    )
    .returning();

  return updated;
}

/**
 * Deactivate a tenant membership (soft delete).
 *
 * Protections:
 * - A master cannot deactivate themselves if they are the last active master.
 *
 * @param tenantId      - Tenant UUID.
 * @param memberId      - TenantMember UUID.
 * @param requesterId   - The userId of the master performing this action
 *                        (to prevent self-deactivation of the last master).
 * @throws {NotFoundError}   If the member doesn't exist.
 * @throws {ValidationError} If this would leave the tenant without a master,
 *                            or if the requester is deactivating themselves
 *                            as the last master.
 */
export async function deactivateMember(
  tenantId: string,
  memberId: string,
  requesterId: string,
): Promise<void> {
  const member = await getMemberById(tenantId, memberId);

  if (!member.isActive) {
    // Already inactive — no-op.
    return;
  }

  // Guard: cannot deactivate yourself.
  if (member.userId === requesterId) {
    throw new ValidationError(
      "You cannot deactivate your own membership.",
    );
  }

  // Guard: cannot remove the last active master.
  if (member.role === "master") {
    const masterCount = await countActiveMasters(tenantId);
    if (masterCount <= 1) {
      throw new ValidationError(
        "Cannot deactivate the last active master. " +
          "Assign another master first.",
      );
    }
  }

  await db
    .update(tenantMembers)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(tenantMembers.id, memberId),
        eq(tenantMembers.tenantId, tenantId),
      ),
    );
}

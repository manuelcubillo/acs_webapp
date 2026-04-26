/**
 * Members DAL
 *
 * CRUD operations for tenant_members: the association between a user and a
 * tenant with an assigned role (operator | admin | master).
 *
 * Business rules enforced here:
 * - A tenant must always have at least one active master.
 * - A user can only have one membership per tenant (enforced by DB unique constraint).
 * - removedAt IS NOT NULL means the member was soft-removed and is hidden from all
 *   default queries. Treat removed members the same as non-members for auth checks.
 */

import { eq, and, count, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenantMembers, user } from "@/lib/db/schema";
import { NotFoundError, ValidationError } from "./errors";
import type {
  TenantMember,
  TenantRole,
  MemberWithUser,
  AddMemberInput,
  UpdateMemberProfileInput,
} from "./types";

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Check whether a user is an active, non-removed member of a tenant.
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
        isNull(tenantMembers.removedAt),
      ),
    )
    .limit(1);

  return !!row;
}

/**
 * Get an active, non-removed member record by user ID within a tenant.
 *
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
        isNull(tenantMembers.removedAt),
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
 * Filters out removed members by default.
 *
 * @throws {NotFoundError} If not found or removed.
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
        isNull(tenantMembers.removedAt),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("TenantMember", memberId);
  }

  return row;
}

/**
 * List all non-removed members for a tenant, enriched with user info.
 * Includes both active and deactivated members (but never removed ones).
 */
export async function listMembers(tenantId: string): Promise<MemberWithUser[]> {
  const rows = await db
    .select({
      id: tenantMembers.id,
      tenantId: tenantMembers.tenantId,
      userId: tenantMembers.userId,
      role: tenantMembers.role,
      isActive: tenantMembers.isActive,
      removedAt: tenantMembers.removedAt,
      createdAt: tenantMembers.createdAt,
      updatedAt: tenantMembers.updatedAt,
      userName: user.name,
      userEmail: user.email,
      userUsername: user.username,
    })
    .from(tenantMembers)
    .innerJoin(user, eq(tenantMembers.userId, user.id))
    .where(
      and(
        eq(tenantMembers.tenantId, tenantId),
        isNull(tenantMembers.removedAt),
      ),
    )
    .orderBy(tenantMembers.createdAt);

  return rows;
}

/**
 * Count active, non-removed master members in a tenant.
 * Used to enforce the "at least one master" invariant.
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
        isNull(tenantMembers.removedAt),
      ),
    );

  return total;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Add a user to a tenant with a given role.
 *
 * If a (deactivated or removed) membership already exists, it is reactivated
 * with the new role instead of creating a duplicate row.
 */
export async function addMember(
  tenantId: string,
  userId: string,
  input: AddMemberInput,
): Promise<TenantMember> {
  // Check for any existing membership (active, inactive, or removed).
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
    if (existing.isActive && existing.removedAt === null) {
      throw new ValidationError(
        `User is already an active member of this tenant with role "${existing.role}".`,
      );
    }

    // Reactivate (covers deactivated AND removed cases).
    const [reactivated] = await db
      .update(tenantMembers)
      .set({
        role: input.role,
        isActive: true,
        removedAt: null,
        updatedAt: new Date(),
      })
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
 * @throws {ValidationError} If downgrading the last active master.
 */
export async function updateMemberRole(
  tenantId: string,
  memberId: string,
  newRole: TenantRole,
): Promise<TenantMember> {
  const member = await getMemberById(tenantId, memberId);

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
 * Deactivate a tenant membership (soft delete via isActive=false).
 *
 * @throws {ValidationError} If deactivating self or last active master.
 */
export async function deactivateMember(
  tenantId: string,
  memberId: string,
  requesterId: string,
): Promise<void> {
  const member = await getMemberById(tenantId, memberId);

  if (!member.isActive) {
    return;
  }

  if (member.userId === requesterId) {
    throw new ValidationError("You cannot deactivate your own membership.");
  }

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

/**
 * Reactivate a previously deactivated tenant membership.
 *
 * @throws {NotFoundError} If the membership doesn't exist or is removed.
 * @throws {ValidationError} If the member is already active.
 */
export async function activateMember(
  tenantId: string,
  memberId: string,
): Promise<TenantMember> {
  const member = await getMemberById(tenantId, memberId);

  if (member.isActive) {
    throw new ValidationError("Member is already active.");
  }

  const [updated] = await db
    .update(tenantMembers)
    .set({ isActive: true, updatedAt: new Date() })
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
 * Soft-remove a tenant membership (sets removedAt + isActive=false).
 *
 * Removed members are hidden from all default queries. This is distinct from
 * deactivation: removed members cannot be reactivated from the UI.
 *
 * @throws {ValidationError} If removing self or last active master.
 */
export async function removeMember(
  tenantId: string,
  memberId: string,
  requesterId: string,
): Promise<{ userId: string }> {
  // Include already-removed lookup to gracefully no-op.
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
    throw new ValidationError("Member not found.");
  }

  if (row.removedAt !== null) {
    // Already removed — no-op.
    return { userId: row.userId };
  }

  if (row.userId === requesterId) {
    throw new ValidationError("You cannot remove yourself.");
  }

  if (row.role === "master" && row.isActive) {
    const masterCount = await countActiveMasters(tenantId);
    if (masterCount <= 1) {
      throw new ValidationError(
        "Cannot remove the last active master. " +
          "Assign another master first.",
      );
    }
  }

  await db
    .update(tenantMembers)
    .set({ isActive: false, removedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(tenantMembers.id, memberId),
        eq(tenantMembers.tenantId, tenantId),
      ),
    );

  return { userId: row.userId };
}

/**
 * Update the Better Auth user profile fields (name, email) for a tenant member.
 *
 * @throws {ValidationError} If the new email is already taken.
 */
export async function updateMemberProfile(
  tenantId: string,
  memberId: string,
  input: UpdateMemberProfileInput,
): Promise<TenantMember> {
  const member = await getMemberById(tenantId, memberId);

  if (input.email && input.email !== undefined) {
    // Reject if email is already taken by another user.
    const [conflict] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, input.email.toLowerCase()))
      .limit(1);

    if (conflict && conflict.id !== member.userId) {
      throw new ValidationError(
        `The email "${input.email}" is already in use by another account.`,
      );
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.email !== undefined) updates.email = input.email.toLowerCase();

  await db
    .update(user)
    .set(updates)
    .where(eq(user.id, member.userId));

  return getMemberById(tenantId, memberId);
}

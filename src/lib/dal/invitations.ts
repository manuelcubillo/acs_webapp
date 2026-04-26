/**
 * Invitations DAL
 *
 * CRUD for member_invitations: pending email invitations that allow new users
 * to join a tenant without an existing account.
 */

import { eq, and, isNull, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { memberInvitations, user } from "@/lib/db/schema";
import { NotFoundError, ValidationError } from "./errors";
import type {
  MemberInvitation,
  InvitationWithInviter,
  CreateInvitationInput,
} from "./types";

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Fetch an invitation by its one-time token regardless of status.
 * The action layer decides whether the status is acceptable.
 *
 * @throws {NotFoundError} If the token does not exist.
 */
export async function getInvitationByToken(
  token: string,
): Promise<MemberInvitation> {
  const [row] = await db
    .select()
    .from(memberInvitations)
    .where(eq(memberInvitations.token, token))
    .limit(1);

  if (!row) {
    throw new NotFoundError("MemberInvitation", `token=${token}`);
  }

  return row;
}

/**
 * List pending (non-accepted, non-revoked, non-expired) invitations for a tenant,
 * enriched with the inviter's name.
 */
export async function listPendingInvitations(
  tenantId: string,
): Promise<InvitationWithInviter[]> {
  const now = new Date();

  const rows = await db
    .select({
      id: memberInvitations.id,
      tenantId: memberInvitations.tenantId,
      email: memberInvitations.email,
      role: memberInvitations.role,
      token: memberInvitations.token,
      invitedByUserId: memberInvitations.invitedByUserId,
      expiresAt: memberInvitations.expiresAt,
      acceptedAt: memberInvitations.acceptedAt,
      revokedAt: memberInvitations.revokedAt,
      createdAt: memberInvitations.createdAt,
      inviterName: user.name,
    })
    .from(memberInvitations)
    .innerJoin(user, eq(memberInvitations.invitedByUserId, user.id))
    .where(
      and(
        eq(memberInvitations.tenantId, tenantId),
        isNull(memberInvitations.acceptedAt),
        isNull(memberInvitations.revokedAt),
        gt(memberInvitations.expiresAt, now),
      ),
    )
    .orderBy(memberInvitations.createdAt);

  return rows;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Create a new member invitation row.
 * Caller is responsible for generating the token and expiry.
 */
export async function createInvitation(
  tenantId: string,
  input: CreateInvitationInput,
): Promise<MemberInvitation> {
  const [created] = await db
    .insert(memberInvitations)
    .values({
      tenantId,
      email: input.email.toLowerCase(),
      role: input.role,
      token: input.token,
      invitedByUserId: input.invitedByUserId,
      expiresAt: input.expiresAt,
    })
    .returning();

  return created;
}

/**
 * Revoke a pending invitation so the link can no longer be accepted.
 *
 * @throws {NotFoundError}   If the invitation doesn't belong to the tenant.
 * @throws {ValidationError} If already accepted or already revoked.
 */
export async function revokeInvitation(
  invitationId: string,
  tenantId: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(memberInvitations)
    .where(
      and(
        eq(memberInvitations.id, invitationId),
        eq(memberInvitations.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("MemberInvitation", invitationId);
  }

  if (row.acceptedAt !== null) {
    throw new ValidationError("Cannot revoke an invitation that has already been accepted.");
  }

  if (row.revokedAt !== null) {
    // Already revoked — no-op.
    return;
  }

  await db
    .update(memberInvitations)
    .set({ revokedAt: new Date() })
    .where(eq(memberInvitations.id, invitationId));
}

/**
 * Mark an invitation as accepted.
 *
 * @throws {ValidationError} If the invitation is expired, revoked, or already accepted.
 */
export async function acceptInvitation(token: string): Promise<MemberInvitation> {
  const invitation = await getInvitationByToken(token);

  if (invitation.acceptedAt !== null) {
    throw new ValidationError("This invitation has already been used.");
  }

  if (invitation.revokedAt !== null) {
    throw new ValidationError("This invitation has been revoked.");
  }

  if (invitation.expiresAt < new Date()) {
    throw new ValidationError("This invitation has expired.");
  }

  const [updated] = await db
    .update(memberInvitations)
    .set({ acceptedAt: new Date() })
    .where(eq(memberInvitations.token, token))
    .returning();

  return updated;
}

/**
 * Check for an existing pending invitation for (tenantId, email).
 * Returns the row if found, null otherwise.
 */
export async function findPendingInvitation(
  tenantId: string,
  email: string,
): Promise<MemberInvitation | null> {
  const now = new Date();

  const [row] = await db
    .select()
    .from(memberInvitations)
    .where(
      and(
        eq(memberInvitations.tenantId, tenantId),
        eq(memberInvitations.email, email.toLowerCase()),
        isNull(memberInvitations.acceptedAt),
        isNull(memberInvitations.revokedAt),
        gt(memberInvitations.expiresAt, now),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Server Actions — Member Invitations
 *
 * Handles the full invitation lifecycle:
 *   1. Admin sends an invitation email (inviteMemberByEmailAction)
 *   2. Invitee opens the link, fills a form, submits (acceptInvitationAction)
 *   3. Admin can revoke pending invitations (revokeInvitationAction)
 *   4. Admin can list pending invitations (listPendingInvitationsAction)
 *
 * The accept action is intentionally guard-free (public route).
 */

"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { actionHandler, requireAdmin, type ActionResult, type TenantRole } from "@/lib/api";
import {
  createInvitation,
  getInvitationByToken,
  listPendingInvitations,
  revokeInvitation,
  acceptInvitation,
  findPendingInvitation,
  addMember,
  getMemberByUserId,
  getTenantById,
} from "@/lib/dal";
import { ValidationError, ForbiddenOperationError } from "@/lib/dal/errors";
import { canAssignRole } from "@/lib/auth/role-hierarchy";
import { sendInvitationEmail } from "@/lib/email/send";
import type { InvitationWithInviter } from "@/lib/dal";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const TenantRoleSchema = z.enum(["operator", "admin", "master"]);

const InviteMemberByEmailSchema = z.object({
  email: z.string().email(),
  role: TenantRoleSchema,
});

const AcceptInvitationSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  username: z.string().min(2).max(50).optional(),
  password: z.string().min(8).max(128).optional(),
});

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Send an invitation email to a new user.
 *
 * Rejects if:
 * - Actor cannot assign the requested role.
 * - A pending (non-revoked, non-accepted, non-expired) invitation already exists
 *   for this (tenantId, email).
 * - The email already belongs to an active member of this tenant.
 *
 * @role admin
 */
export async function inviteMemberByEmailAction(
  input: unknown,
): Promise<ActionResult<{ invitationId: string }>> {
  return actionHandler(async () => {
    const { tenantId, userId: actorId, role: actorRole } = await requireAdmin();
    const data = InviteMemberByEmailSchema.parse(input);
    const email = data.email.toLowerCase();

    if (!canAssignRole(actorRole, data.role as TenantRole)) {
      throw new ForbiddenOperationError(
        `You cannot assign the "${data.role}" role.`,
      );
    }

    // Reject if a pending invitation already exists for this email + tenant.
    const existing = await findPendingInvitation(tenantId, email);
    if (existing) {
      throw new ValidationError(
        `A pending invitation already exists for "${email}". ` +
          "Revoke it before sending a new one.",
      );
    }

    // Reject if the email already belongs to an active member.
    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existingUser) {
      try {
        await getMemberByUserId(tenantId, existingUser.id);
        throw new ValidationError(
          `"${email}" is already an active member of this organization.`,
        );
      } catch (err) {
        // NotFoundError is expected — user exists but isn't an active member.
        if (err instanceof ValidationError) throw err;
      }
    }

    // Generate cryptographically random token (32 hex bytes = 64 chars).
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 days

    const invitation = await createInvitation(tenantId, {
      email,
      role: data.role as TenantRole,
      invitedByUserId: actorId,
      token,
      expiresAt,
    });

    // Fetch tenant name and inviter name for the email.
    const [tenant, inviterRow] = await Promise.all([
      getTenantById(tenantId),
      db.select({ name: user.name }).from(user).where(eq(user.id, actorId)).limit(1),
    ]);

    const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    const acceptUrl = `${origin}/invitations/${token}`;

    await sendInvitationEmail({
      to: email,
      tenantName: tenant.name,
      inviterName: inviterRow[0]?.name ?? "Un administrador",
      role: data.role,
      acceptUrl,
    });

    return { invitationId: invitation.id };
  });
}

/**
 * Revoke a pending invitation (admin action).
 *
 * @param invitationId - UUID of the invitation to revoke.
 * @role admin
 */
export async function revokeInvitationAction(
  invitationId: string,
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    const { tenantId } = await requireAdmin();
    await revokeInvitation(invitationId, tenantId);
  });
}

/**
 * List all pending (non-accepted, non-revoked, non-expired) invitations for the
 * current tenant.
 *
 * @role admin
 */
export async function listPendingInvitationsAction(): Promise<
  ActionResult<InvitationWithInviter[]>
> {
  return actionHandler(async () => {
    const { tenantId } = await requireAdmin();
    return listPendingInvitations(tenantId);
  });
}

/**
 * Accept an invitation and create (or update) the user's membership.
 *
 * Public action — no auth guard required. The token is the authentication.
 *
 * Flow:
 *   a. Re-validate the invitation (status + expiry).
 *   b. If a Better Auth user with that email already exists:
 *      addMember + update user.tenantId if null + mark invitation accepted.
 *   c. Otherwise create the user via auth.api.signUpEmail, then addMember.
 *   d. Mark invitation accepted.
 *
 * Best-effort sequential writes: on post-user-creation failure, do NOT delete
 * the user; return a partial-success state so the user can complete via login.
 *
 * Returns { userCreated } so the client knows whether to show a sign-in step.
 */
export async function acceptInvitationAction(
  input: unknown,
): Promise<ActionResult<{ userCreated: boolean }>> {
  return actionHandler(async () => {
    const data = AcceptInvitationSchema.parse(input);

    const invitation = await getInvitationByToken(data.token);

    if (invitation.acceptedAt !== null) {
      throw new ValidationError("Esta invitación ya ha sido utilizada.");
    }
    if (invitation.revokedAt !== null) {
      throw new ValidationError("Esta invitación ha sido revocada.");
    }
    if (invitation.expiresAt < new Date()) {
      throw new ValidationError("Esta invitación ha expirado.");
    }

    // Check if a Better Auth user already exists with this email.
    const [existingUser] = await db
      .select()
      .from(user)
      .where(eq(user.email, invitation.email))
      .limit(1);

    if (existingUser) {
      // Path B: existing user — just add the membership.
      await addMember(invitation.tenantId, existingUser.id, {
        role: invitation.role,
      });

      // Set user.tenantId if it's still null (single-tenant model).
      if (!existingUser.tenantId) {
        await db
          .update(user)
          .set({ tenantId: invitation.tenantId, updatedAt: new Date() })
          .where(eq(user.id, existingUser.id));
      }

      await acceptInvitation(data.token);

      return { userCreated: false };
    }

    // Path C: new user — create account first.
    if (!data.name || !data.username || !data.password) {
      throw new ValidationError(
        "Nombre, nombre de usuario y contraseña son requeridos para crear una cuenta.",
      );
    }

    // Create the user via Better Auth.
    // tenantId is set to null here and updated after addMember succeeds.
    // The cast is necessary because Better Auth's generated types treat
    // additionalFields as required even when nullable + defaultValue is set.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signUpBody = {
      name: data.name,
      email: invitation.email,
      username: data.username,
      password: data.password,
      tenantId: null,
    } as any;
    const signUpResult = await auth.api.signUpEmail({ body: signUpBody });

    if (!signUpResult?.user) {
      throw new ValidationError(
        "No se pudo crear la cuenta. " +
          "Es posible que el nombre de usuario ya esté en uso.",
      );
    }

    const newUserId = signUpResult.user.id;

    // Best-effort: add member. If this fails, the user exists but lacks membership.
    // The user can try again later via an admin action.
    try {
      await addMember(invitation.tenantId, newUserId, {
        role: invitation.role,
      });

      await db
        .update(user)
        .set({ tenantId: invitation.tenantId, updatedAt: new Date() })
        .where(eq(user.id, newUserId));

      await acceptInvitation(data.token);
    } catch (err) {
      // Partial success — user was created but membership failed.
      // Do NOT delete the user. Return partial error for client to show guidance.
      console.error("[acceptInvitationAction] Post-user-creation failure:", err);
      return { userCreated: true };
    }

    return { userCreated: true };
  });
}

/**
 * API Layer - Authentication & Authorization Helpers
 *
 * Two layers of access control:
 *
 * 1. Authentication  — is the user logged in?
 *    `requireAuth()` — returns { userId } or throws AuthenticationError (401).
 *
 * 2. Authorization — does the user have the right role in this tenant?
 *    Roles are stored in `tenant_members` and are hierarchical:
 *    master > admin > operator
 *
 *    `requireRole(...roles)` — verifies the caller belongs to the session's
 *    tenant with one of the allowed roles. Throws AuthorizationError (403).
 *
 *    Convenience wrappers:
 *    `requireOperator()` — any tenant member (operator | admin | master)
 *    `requireAdmin()`    — admin or master
 *    `requireMaster()`   — master only
 *
 * All functions throw; they never return null/undefined.
 * Import from "@/lib/api" for brevity.
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getMemberByUserId } from "@/lib/dal/members";
import { AuthenticationError, AuthorizationError } from "./errors";
import type { TenantRole } from "@/lib/dal/types";

// ─── Re-export TenantRole so consumers can import it from "@/lib/api" ────────
export type { TenantRole };

// ─── Context types ────────────────────────────────────────────────────────────

/** Minimal context returned by requireAuth() — no tenant info. */
export interface BasicAuthContext {
  /** Better Auth user ID. */
  userId: string;
}

/**
 * Full context returned by requireTenant() / requireRole() / requireOperator()
 * / requireAdmin() / requireMaster().
 */
export interface AuthContext {
  /** Better Auth user ID. */
  userId: string;
  /** Tenant UUID this request operates in. */
  tenantId: string;
  /** The member's role within this tenant. */
  role: TenantRole;
  /** TenantMember row ID (useful for self-checks). */
  memberId: string;
}

// ─── Core helpers ─────────────────────────────────────────────────────────────

/**
 * Verify the caller has an active Better Auth session.
 * Does NOT check tenant membership or role.
 *
 * Use this only for super-admin actions that don't operate on tenant-scoped data
 * (e.g. creating a tenant for a new customer).
 *
 * @throws {AuthenticationError} If there is no valid session.
 */
export async function requireAuth(): Promise<BasicAuthContext> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    throw new AuthenticationError();
  }

  return { userId: session.user.id };
}

/**
 * Verify the caller is logged in AND is an active member of their session's
 * tenant with one of the specified roles.
 *
 * Role lookup is performed against the `tenant_members` table on every call
 * so that role changes take effect immediately without requiring re-login.
 *
 * @param allowedRoles - Whitelist of roles that may proceed.
 * @throws {AuthenticationError}  If there is no valid session.
 * @throws {AuthorizationError}   If the user has no tenant, is not a member,
 *                                 or their role is not in `allowedRoles`.
 */
export async function requireRole(
  ...allowedRoles: TenantRole[]
): Promise<AuthContext> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    throw new AuthenticationError();
  }

  const userId = session.user.id;
  // Tenant comes from the user's session field (set at sign-in / onboarding).
  const tenantId = (session.user as { tenantId?: string | null }).tenantId;

  if (!tenantId) {
    throw new AuthorizationError(
      "Your account is not associated with any tenant",
    );
  }

  // Fetch the live membership record (role may have changed since last login).
  let member;
  try {
    member = await getMemberByUserId(tenantId, userId);
  } catch {
    throw new AuthorizationError(
      "You are not an active member of this tenant",
    );
  }

  if (!allowedRoles.includes(member.role)) {
    const needed = allowedRoles.join(" or ");
    throw new AuthorizationError(
      `You need ${needed} role to perform this action`,
    );
  }

  return {
    userId,
    tenantId,
    role: member.role,
    memberId: member.id,
  };
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

/**
 * Allow any active tenant member (operator | admin | master).
 * Use for read operations and action execution.
 */
export async function requireOperator(): Promise<AuthContext> {
  return requireRole("operator", "admin", "master");
}


/**
 * Allow admin or master.
 * Use for card create / update / delete operations.
 */
export async function requireAdmin(): Promise<AuthContext> {
  return requireRole("admin", "master");
}

/**
 * Allow master only.
 * Use for tenant configuration: card types, field definitions, action definitions,
 * and member management.
 */
export async function requireMaster(): Promise<AuthContext> {
  return requireRole("master");
}

// ─── External API helper ──────────────────────────────────────────────────────

/**
 * Extract the tenant ID from the `x-tenant-id` request header.
 *
 * Used by the external REST API for device / integration authentication.
 * In production this should be replaced by API key / JWT validation.
 *
 * TODO: API_AUTH — implement API key lookup where each key carries a
 * pre-configured role (e.g. "operator" for read-only scanner devices).
 *
 * @throws {AuthenticationError} If the header is absent or empty.
 */
export function getTenantFromHeader(request: Request): string {
  const tenantId = request.headers.get("x-tenant-id");
  if (!tenantId) {
    throw new AuthenticationError("Missing x-tenant-id header");
  }
  return tenantId;
}

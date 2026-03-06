/**
 * API Layer - Authentication Helpers
 *
 * Server-side helpers that extract the current user and tenant from the
 * Better Auth session. Import these at the top of every Server Action and
 * Route Handler that requires authentication.
 *
 * All functions throw `AuthenticationError` (→ 401) when no valid session
 * exists, and `AuthorizationError` (→ 403) when a required field is missing.
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { AuthenticationError, AuthorizationError } from "./errors";

// ─── Session shape ────────────────────────────────────────────────────────────

export interface AuthContext {
  /** Better Auth user ID (string, e.g. "usr_abc123"). */
  userId: string;
  /** Tenant UUID this user belongs to. Null for super-admins or unassigned users. */
  tenantId: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get the current session and return the auth context.
 * Throws `AuthenticationError` if no session exists.
 *
 * @example
 *   const { userId, tenantId } = await requireAuth();
 */
export async function requireAuth(): Promise<AuthContext> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    throw new AuthenticationError();
  }

  return {
    userId: session.user.id,
    // Better Auth stores additionalFields directly on session.user.
    tenantId: (session.user as { tenantId?: string | null }).tenantId ?? null,
  };
}

/**
 * Like `requireAuth()` but additionally enforces that the user has a tenantId.
 * Use this in any action that operates on tenant-scoped data.
 *
 * Throws `AuthorizationError` if the user has no tenant assigned.
 *
 * @example
 *   const { userId, tenantId } = await requireTenant();
 */
export async function requireTenant(): Promise<
  AuthContext & { tenantId: string }
> {
  const ctx = await requireAuth();

  if (!ctx.tenantId) {
    throw new AuthorizationError(
      "Your account is not associated with any tenant",
    );
  }

  return { ...ctx, tenantId: ctx.tenantId };
}

/**
 * Extract the tenant ID from the `x-tenant-id` request header.
 * Used by the external REST API for device/integration authentication.
 *
 * In production this should be replaced by API key / JWT validation.
 * For now it trusts the header value directly (dev-only behaviour).
 *
 * @param request - The incoming `NextRequest`.
 * @throws `AuthenticationError` if the header is absent or empty.
 */
export function getTenantFromHeader(request: Request): string {
  const tenantId = request.headers.get("x-tenant-id");
  if (!tenantId) {
    throw new AuthenticationError(
      "Missing x-tenant-id header",
    );
  }
  return tenantId;
}

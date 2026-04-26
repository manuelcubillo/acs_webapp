/**
 * Role hierarchy helpers.
 *
 * Single source of truth for role ordering and permission checks.
 * Imported by DAL, actions, and UI components so every layer enforces
 * the same rules.
 */

import type { TenantRole } from "@/lib/dal/types";

/** Numeric rank for each role. Higher = more privileged. */
export const ROLE_ORDER: Record<TenantRole, number> = {
  operator: 1,
  admin: 2,
  master: 3,
};

/**
 * Returns true iff the actor's role strictly outranks the target's role.
 * Used to gate edit / deactivate / remove operations.
 */
export function canManage(
  actorRole: TenantRole,
  targetRole: TenantRole,
): boolean {
  return ROLE_ORDER[actorRole] > ROLE_ORDER[targetRole];
}

/**
 * Returns true iff the actor may assign `newRole` to someone.
 * An actor can only assign roles up to and including their own.
 */
export function canAssignRole(
  actorRole: TenantRole,
  newRole: TenantRole,
): boolean {
  return ROLE_ORDER[newRole] <= ROLE_ORDER[actorRole];
}

/**
 * Database-level constants that are not schema definitions.
 *
 * Values here are referenced by BOTH a migration and application code, so they
 * cannot live in only one of the two. Import the constant — never re-inline the
 * literal, or the two copies will drift silently.
 */

/**
 * The sentinel "Sistema" user.
 *
 * A `user` row with no matching `account` row and an unroutable email, seeded by
 * migration `0021_presence_control.sql`. It exists so machine-performed writes
 * have a valid `action_logs.executed_by` FK target while remaining incapable of
 * authenticating (Better Auth has no credential to check without an `account`).
 *
 * `tenant_id` is NULL: the actor is the platform, not any one tenant. It is
 * never a member of anything and never appears in a member list.
 *
 * Nothing writes a log with this actor yet — the scheduled presence auto-close
 * job will be its first consumer.
 */
export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

/** Display name of the sentinel user, as seeded. */
export const SYSTEM_USER_NAME = "Sistema";

/**
 * Presence control — the identifiers of the rows the server provisions.
 *
 * These are matched on by `provisioning.ts` to make enable/disable idempotent
 * and to find a previously-retired row instead of creating a duplicate. Changing
 * one orphans every row already provisioned under the old value, so treat them
 * as persisted data, not as labels.
 */

/**
 * Internal `name` of the boolean field that holds "is inside the facility".
 *
 * The `__` prefix is collision avoidance only — `is_system = true` is the actual
 * mechanism that keeps it out of configuration surfaces. A tenant that happens
 * to name a field `__presence` by hand does not become a presence field.
 */
export const PRESENCE_FIELD_NAME = "__presence";

/** What the operator sees on the presence switch. */
export const PRESENCE_FIELD_LABEL = "Dentro";

/** Display name of the auto-executed toggle action. */
export const PRESENCE_ACTION_NAME = "Presencia";

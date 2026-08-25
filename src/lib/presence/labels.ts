/**
 * Operator-facing presence labels.
 *
 * Four surfaces render "Entrada" / "Salida": the history table, the history CSV
 * export, the feed's grouped badge, and `PresenceControl`. Deriving the label
 * in four places guarantees they drift — one of them ends up saying "Entrada"
 * for a value the others call "Salida" — so it is derived exactly once, here.
 *
 * Dependency-free: imported by server DAL code, Server Actions and client
 * components alike.
 *
 * Strings are Spanish and are NOT i18n-wrapped; i18n is explicitly out of
 * scope. When it lands, this module is the single place that changes.
 */

/** The two directions a presence toggle can settle on. */
export type PresenceDirection = "Entrada" | "Salida";

export const PRESENCE_ENTRY_LABEL = "Entrada" as const;
export const PRESENCE_EXIT_LABEL = "Salida" as const;

/**
 * The direction label for the value a presence toggle settled on.
 *
 * @param afterValue - The target field's value AFTER the toggle. `true` means
 *                     the card is now inside.
 * @returns "Entrada" when now inside, "Salida" when now outside.
 */
export function presenceDirectionLabel(afterValue: boolean): PresenceDirection {
  return afterValue ? PRESENCE_ENTRY_LABEL : PRESENCE_EXIT_LABEL;
}

/**
 * Label for the history filter dropdown's single presence option.
 *
 * Deliberately ONE option filtering by `action_definition_id`, not two
 * direction filters: splitting it would mean filtering on jsonb and adding a
 * filter dimension across the URL keys, the Zod schema, `buildWhere` and
 * `sanitizeHistoryQuery`.
 */
export const PRESENCE_FILTER_LABEL = `${PRESENCE_ENTRY_LABEL} / ${PRESENCE_EXIT_LABEL}`;

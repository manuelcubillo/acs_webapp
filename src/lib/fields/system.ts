/**
 * System-row filters.
 *
 * `is_system = true` marks a row that server-side feature code provisioned and
 * owns — a field or action nobody chose and nobody may edit. Presence control
 * is the first consumer, but the mechanism is general.
 *
 * ## Why this lives at the consumer, not in the DAL
 *
 * The obvious move is to filter inside `getCardTypeWithFullSchema` and be done.
 * That would be wrong: the same function feeds the wizard (must hide system
 * rows) AND the scan pipeline (must run the system toggle). A DAL read that
 * silently drops rows makes the second caller's requirement unexpressible, and
 * the failure is invisible — a scan that quietly stops toggling.
 *
 * So the DAL reads stay the unfiltered source of truth and each call site
 * declares its own intent by calling one of these. Grep for these names to
 * enumerate every surface that has made that declaration.
 *
 * Deliberately dependency-free: importable from server components, Server
 * Actions and client components alike.
 */

/**
 * Drop server-provisioned field definitions.
 *
 * Apply to anything a user picks from, edits, or fills in: the card form, the
 * wizard's field step, summary / grid pickers, filter builders, design field
 * bindings, and any list of a card's values.
 *
 * Do NOT apply to the presence DAL or to a read whose purpose is to operate on
 * the system field itself.
 */
export function excludeSystemFields<T extends { isSystem: boolean }>(
  rows: T[],
): T[] {
  return rows.filter((row) => !row.isSystem);
}

/**
 * Drop server-provisioned action definitions.
 *
 * Apply to the wizard's action step and any other action-configuration surface.
 *
 * Do NOT apply to `getAutoExecuteActions` or the scan pipeline — the system
 * toggle MUST run — nor to the operator's action controls, which gate on
 * `is_operator_visible` instead. A system action can be both invisible to
 * configuration and visible as a control; that is exactly what presence is.
 */
export function excludeSystemActions<T extends { isSystem: boolean }>(
  rows: T[],
): T[] {
  return rows.filter((row) => !row.isSystem);
}

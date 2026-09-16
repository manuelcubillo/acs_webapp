/**
 * SQL fragments for matching a `field_values` row's text content.
 *
 * Shared by the two filter builders that exist — `buildFieldFilterCondition`
 * (`cards.ts`, the card list) and `buildFieldFilterSQL` (`action-history.ts`,
 * `/history`). They differ only in how they correlate the subquery to the outer
 * row, so the value predicate itself belongs in one place: the last time these
 * two derived the same idea independently, one of them was wrong for months.
 *
 * ## Why a select needs two columns
 *
 * A `select` field stores a single option in `value_text` and several in
 * `value_json` (a jsonb array of strings) — see `mapValueToColumn`. A text
 * filter must therefore look in both, or a card whose only match is one of its
 * multiple selections would silently drop out of a filtered list.
 *
 * `jsonb_array_elements_text` is guarded by `jsonb_typeof(...) = 'array'`
 * because `value_json` is also the fallback column for any future field type,
 * and the function errors on a non-array. The guard makes a non-array simply
 * not match.
 *
 * The jsonb containment operator `?` is deliberately NOT used: a bare `?` in a
 * SQL string is a placeholder in several drivers, and this query text passes
 * through Drizzle to the Neon HTTP driver.
 */

import { sql, type SQL } from "drizzle-orm";

/**
 * Match `pattern` (an ILIKE pattern) against a field value's text content,
 * including every element of a multi-select array.
 *
 * @param pattern - An ILIKE pattern, already escaped by the caller.
 */
export function fieldValueTextIlike(pattern: string): SQL {
  return sql`(fv.value_text ILIKE ${pattern} OR (jsonb_typeof(fv.value_json) = 'array' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(fv.value_json) AS opt WHERE opt ILIKE ${pattern}
  )))`;
}

/**
 * Match a field value's text content exactly, including a multi-select array
 * that CONTAINS the value.
 *
 * Containment rather than equality is the useful reading for a multi-select:
 * "cards whose Zona includes Lisboa", not "cards whose Zona is exactly
 * [Lisboa]".
 *
 * @param value - The exact string to match.
 */
export function fieldValueTextEquals(value: string): SQL {
  return sql`(fv.value_text = ${value} OR (jsonb_typeof(fv.value_json) = 'array' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(fv.value_json) AS opt WHERE opt = ${value}
  )))`;
}

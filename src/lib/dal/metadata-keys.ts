/**
 * Well-known keys inside `action_logs.metadata`.
 *
 * `metadata` is untyped jsonb written by several producers, so any key that
 * more than one layer reads is declared here rather than spelled out inline at
 * each site — a typo in a string literal fails silently, as a row that simply
 * never matches.
 *
 * ⚠️ The column has two naming conventions, for historical reasons:
 * `executeAction` writes snake_case (`action_type`, `before_value`,
 * `after_value`, `operator_override`), while the scan pipeline writes camelCase
 * (`method`, `cardCode`). New keys added here follow the camelCase side, which
 * is what the scan row already uses. Nothing normalises the existing rows.
 */

/**
 * Correlates an auto-action row with the scan that caused it.
 *
 * Present on every `action` row executed as part of one operational scan —
 * including the ones a resumed override run executes, which carry the id of the
 * ORIGINAL scan so a paused-then-resumed scan stays one group.
 *
 * **Absent on manual actions**, and that absence is the definition: a row with
 * no `scanLogId` was not caused by a scan. Also absent on every row written
 * before 2026-08-25 — there is no backfill, so historical rows never group.
 */
export const SCAN_LOG_ID_METADATA_KEY = "scanLogId";

/** Value the target field settled on. Written by `executeAction` (snake_case). */
export const AFTER_VALUE_METADATA_KEY = "after_value";

/**
 * Read `scanLogId` out of a log row's metadata.
 *
 * @returns The scan log's UUID, or null when the row is not scan-correlated.
 */
export function readScanLogId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[SCAN_LOG_ID_METADATA_KEY];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Read the boolean value an action settled its target field on.
 *
 * Returns null for anything that is not a boolean — a numeric counter's
 * `after_value`, a missing key, or a row written by a producer that does not
 * record one. Callers use it only on rows already known to be presence rows.
 */
export function readBooleanAfterValue(metadata: unknown): boolean | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[AFTER_VALUE_METADATA_KEY];
  return typeof value === "boolean" ? value : null;
}

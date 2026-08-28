/**
 * Rendering one snapshot change as the `/history` Detail column shows it.
 *
 * PURE and dependency-free, because the table (client) and the CSV export
 * (server) must not disagree about what an event says it did. The export has
 * been quietly diverging from the table before — see the `presenceDirectionLabel`
 * note in `src/lib/presence/labels.ts` — so both call this.
 *
 * Spanish, and not i18n-wrapped: i18n is out of scope project-wide. When it
 * lands, this module is the single place that changes.
 */

import {
  SNAPSHOT_CARD_TYPE_FIELD_ID,
  SNAPSHOT_CODE_FIELD_ID,
  type SnapshotFieldChange,
} from "@/lib/snapshots/diff";

export const DETAIL_TEXT = {
  EMPTY: "—",
  YES: "Sí",
  NO: "No",
  ARROW: "→",
  /** A photo change never prints its object key — see `formatChange`. */
  PHOTO_ADDED: "foto añadida",
  PHOTO_REMOVED: "foto eliminada",
  PHOTO_REPLACED: "foto actualizada",
} as const;

/** How many changes a row shows before collapsing the rest behind a "+N". */
export const MAX_INLINE_CHANGES = 3;

/**
 * One frozen value as text.
 *
 * `null` prints as an em dash, which is how every other cell in this table
 * prints an absent value. An empty string prints as an em dash too — visually
 * identical, but the two are never CONFLATED upstream: `diffSnapshots` reports
 * `null → ""` as a real change, so the row appears at all.
 */
export function formatSnapshotValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return DETAIL_TEXT.EMPTY;
  if (typeof value === "boolean") return value ? DETAIL_TEXT.YES : DETAIL_TEXT.NO;
  return String(value);
}

/**
 * One change as a single line: `Etiqueta: antes → después`.
 *
 * A `photo` change is worded instead of arrowed. Its payload value is a storage
 * object key, which must never reach the browser and would be meaningless in a
 * cell anyway; `diffSnapshots` output is reduced to a presence flag before it
 * gets here, so all this can say is whether an image arrived, left, or changed.
 *
 * @param change - One entry from `diffSnapshots`.
 * @returns The line, identical in the table and in the CSV.
 */
export function formatChange(change: SnapshotFieldChange): string {
  if (change.type === "photo") {
    const had = change.before === true;
    const has = change.after === true;
    const word = !had && has
      ? DETAIL_TEXT.PHOTO_ADDED
      : had && !has
        ? DETAIL_TEXT.PHOTO_REMOVED
        : DETAIL_TEXT.PHOTO_REPLACED;
    return `${change.label}: ${word}`;
  }

  return (
    `${change.label}: ${formatSnapshotValue(change.before)}` +
    ` ${DETAIL_TEXT.ARROW} ${formatSnapshotValue(change.after)}`
  );
}

/**
 * Every change for one CSV cell, one per line.
 *
 * Newline-separated rather than comma-separated so the cell stays parseable:
 * `buildCsvFromEntries` quotes and doubles-up any cell containing a newline, so
 * a multi-line cell round-trips through a spreadsheet as one cell. Commas would
 * be quoted too, but would then be indistinguishable from a value that itself
 * contains a comma.
 *
 * @param changes - Already filtered by the caller (system fields dropped).
 * @returns One line per change, or an em dash when there are none.
 */
export function formatChangeForExport(changes: SnapshotFieldChange[]): string {
  if (changes.length === 0) return DETAIL_TEXT.EMPTY;
  return changes.map(formatChange).join("\n");
}

// ─── Ordering ────────────────────────────────────────────────────────────────

/** The two synthetic entries are card identity and always lead. */
const IDENTITY_FIRST = new Set<string>([
  SNAPSHOT_CODE_FIELD_ID,
  SNAPSHOT_CARD_TYPE_FIELD_ID,
]);

/**
 * Order changes the way a reader scans them.
 *
 * `diffSnapshots` returns them in the payload's own field order — and the
 * payload is sorted by `fieldDefinitionId` because the content hash has to be
 * reproducible (see `payload.ts`). UUID order is deterministic but arbitrary to
 * a human, and it decides WHICH three changes a row shows before the "+N", so
 * it cannot be what reaches the screen.
 *
 * Identity first (a code change is what an auditor looks for), then by label,
 * with the field id breaking ties so the order is still total.
 *
 * @param changes - Already filtered by the caller.
 * @returns A new array; the input is not mutated.
 */
export function orderChangesForDisplay(
  changes: SnapshotFieldChange[],
): SnapshotFieldChange[] {
  return [...changes].sort((a, b) => {
    const aIdentity = IDENTITY_FIRST.has(a.fieldDefinitionId);
    const bIdentity = IDENTITY_FIRST.has(b.fieldDefinitionId);
    if (aIdentity !== bIdentity) return aIdentity ? -1 : 1;

    const byLabel = a.label.localeCompare(b.label, "es");
    if (byLabel !== 0) return byLabel;
    return a.fieldDefinitionId < b.fieldDefinitionId ? -1 : 1;
  });
}

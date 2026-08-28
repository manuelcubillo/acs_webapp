/**
 * `diffSnapshots` — field-level differences between two snapshot payloads.
 *
 * This is what the `/history` Detail column renders. Pure: no database, no
 * React, no `node:crypto`, so it is unit-testable in isolation and safe to
 * import from a client component.
 *
 * ## What counts as a change
 *
 * VALUES only. A field whose label was renamed but whose value is unchanged is
 * NOT a change: renaming a field definition does not create a snapshot, so the
 * rename folds into whatever event happens to version the card next, and
 * attributing it to that event would be a lie. When the labels differ, the
 * NEWER one is reported — it is the one the operator recognises.
 *
 * ## The rule that matters most
 *
 * `previous === null` returns an empty array. A V0 snapshot is the lazy
 * bootstrap of a card that predates migration 0022 (see `ensureCardSnapshot`),
 * not a change to it. Without this rule the first scan of every card in the
 * current database would render as "12 fields changed".
 *
 * See ADR docs/context/decisions/2026-08-28-card-snapshots-read-path.md.
 */

import type { FieldType } from "@/lib/dal/types";
import type {
  CardSnapshotField,
  CardSnapshotPayload,
  CardSnapshotValue,
} from "./payload";

/** One field's value before and after, as the Detail column renders it. */
export interface SnapshotFieldChange {
  /**
   * The field definition's UUID, or one of the synthetic ids below for the two
   * payload keys that are card identity rather than a field.
   */
  fieldDefinitionId: string;
  /** The NEWER label — see the module docblock. */
  label: string;
  type: FieldType;
  /**
   * Whether this is a server-provisioned field. Reported, never filtered here:
   * dropping system fields is a PRESENTATION decision (`excludeSystemFields`),
   * and a pure function that silently drops rows makes the other caller's
   * requirement unexpressible. Same reasoning as `src/lib/fields/system.ts`.
   */
  isSystem: boolean;
  before: CardSnapshotValue | null;
  after: CardSnapshotValue | null;
}

// ─── Synthetic ids for the non-field payload keys ────────────────────────────
//
// `code` and `cardTypeName` are frozen in the payload but are not field
// definitions, so they need ids that cannot collide with a UUID. A code change
// MUST be visible in the Detail column — it is the card's public identifier and
// `updateCardCode` writes a `card_edit` row precisely so it can be audited.

export const SNAPSHOT_CODE_FIELD_ID = "__code";
export const SNAPSHOT_CARD_TYPE_FIELD_ID = "__cardType";

/** Operator-facing labels for the two synthetic entries. Spanish, like the UI. */
export const SNAPSHOT_CODE_LABEL = "Código";
export const SNAPSHOT_CARD_TYPE_LABEL = "Tipo de carnet";

// ─── Implementation ──────────────────────────────────────────────────────────

function indexByFieldId(
  payload: CardSnapshotPayload,
): Map<string, CardSnapshotField> {
  return new Map(payload.fields.map((f) => [f.fieldDefinitionId, f]));
}

/**
 * Differences between two snapshots of one card, ordered for display.
 *
 * Order: the card's identity keys first (code, then card type), then the fields
 * in `current`'s own order, then any field that exists only in `previous` —
 * which can only happen across a card-type schema change, since A1 guarantees a
 * valueless field is present with `value: null` rather than omitted.
 *
 * @param previous - The snapshot in force before the event, or null when this
 *                   is the card's first snapshot (a V0 bootstrap).
 * @param current  - The snapshot the event produced.
 * @returns One entry per changed value. Empty when nothing changed.
 */
export function diffSnapshots(
  previous: CardSnapshotPayload | null,
  current: CardSnapshotPayload,
): SnapshotFieldChange[] {
  // A card's first snapshot describes a state, not a transition.
  if (!previous) return [];

  const changes: SnapshotFieldChange[] = [];

  if (previous.code !== current.code) {
    changes.push({
      fieldDefinitionId: SNAPSHOT_CODE_FIELD_ID,
      label: SNAPSHOT_CODE_LABEL,
      type: "text",
      // Not a system field: a code change is exactly what an auditor looks for,
      // so it must survive `excludeSystemFields` at render time.
      isSystem: false,
      before: previous.code,
      after: current.code,
    });
  }

  if (previous.cardTypeName !== current.cardTypeName) {
    changes.push({
      fieldDefinitionId: SNAPSHOT_CARD_TYPE_FIELD_ID,
      label: SNAPSHOT_CARD_TYPE_LABEL,
      type: "text",
      isSystem: false,
      before: previous.cardTypeName,
      after: current.cardTypeName,
    });
  }

  const prevByFieldId = indexByFieldId(previous);

  for (const field of current.fields) {
    const before = prevByFieldId.get(field.fieldDefinitionId);
    // Absent in `previous` → a change FROM null. `null` and `""` are compared
    // with `!==`, never coerced: the field engine treats them differently and
    // the audit trail must not smooth that over.
    const beforeValue = before ? before.value : null;
    if (beforeValue === field.value) continue;

    changes.push({
      fieldDefinitionId: field.fieldDefinitionId,
      // The newer label, whether or not the field was renamed.
      label: field.label,
      type: field.type,
      isSystem: field.isSystem,
      before: beforeValue,
      after: field.value,
    });
  }

  // Fields that disappeared from the card type. Reported as a change TO null so
  // an auditor sees the value stop existing rather than the row going quiet.
  const currentFieldIds = new Set(current.fields.map((f) => f.fieldDefinitionId));
  for (const field of previous.fields) {
    if (currentFieldIds.has(field.fieldDefinitionId)) continue;
    if (field.value === null) continue;

    changes.push({
      fieldDefinitionId: field.fieldDefinitionId,
      // No newer label exists, so the older one is the only one there is.
      label: field.label,
      type: field.type,
      isSystem: field.isSystem,
      before: field.value,
      after: null,
    });
  }

  return changes;
}

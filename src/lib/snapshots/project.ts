/**
 * Projecting a frozen payload into the fields a surface renders.
 *
 * PURE — no database, no React, no `node:crypto`. That is load-bearing: the
 * activity feed is built twice, once by `getActivityFeed` on the server and
 * once by `src/lib/dashboard/feed-entries.ts` on the client, and both call
 * `projectSnapshotFields`. The last time those two derived a display value
 * independently, one produced a row labelled "Presencia" where the other said
 * "Entrada". A shared pure function is the only structural defence.
 *
 * See ADR docs/context/decisions/2026-08-28-card-snapshots-read-path.md.
 */

import type { FieldType } from "@/lib/dal/types";
import type { CardSnapshotPayload } from "./payload";

/** One configured summary field, as both surfaces already load it. */
export interface SummaryFieldConfig {
  fieldDefinitionId: string;
  label: string;
  fieldType: FieldType;
}

/** One field as a row renders it. Matches both surfaces' summary-field type. */
export interface DisplayField {
  fieldDefinitionId: string;
  label: string;
  fieldType: FieldType;
  /**
   * The frozen value. For a `photo` field this is a boolean presence flag,
   * never the object key: the thumbnail is addressed by route from the card
   * code plus the field id, exactly as the live path does it. See ADR
   * `2026-08-02-card-list-photos-stable-route.md`.
   */
  value: unknown;
}

/**
 * Project a frozen payload through a surface's CURRENT summary-field config.
 *
 * Which fields a surface displays comes from the configuration as it is today;
 * the values and the labels come from the payload. A summary field added this
 * morning therefore populates correctly for a row from last year, while the
 * values stay those of the moment the row was written.
 *
 * Matched by field definition id. A configured field that is absent from the
 * payload is OMITTED rather than rendered blank — its absence means the card
 * type did not have that field when the row was written, which is not the same
 * statement as "it was empty".
 *
 * @param payload - The frozen card state.
 * @param config  - The surface's ordered summary-field configuration.
 * @returns Display fields in configuration order.
 */
export function projectSnapshotFields(
  payload: CardSnapshotPayload,
  config: SummaryFieldConfig[],
): DisplayField[] {
  const byFieldId = new Map(
    payload.fields.map((f) => [f.fieldDefinitionId, f]),
  );

  const out: DisplayField[] = [];
  for (const def of config) {
    const frozen = byFieldId.get(def.fieldDefinitionId);
    if (!frozen) continue;

    out.push({
      fieldDefinitionId: def.fieldDefinitionId,
      // The label AS IT WAS. The config's label is today's; using it would
      // relabel a historical value with a name it never had.
      label: frozen.label,
      fieldType: def.fieldType,
      value:
        def.fieldType === "photo"
          ? typeof frozen.value === "string" && frozen.value.length > 0
          : frozen.value,
    });
  }

  return out;
}

// ─── Crossing to the client ──────────────────────────────────────────────────

/**
 * Strip a payload's `photo` values before it leaves the server.
 *
 * A photo's stored value is a storage OBJECT KEY. This codebase deliberately
 * keeps those keys server-side — the browser addresses an image through
 * `/api/photos/cards/[code]`, which signs per request (ADR
 * `2026-08-02-card-list-photos-stable-route.md`). A payload handed to the feed
 * builder would otherwise carry one key per photo field.
 *
 * Nothing on the client needs them: `projectSnapshotFields` reduces a photo to
 * a presence flag, and the feed's summary-field config contains no photo fields
 * at all. The field entry is kept with `value: null` rather than dropped so the
 * payload's shape is unchanged.
 *
 * The returned payload MUST NOT be re-hashed — its hash no longer matches the
 * stored one. Nothing on the client hashes a snapshot.
 *
 * @param payload - A payload as stored.
 * @returns The same payload with every `photo` value replaced by null.
 */
export function sanitizePayloadForClient(
  payload: CardSnapshotPayload,
): CardSnapshotPayload {
  return {
    ...payload,
    fields: payload.fields.map((f) =>
      f.type === "photo" ? { ...f, value: null } : f,
    ),
  };
}

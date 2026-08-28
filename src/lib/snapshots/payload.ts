/**
 * Card snapshot payload — construction and canonical hashing.
 *
 * A snapshot payload is the frozen, self-contained description of one card's
 * complete field state at one moment. It is what makes `/history` and the
 * activity feed stop mutating retroactively: a log row points at the snapshot
 * that was in force when it was written, so renaming a field, editing a value
 * or renaming the card type never rewrites what an old row says happened.
 *
 * ## Purity
 *
 * No database and no React dependency, so the shape and the hash can be
 * unit-tested in isolation — same precedent as
 * `src/lib/dashboard/active-zone-layout.ts`. It does use `node:crypto`, which
 * makes it server-only; nothing on the client has any reason to hash a
 * snapshot.
 *
 * ## The hash is a contract, not a formatting choice
 *
 * `contentHash` is what deduplicates snapshots (see `ensure-snapshot.ts`), so
 * two independent constructions of the same state MUST produce the same bytes.
 * Three things are therefore load-bearing and must not be "tidied":
 *
 *   1. `fields` is sorted ascending by `fieldDefinitionId`, with a plain
 *      codepoint comparison — never `localeCompare`, which is locale-dependent.
 *   2. Every object's keys are emitted in one fixed order, rebuilt by
 *      `canonicalizePayload` rather than trusted from the caller, so a payload
 *      read back out of jsonb hashes identically to the one that was written.
 *   3. A field with no value row is present with `value: null`, never omitted.
 *      "Emptied" and "absent" have to stay distinguishable or a diff between
 *      two snapshots cannot tell them apart.
 *
 * See ADR docs/context/decisions/2026-08-28-card-snapshots-write-path.md.
 */

import { createHash } from "node:crypto";
import type { FieldType } from "@/lib/dal/types";

/**
 * Payload schema version, carried inside the payload itself.
 *
 * Versioned from day one because snapshots are immutable and long-lived: rows
 * written under v1 will still be read after the shape changes, and a reader
 * that cannot tell which shape it is holding has to guess.
 */
export const CARD_SNAPSHOT_PAYLOAD_VERSION = 1;

/** A value as frozen into a snapshot. Always a JSON scalar. */
export type CardSnapshotValue = string | number | boolean | null;

/** One field definition and the value the card held for it. */
export interface CardSnapshotField {
  fieldDefinitionId: string;
  /** `field_definitions.name` (internal identifier) AT THIS MOMENT. */
  name: string;
  /** `field_definitions.label` (what every read surface displays) AT THIS MOMENT. */
  label: string;
  type: FieldType;
  isSystem: boolean;
  /** Null when the card has no value row for this field. */
  value: CardSnapshotValue;
}

/** The frozen state of one card. */
export interface CardSnapshotPayload {
  v: number;
  code: string;
  cardTypeId: string;
  cardTypeName: string;
  fields: CardSnapshotField[];
}

/** One field definition plus the card's raw value for it, as read from the DB. */
export interface CardSnapshotFieldInput {
  fieldDefinitionId: string;
  name: string;
  label: string;
  type: FieldType;
  isSystem: boolean;
  /**
   * The raw value, pre-serialisation: whatever `extractValue` returned, or
   * null/undefined when the card has no `field_values` row for this field.
   */
  value: unknown;
}

/** Everything needed to freeze a card's state. */
export interface CardSnapshotSource {
  code: string;
  cardTypeId: string;
  cardTypeName: string;
  /**
   * EVERY field definition attached to the card type — system ones and
   * soft-deleted (`is_active = false`) ones included. Order is irrelevant; the
   * builder sorts.
   */
  fields: CardSnapshotFieldInput[];
}

// ─── Value serialisation ─────────────────────────────────────────────────────

/**
 * Reduce a raw field value to the JSON scalar the payload stores.
 *
 * Per type:
 *   - `date`            → ISO 8601 string (`Date` and date-strings both accepted)
 *   - `photo`           → the storage OBJECT KEY, verbatim. Never a URL, never a
 *                         signed URL. Snapshots do not resolve, sign or copy
 *                         images; A2 addresses a historical photo by key.
 *   - `text` / `select` → the string
 *   - `number`          → the number, but a non-finite one degrades to null
 *                         (JSON has no NaN / Infinity, so leaving it would make
 *                         the payload and its hash disagree after a round trip)
 *   - `boolean`         → the boolean
 *
 * Anything that does not match its declared type is serialised rather than
 * dropped: a value the payload cannot represent must still change the hash when
 * it changes, or an edit would silently look like a no-op.
 */
function serializeValue(type: FieldType, value: unknown): CardSnapshotValue {
  if (value === null || value === undefined) return null;

  switch (type) {
    case "date": {
      const date = value instanceof Date ? value : new Date(String(value));
      return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
    }
    case "number": {
      if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
      }
      break;
    }
    case "boolean": {
      if (typeof value === "boolean") return value;
      break;
    }
    case "text":
    case "select":
    case "photo": {
      if (typeof value === "string") return value;
      break;
    }
  }

  // Off-type or a future field type with no scalar form. Keep it hashable.
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return JSON.stringify(value) ?? null;
}

/**
 * Order two field definition ids by codepoint.
 *
 * Deliberately NOT `localeCompare`: its result depends on the runtime's locale
 * and ICU build, which would make the hash environment-dependent.
 */
function byFieldDefinitionId(a: CardSnapshotField, b: CardSnapshotField): number {
  if (a.fieldDefinitionId < b.fieldDefinitionId) return -1;
  if (a.fieldDefinitionId > b.fieldDefinitionId) return 1;
  return 0;
}

// ─── Construction ────────────────────────────────────────────────────────────

/**
 * Build the canonical payload for a card's current field state.
 *
 * @param source - The card's identity plus every field definition of its card
 *                 type, each with the card's raw value (or null / undefined
 *                 when it has no value row).
 * @returns The payload, fields sorted and keys in canonical order.
 */
export function buildCardSnapshotPayload(
  source: CardSnapshotSource,
): CardSnapshotPayload {
  const fields = source.fields
    .map(
      (f): CardSnapshotField => ({
        fieldDefinitionId: f.fieldDefinitionId,
        name: f.name,
        label: f.label,
        type: f.type,
        isSystem: f.isSystem,
        value: serializeValue(f.type, f.value),
      }),
    )
    .sort(byFieldDefinitionId);

  return {
    v: CARD_SNAPSHOT_PAYLOAD_VERSION,
    code: source.code,
    cardTypeId: source.cardTypeId,
    cardTypeName: source.cardTypeName,
    fields,
  };
}

// ─── Hashing ─────────────────────────────────────────────────────────────────

/**
 * Rebuild a payload with keys in the canonical order.
 *
 * The hash is defined over this shape, not over whatever key order the input
 * object happens to carry — which is what lets a payload read back out of jsonb
 * hash identically to the one that was written.
 */
function canonicalizePayload(payload: CardSnapshotPayload): CardSnapshotPayload {
  return {
    v: payload.v,
    code: payload.code,
    cardTypeId: payload.cardTypeId,
    cardTypeName: payload.cardTypeName,
    fields: [...payload.fields]
      .map((f) => ({
        fieldDefinitionId: f.fieldDefinitionId,
        name: f.name,
        label: f.label,
        type: f.type,
        isSystem: f.isSystem,
        value: f.value,
      }))
      .sort(byFieldDefinitionId),
  };
}

/**
 * The exact bytes the hash is taken over. Exported for tests and debugging.
 */
export function canonicalPayloadJson(payload: CardSnapshotPayload): string {
  return JSON.stringify(canonicalizePayload(payload));
}

/**
 * sha256 (hex) of the canonical JSON serialization of a payload.
 *
 * Node's `crypto`, deliberately — not pgcrypto, which would mean adding a
 * database extension to compute something the application already holds.
 */
export function hashCardSnapshotPayload(payload: CardSnapshotPayload): string {
  return createHash("sha256").update(canonicalPayloadJson(payload)).digest("hex");
}

/** Build a payload and its hash in one step — what every writer wants. */
export function buildCardSnapshot(source: CardSnapshotSource): {
  payload: CardSnapshotPayload;
  contentHash: string;
} {
  const payload = buildCardSnapshotPayload(source);
  return { payload, contentHash: hashCardSnapshotPayload(payload) };
}

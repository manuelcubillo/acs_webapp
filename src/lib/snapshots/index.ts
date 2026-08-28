/**
 * Card snapshots — barrel export.
 *
 * An immutable, content-deduplicated copy of a card's full field state.
 * `action_logs` rows point at the snapshot in force when they were written, so
 * an audit row stops meaning something different every time the card is edited.
 *
 * A2 added the read path: `loadSnapshotsForLogRows` resolves a page of log
 * rows' snapshots in one query, `projectSnapshotFields` turns a payload into
 * the fields a surface renders, and `diffSnapshots` produces the `/history`
 * Detail column.
 *
 * See ADRs `docs/context/decisions/2026-08-28-card-snapshots-write-path.md`
 * and `docs/context/decisions/2026-08-28-card-snapshots-read-path.md`.
 */

export {
  buildCardSnapshotPayload,
  buildCardSnapshot,
  hashCardSnapshotPayload,
  canonicalPayloadJson,
  CARD_SNAPSHOT_PAYLOAD_VERSION,
  type CardSnapshotPayload,
  type CardSnapshotField,
  type CardSnapshotFieldInput,
  type CardSnapshotSource,
  type CardSnapshotValue,
} from "./payload";

export {
  ensureCardSnapshot,
  type EnsureCardSnapshotInput,
  type EnsureCardSnapshotResult,
} from "./ensure-snapshot";

export { loadCardSnapshotSource, buildCardSnapshotFromDb } from "./source";

export { captureCardSnapshot } from "./capture";

export {
  diffSnapshots,
  SNAPSHOT_CODE_FIELD_ID,
  SNAPSHOT_CARD_TYPE_FIELD_ID,
  SNAPSHOT_CODE_LABEL,
  SNAPSHOT_CARD_TYPE_LABEL,
  type SnapshotFieldChange,
} from "./diff";

export {
  loadSnapshotsForLogRows,
  loadClientSnapshots,
  distinctSnapshotIds,
  type ResolvedSnapshot,
  type SnapshotLookup,
  type SnapshotPayloadMap,
} from "./resolve";

export {
  projectSnapshotFields,
  sanitizePayloadForClient,
  type SummaryFieldConfig,
  type DisplayField,
} from "./project";

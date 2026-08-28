/**
 * Resolving snapshots for a page of log rows.
 *
 * Both read surfaces need the same thing: given a page of `action_logs` rows,
 * the frozen card state each one points at — plus its predecessor, for the
 * Detail diff. Written ONCE and called by both.
 *
 * This module touches the database, so it is server-only. The projection that
 * turns a payload into display fields lives in `./project`, which is pure and
 * therefore importable from the client feed builder too — the two producers
 * MUST share it. Re-exported here so a server caller has one import.
 *
 * ## Why two steps instead of joining snapshots into the log query
 *
 * A payload is the card's WHOLE field state. Joined into the log query it would
 * be repeated once per row, so a card scanned 500 times would carry 500 copies
 * of one identical payload — through a 10,000-row CSV export. Collecting the
 * distinct ids first and fetching them in one `IN (…)` deduplicates for free.
 *
 * ## Fallback
 *
 * A row written before migration 0022 has `card_snapshot_id = NULL`. There is
 * no backfill, so those rows keep the live-join enrichment they always had.
 * Callers check for a missing entry and fall back; nothing here pretends to
 * serve them.
 *
 * See ADR docs/context/decisions/2026-08-28-card-snapshots-read-path.md.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { sanitizePayloadForClient } from "./project";
import type { CardSnapshotPayload } from "./payload";

// ─── Lookup ──────────────────────────────────────────────────────────────────

/** One snapshot plus the state it superseded. */
export interface ResolvedSnapshot {
  id: string;
  payload: CardSnapshotPayload;
  /** Null for a V0 — the lazy bootstrap of a card that predates snapshots. */
  previousSnapshotId: string | null;
  /** Null whenever `previousSnapshotId` is null. */
  previousPayload: CardSnapshotPayload | null;
}

/** snapshotId → resolved snapshot. Missing key = pre-0022 row, use the fallback. */
export type SnapshotLookup = Map<string, ResolvedSnapshot>;

interface SnapshotRow extends Record<string, unknown> {
  id: string;
  payload: CardSnapshotPayload;
  previous_snapshot_id: string | null;
  previous_payload: CardSnapshotPayload | null;
}

/**
 * The distinct snapshot ids a page of log rows references.
 *
 * This is where the deduplication actually happens — 50 rows cycling over 3
 * versions of one card collapse to 3 ids, so the query below fetches 3 payloads
 * instead of 50 copies. Exported so that property is unit-testable: `db` is a
 * lazy Proxy, which makes counting calls on it impossible from a test.
 *
 * @param rows - Log rows. A null or empty `cardSnapshotId` is a pre-0022 row.
 * @returns Distinct ids, in first-seen order.
 */
export function distinctSnapshotIds(
  rows: { cardSnapshotId: string | null }[],
): string[] {
  return [
    ...new Set(
      rows
        .map((r) => r.cardSnapshotId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
}

/**
 * Fetch every distinct snapshot a page of log rows references, plus each one's
 * predecessor, in a single query.
 *
 * ONE `db.execute`, guarded by one early return: a page costs a single query,
 * or none at all when every row predates snapshots.
 *
 * @param tenantId - Tenant UUID, always from the session. Applied even though
 *                   the ids come from tenant-scoped rows — defence in depth,
 *                   consistent with every other DAL read.
 * @param rows     - The page of log rows. Null `cardSnapshotId`s are skipped.
 * @returns A lookup keyed by snapshot id. Empty when no row carries one.
 */
export async function loadSnapshotsForLogRows(
  tenantId: string,
  rows: { cardSnapshotId: string | null }[],
): Promise<SnapshotLookup> {
  const ids = distinctSnapshotIds(rows);

  const lookup: SnapshotLookup = new Map();
  if (ids.length === 0) return lookup;

  const result = await db.execute<SnapshotRow>(sql`
    SELECT
      s.id                   AS id,
      s.payload              AS payload,
      s.previous_snapshot_id AS previous_snapshot_id,
      p.payload              AS previous_payload
    FROM card_snapshots s
    -- The predecessor is reached by the chain, not by timestamp: a card that
    -- returns to a state it held before gets a NEW snapshot precisely so this
    -- link stays a single line back through the card's versions.
    LEFT JOIN card_snapshots p
      ON p.id = s.previous_snapshot_id
      AND p.tenant_id = s.tenant_id
    WHERE s.id IN (${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
      AND s.tenant_id = ${tenantId}::uuid
  `);

  for (const row of result.rows) {
    lookup.set(row.id, {
      id: row.id,
      payload: row.payload,
      previousSnapshotId: row.previous_snapshot_id,
      previousPayload: row.previous_payload,
    });
  }

  return lookup;
}

export {
  projectSnapshotFields,
  sanitizePayloadForClient,
  type SummaryFieldConfig,
  type DisplayField,
} from "./project";

// ─── Handing snapshots to the client ─────────────────────────────────────────

/** snapshotId → payload, as a Server Action returns it. */
export type SnapshotPayloadMap = Record<string, CardSnapshotPayload>;

/**
 * The payloads for a set of log rows a Server Action just wrote, ready to cross
 * to the client.
 *
 * Deliberately the SAME resolution the server read path uses, so the client
 * feed builder and `getActivityFeed` consume one structure and project it with
 * one function. That is what stops the two producers disagreeing — the scan row
 * must read the pre-auto-action state on both, or the numbers change under the
 * operator the moment they press Refrescar.
 *
 * Every payload is passed through `sanitizePayloadForClient`, so no storage
 * object key leaves the server.
 *
 * Costs one query per call. Called once per scan / resume / action execution.
 *
 * @param tenantId - Tenant UUID, always from the session.
 * @param rows     - The rows just written. Nulls and duplicates are fine.
 * @returns snapshotId → sanitized payload. Empty when no row carries one.
 */
export async function loadClientSnapshots(
  tenantId: string,
  rows: { cardSnapshotId: string | null }[],
): Promise<SnapshotPayloadMap> {
  const lookup = await loadSnapshotsForLogRows(tenantId, rows);

  const out: SnapshotPayloadMap = {};
  for (const [id, resolved] of lookup) {
    out[id] = sanitizePayloadForClient(resolved.payload);
  }
  return out;
}

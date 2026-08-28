/**
 * `ensureCardSnapshot` — the snapshot write primitive.
 *
 * Everything that wants to freeze a card's state goes through here, so the
 * deduplication rule lives in exactly one statement.
 *
 * ## Why one data-modifying CTE
 *
 * Inserting the snapshot and re-pointing `cards.current_snapshot_id` at it must
 * either both happen or neither: a snapshot that exists but is not current
 * would be skipped by the next comparison and duplicated on the next write.
 * The Neon HTTP driver has no interactive transactions, so the project's
 * substitute is a single statement — one statement is one implicit Postgres
 * transaction. Same pattern as `src/lib/server/lifecycle/`; follow it.
 *
 * ## Two behaviours that fall out of the SQL, both intended
 *
 * 1. A card with `current_snapshot_id IS NULL` yields `content_hash = NULL`, and
 *    `NULL IS DISTINCT FROM $hash` is TRUE — so the first scan or edit of a
 *    pre-existing card lazily bootstraps its V0. That is why there is no
 *    backfill job.
 * 2. Deduplication compares against the CURRENT snapshot only, never the whole
 *    history. A card returning to a state it held before gets a new snapshot.
 *    Reusing the older one would fork `previous_snapshot_id`, and that chain is
 *    what A2's diff walks.
 *
 * See ADR docs/context/decisions/2026-08-28-card-snapshots-write-path.md.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/dal/errors";
import {
  hashCardSnapshotPayload,
  type CardSnapshotPayload,
} from "./payload";

export interface EnsureCardSnapshotInput {
  /** Always from the session — scopes the statement, never trusted from input. */
  tenantId: string;
  /** Internal card UUID. */
  cardId: string;
  /** The card's state as of now, from `buildCardSnapshotPayload`. */
  payload: CardSnapshotPayload;
}

export interface EnsureCardSnapshotResult {
  /** The snapshot a log row written now should reference. */
  snapshotId: string;
  /**
   * Whether THIS call produced the snapshot — i.e. whether the card's content
   * actually differs from what was in force.
   *
   * Log rows persist it as `action_logs.snapshot_created` so a read path can
   * tell "this row changed something" from "this row merely observed".
   */
  created: boolean;
}

interface EnsureRow extends Record<string, unknown> {
  snapshot_id: string | null;
  created: boolean;
  card_found: boolean;
}

/**
 * Return the snapshot id a log row should reference, creating a new snapshot
 * only when the card's content differs from the one currently in force.
 *
 * @param input - Tenant, card, and the payload describing the card's state now.
 * @returns The snapshot id to stamp, and whether this call created it.
 * @throws {NotFoundError} If the card does not exist within the tenant.
 */
export async function ensureCardSnapshot(
  input: EnsureCardSnapshotInput,
): Promise<EnsureCardSnapshotResult> {
  const contentHash = hashCardSnapshotPayload(input.payload);
  const payloadJson = JSON.stringify(input.payload);

  // One statement, so the INSERT and the pointer UPDATE commit together.
  // Postgres runs every data-modifying CTE exactly once and to completion,
  // whether or not the primary query reads its output — which is what lets
  // `updated` do its work while the SELECT only reports.
  const result = await db.execute<EnsureRow>(sql`
    WITH current AS (
      SELECT c.current_snapshot_id AS id, s.content_hash
      FROM cards c
      LEFT JOIN card_snapshots s ON s.id = c.current_snapshot_id
      WHERE c.id = ${input.cardId}::uuid
        AND c.tenant_id = ${input.tenantId}::uuid
    ), inserted AS (
      INSERT INTO card_snapshots (tenant_id, card_id, previous_snapshot_id, payload, content_hash)
      SELECT ${input.tenantId}::uuid, ${input.cardId}::uuid, current.id, ${payloadJson}::jsonb, ${contentHash}
      FROM current
      WHERE current.content_hash IS DISTINCT FROM ${contentHash}
      RETURNING id
    ), updated AS (
      UPDATE cards SET current_snapshot_id = (SELECT id FROM inserted)
      WHERE id = ${input.cardId}::uuid
        AND tenant_id = ${input.tenantId}::uuid
        AND EXISTS (SELECT 1 FROM inserted)
      RETURNING id
    )
    SELECT
      COALESCE((SELECT id FROM inserted), (SELECT id FROM current)) AS snapshot_id,
      EXISTS (SELECT 1 FROM inserted) AS created,
      EXISTS (SELECT 1 FROM current)  AS card_found
  `);

  const row = result.rows[0];

  if (!row?.card_found) {
    throw new NotFoundError("Card", input.cardId);
  }

  if (!row.snapshot_id) {
    // Unreachable: the card exists, so either `inserted` produced a row or
    // `current.id` was already non-null (a non-null hash implies a snapshot).
    // Failing loudly beats stamping null onto an audit row.
    throw new Error(
      `ensureCardSnapshot resolved no snapshot for card ${input.cardId}.`,
    );
  }

  return { snapshotId: row.snapshot_id, created: row.created === true };
}

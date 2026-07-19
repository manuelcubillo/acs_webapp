/**
 * Physical deletion of trashed rows — the hard-delete primitive.
 *
 * This is the ONLY place in the project that hard-deletes domain data (the sole
 * exception to the soft-delete rule, see ADR `2026-07-17-card-lifecycle-archiving.md`).
 * Phase 4 introduces it for the manual "delete now" actions in the trash view;
 * phase 5's retention purge job will reuse exactly these functions.
 *
 * ## Safety
 *
 * Every delete is scoped to `tenant_id = <caller>` AND `status = 'archived'`, so
 * it can never touch a live row or a row of another tenant, even if handed a bad
 * id. The functions are idempotent: a missing / already-purged / non-archived
 * row simply deletes 0 rows and the caller decides how to report that.
 *
 * ## Atomicity (Neon HTTP, no interactive transactions)
 *
 * Migration 0017 flipped the dependent FK chain from RESTRICT to CASCADE, so a
 * single `DELETE` removes a row and everything that hangs off it in one implicit
 * Postgres transaction — real atomicity without an interactive transaction:
 *   - deleting a card cascades to its `field_values` and `action_logs`;
 *   - deleting a card type cascades to its cards (and their field values / logs),
 *     field definitions, action definitions, scan validations, summary fields and
 *     design links.
 *
 * No audit row is written for a purge: the card's `action_logs` are cascaded away
 * with it, so there would be nothing to attach a record to (a deliberate phase-1
 * decision — the trash countdown is the audit trail, the purge itself leaves none).
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cards, cardTypes } from "@/lib/db/schema";

/** Outcome of emptying the whole trash. */
export interface EmptyTrashResult {
  /** Archived card types physically deleted. */
  deletedCardTypes: number;
  /**
   * Archived cards physically deleted — both those removed directly and those
   * cascaded away by deleting their archived type.
   */
  deletedCards: number;
}

/** Per-tenant breakdown of what the retention purge removed. */
export interface TenantPurgeSummary {
  /** Tenant the counts belong to. */
  tenantId: string;
  /** Archived card types physically deleted for this tenant. */
  deletedCardTypes: number;
  /** Archived cards physically deleted for this tenant (direct + cascaded). */
  deletedCards: number;
}

/** Outcome of a full retention purge across every tenant. */
export interface PurgeResult {
  /** Total archived card types physically deleted across all tenants. */
  deletedCardTypes: number;
  /** Total archived cards physically deleted across all tenants. */
  deletedCards: number;
  /** Per-tenant breakdown — only tenants that had something purged. */
  tenants: TenantPurgeSummary[];
}

/**
 * Physically delete one archived card and everything that cascades from it.
 *
 * @param cardId   - Card UUID.
 * @param tenantId - Tenant the card must belong to (from the session).
 * @returns 1 if a row was deleted, 0 if nothing matched (not found / not
 *          archived / wrong tenant).
 */
export async function hardDeleteArchivedCard(
  cardId: string,
  tenantId: string,
): Promise<number> {
  const deleted = await db
    .delete(cards)
    .where(
      and(
        eq(cards.id, cardId),
        eq(cards.tenantId, tenantId),
        eq(cards.status, "archived"),
      ),
    )
    .returning({ id: cards.id });

  return deleted.length;
}

/**
 * Physically delete one archived card type and its entire cascade (all its
 * cards, field definitions, action definitions, scan validations, summary
 * fields and design links).
 *
 * @param cardTypeId - Card type UUID.
 * @param tenantId   - Tenant the card type must belong to (from the session).
 * @returns 1 if a row was deleted, 0 if nothing matched (not found / not
 *          archived / wrong tenant).
 */
export async function hardDeleteArchivedCardType(
  cardTypeId: string,
  tenantId: string,
): Promise<number> {
  const deleted = await db
    .delete(cardTypes)
    .where(
      and(
        eq(cardTypes.id, cardTypeId),
        eq(cardTypes.tenantId, tenantId),
        eq(cardTypes.status, "archived"),
      ),
    )
    .returning({ id: cardTypes.id });

  return deleted.length;
}

/**
 * Empty the whole trash for a tenant: delete every archived card type (cascading
 * to their cards) and every remaining archived card (those archived individually
 * under a still-live type).
 *
 * ## Why a single CTE statement
 *
 * Deleting the archived types cascades away the cards that belong to them. The
 * second delete must therefore target only the *remaining* archived cards —
 * those whose type is NOT being deleted — otherwise the same card row could be
 * removed twice in one statement, which Postgres does not support. The
 * `card_type_id NOT IN (SELECT id FROM del_types)` guard makes the two deletes
 * touch disjoint sets, so the whole operation is one atomic statement.
 *
 * `deletedCards` is pre-counted (every archived card is removed one way or the
 * other), because the cascade-deleted cards never surface in the second delete's
 * RETURNING and would otherwise be undercounted.
 *
 * @param tenantId - Tenant whose trash is emptied (from the session).
 * @returns Counts of card types and cards physically removed.
 */
export async function hardDeleteAllArchived(
  tenantId: string,
): Promise<EmptyTrashResult> {
  // Total archived cards that will disappear (directly + via type cascade).
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(cards)
    .where(and(eq(cards.tenantId, tenantId), eq(cards.status, "archived")));

  const result = await db.execute<{ deleted_card_types: number }>(sql`
    WITH del_types AS (
      DELETE FROM card_types
      WHERE tenant_id = ${tenantId}::uuid
        AND status = 'archived'::lifecycle_status
      RETURNING id
    ), del_cards AS (
      DELETE FROM cards
      WHERE tenant_id = ${tenantId}::uuid
        AND status = 'archived'::lifecycle_status
        AND card_type_id NOT IN (SELECT id FROM del_types)
      RETURNING id
    )
    SELECT (SELECT count(*)::int FROM del_types) AS deleted_card_types
  `);

  return {
    deletedCardTypes: result.rows[0]?.deleted_card_types ?? 0,
    deletedCards: total ?? 0,
  };
}

/**
 * Retention purge — physically delete every archived card / card type whose
 * per-tenant retention window has elapsed, across ALL tenants in one sweep.
 *
 * This is the phase-5 job invoked once a day by the cron endpoint
 * (`/api/cron/purge-archived`). Unlike the manual trash actions above it is not
 * scoped to a single tenant: it joins `tenants` so each row is judged against
 * its own `archive_retention_days`.
 *
 * ## Eligibility
 *
 * A row is purged iff `status = 'archived'` AND its retention has fully elapsed:
 * `archived_at < now(UTC) - archive_retention_days`. Live rows and rows still
 * within their window are never touched — the sole safety guard.
 *
 * `archived_at` is a `timestamp without time zone` holding a UTC wall clock, so
 * the cutoff is computed as `(now() AT TIME ZONE 'UTC')` to keep both operands
 * in UTC regardless of the database session's timezone. This mirrors the pure
 * UTC arithmetic of `computePurgeDueAt` (used by the trash countdown), so the
 * job deletes a row on exactly the day the trash UI counted down to.
 *
 * ## Order (types → cards) and why it is safe
 *
 * Deleting an expired archived card type cascades to all of its cards. Those
 * cards share the type's `archived_at` (they were cascade-archived with it), so
 * if the type is expired its cards are expired too — removing them via cascade
 * is correct. The second delete then targets only the *remaining* expired cards
 * (`card_type_id NOT IN (del_types)`): those archived individually under a still
 * live-or-unexpired type. The two deletes therefore touch disjoint card sets, so
 * no card is deleted twice in the same statement.
 *
 * ## Atomicity (Neon HTTP, no interactive transactions)
 *
 * The delete is a single data-modifying CTE — one statement, one implicit
 * Postgres transaction — so the whole sweep is atomic without an interactive
 * transaction, exactly like the phase-4 primitives above.
 *
 * ## Idempotence
 *
 * Re-running immediately purges nothing: every eligible row is already gone, so
 * the counts come back zero. Safe to invoke repeatedly / retry.
 *
 * ## Counting
 *
 * Counts are pre-computed per tenant *before* the delete. A card cascaded away
 * by deleting its type never surfaces in a `RETURNING` clause, so counting from
 * the delete alone would undercount (same reason `hardDeleteAllArchived`
 * pre-counts). The set "archived cards past retention" is exactly the set the
 * two deletes remove — cascade-removed cards included — because a cascaded card
 * shares its expired type's `archived_at` and is therefore itself past
 * retention. The pre-count and the delete evaluate `now()` a few milliseconds
 * apart; at day-granularity retention this can only differ for a row crossing
 * the boundary in that window, which affects the reported count by at most one
 * and never what is deleted.
 *
 * @returns Totals plus a per-tenant breakdown (only tenants with deletions).
 */
export async function purgeExpiredArchivedRecords(): Promise<PurgeResult> {
  // Cutoff shared by every query below: `archived_at < now(UTC) - retention`.
  const expiredTypeFilter = sql`
    ct.status = 'archived'::lifecycle_status
    AND ct.archived_at < (now() AT TIME ZONE 'UTC') - make_interval(days => t.archive_retention_days)
  `;
  const expiredCardFilter = sql`
    c.status = 'archived'::lifecycle_status
    AND c.archived_at < (now() AT TIME ZONE 'UTC') - make_interval(days => t.archive_retention_days)
  `;

  // ── Pre-count per tenant (before deleting, so cascades are not undercounted).
  const typeCounts = await db.execute<{ tenant_id: string; n: number }>(sql`
    SELECT ct.tenant_id, count(*)::int AS n
    FROM card_types ct
    JOIN tenants t ON t.id = ct.tenant_id
    WHERE ${expiredTypeFilter}
    GROUP BY ct.tenant_id
  `);
  const cardCounts = await db.execute<{ tenant_id: string; n: number }>(sql`
    SELECT c.tenant_id, count(*)::int AS n
    FROM cards c
    JOIN tenants t ON t.id = c.tenant_id
    WHERE ${expiredCardFilter}
    GROUP BY c.tenant_id
  `);

  // ── Delete: expired types (cascade to their cards) then remaining expired
  //    cards, disjoint via `card_type_id NOT IN (del_types)`. Single statement.
  await db.execute(sql`
    WITH del_types AS (
      DELETE FROM card_types ct
      USING tenants t
      WHERE ct.tenant_id = t.id
        AND ${expiredTypeFilter}
      RETURNING ct.id
    )
    DELETE FROM cards c
    USING tenants t
    WHERE c.tenant_id = t.id
      AND ${expiredCardFilter}
      AND c.card_type_id NOT IN (SELECT id FROM del_types)
  `);

  // ── Merge the two per-tenant tallies into one summary.
  const byTenant = new Map<string, TenantPurgeSummary>();
  for (const row of typeCounts.rows) {
    byTenant.set(row.tenant_id, {
      tenantId: row.tenant_id,
      deletedCardTypes: row.n,
      deletedCards: 0,
    });
  }
  for (const row of cardCounts.rows) {
    const entry = byTenant.get(row.tenant_id);
    if (entry) entry.deletedCards = row.n;
    else
      byTenant.set(row.tenant_id, {
        tenantId: row.tenant_id,
        deletedCardTypes: 0,
        deletedCards: row.n,
      });
  }

  const tenantSummaries = [...byTenant.values()];
  const result: PurgeResult = {
    deletedCardTypes: tenantSummaries.reduce((s, r) => s + r.deletedCardTypes, 0),
    deletedCards: tenantSummaries.reduce((s, r) => s + r.deletedCards, 0),
    tenants: tenantSummaries,
  };

  // Observability: the purge leaves no per-record audit trail (its logs cascade
  // away with the card), so emit a run summary to the server logs instead.
  console.info(
    `[purge] retention sweep removed ${result.deletedCardTypes} card type(s) and ` +
      `${result.deletedCards} card(s) across ${tenantSummaries.length} tenant(s)`,
    result.tenants,
  );

  return result;
}

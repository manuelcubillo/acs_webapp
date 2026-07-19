/**
 * Card type lifecycle transitions.
 *
 * Card types are NOT audited: a transition only bumps `updated_at`. Their cards
 * ARE audited — archiving a type writes one `lifecycle` row per cascaded card.
 *
 * ## Atomicity
 *
 * Archiving/restoring a card type touches two tables and must not half-apply.
 * The Neon HTTP driver has no interactive transactions, so both writes plus the
 * audit rows are expressed as a SINGLE data-modifying CTE — one statement, one
 * implicit Postgres transaction.
 *
 * Note on CTE visibility: all sub-statements of a CTE see the same snapshot, so
 * the `cards` UPDATE reads each card's pre-archive status correctly even though
 * the `card_types` UPDATE runs in the same statement.
 *
 * ## Authorization
 *
 * No role checks here — the Server Actions in `src/lib/actions/lifecycle.ts` run
 * `requireMaster()` first. Card type mutations are master-only across the whole
 * project, and archiving one cascades to every card of that type.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cardTypes } from "@/lib/db/schema";
import { NotFoundError, ForbiddenOperationError } from "@/lib/dal/errors";
import type { CardType, LifecycleStatus } from "@/lib/dal/types";
import {
  assertTransitionAllowed,
  assertCanRestore,
} from "./state-machine";
import type { LifecycleActor } from "./cards";

/** Result of a cascading card type transition. */
export interface CardTypeCascadeResult {
  cardType: CardType;
  /** How many cards the cascade touched. */
  affectedCards: number;
}

/**
 * Fetch a card type by id within a tenant, or throw.
 * Does not filter by status — lifecycle operations address archived rows too.
 */
async function requireCardType(
  cardTypeId: string,
  tenantId: string,
): Promise<CardType> {
  const [row] = await db
    .select()
    .from(cardTypes)
    .where(and(eq(cardTypes.id, cardTypeId), eq(cardTypes.tenantId, tenantId)))
    .limit(1);

  if (!row) throw new NotFoundError("CardType", cardTypeId);
  return row;
}

/**
 * Apply a non-cascading status change to a card type.
 * Used by activate / deactivate, which do not touch cards.
 *
 * @param expected - Status the row must still hold (concurrency guard).
 */
async function applyCardTypeTransition(
  cardTypeId: string,
  actor: LifecycleActor,
  status: LifecycleStatus,
  expected: LifecycleStatus,
): Promise<CardType> {
  const [updated] = await db
    .update(cardTypes)
    .set({
      status,
      archivedAt: null,
      archivedBy: null,
      statusBeforeArchive: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(cardTypes.id, cardTypeId),
        eq(cardTypes.tenantId, actor.tenantId),
        eq(cardTypes.status, expected),
      ),
    )
    .returning();

  if (!updated) {
    throw new ForbiddenOperationError(
      `CardType ${cardTypeId} changed status concurrently; the transition was not applied. Retry.`,
    );
  }
  return updated;
}

/**
 * Switch a card type back on: inactive → active.
 * Does not touch its cards.
 *
 * @throws {ValidationError} If it is not inactive (archived types must be restored).
 */
export async function activateCardType(
  cardTypeId: string,
  actor: LifecycleActor,
): Promise<CardType> {
  const type = await requireCardType(cardTypeId, actor.tenantId);
  assertTransitionAllowed("activate", type.status, "CardType");
  return applyCardTypeTransition(cardTypeId, actor, "active", type.status);
}

/**
 * Switch a card type off: active → inactive.
 * Does not touch its cards — this is an operational switch, not the trash.
 *
 * @throws {ValidationError} If it is not active.
 */
export async function deactivateCardType(
  cardTypeId: string,
  actor: LifecycleActor,
): Promise<CardType> {
  const type = await requireCardType(cardTypeId, actor.tenantId);
  assertTransitionAllowed("deactivate", type.status, "CardType");
  return applyCardTypeTransition(cardTypeId, actor, "inactive", type.status);
}

/**
 * Move a card type to the trash and cascade to all of its live cards.
 *
 * Each cascaded card records `archived_via_type_id = cardTypeId` so that
 * restoring the type revives exactly these and leaves individually-archived
 * cards in the trash. Cards already archived are skipped — their own
 * `status_before_archive` must not be overwritten.
 *
 * @returns The archived card type and how many cards were cascaded.
 * @throws {ValidationError} If the type is already archived.
 */
export async function archiveCardType(
  cardTypeId: string,
  actor: LifecycleActor,
): Promise<CardTypeCascadeResult> {
  const type = await requireCardType(cardTypeId, actor.tenantId);
  assertTransitionAllowed("archive", type.status, "CardType");

  const now = new Date();

  const result = await db.execute<{ affected_cards: number }>(sql`
    WITH archived_type AS (
      UPDATE card_types SET
        status                = 'archived'::lifecycle_status,
        status_before_archive = status,
        archived_at           = ${now},
        archived_by           = ${actor.userId},
        updated_at            = now()
      WHERE id = ${cardTypeId}::uuid
        AND tenant_id = ${actor.tenantId}::uuid
        AND status = ${type.status}::lifecycle_status
      RETURNING id
    ), archived_cards AS (
      UPDATE cards SET
        status                = 'archived'::lifecycle_status,
        status_before_archive = status,
        archived_at           = ${now},
        archived_by           = ${actor.userId},
        archived_via_type_id  = ${cardTypeId}::uuid,
        updated_at            = now()
      WHERE card_type_id IN (SELECT id FROM archived_type)
        AND tenant_id = ${actor.tenantId}::uuid
        AND status <> 'archived'::lifecycle_status
      RETURNING id, status_before_archive
    ), logged AS (
      INSERT INTO action_logs (tenant_id, card_id, log_type, executed_by, metadata)
      SELECT
        ${actor.tenantId}::uuid,
        archived_cards.id,
        'lifecycle',
        ${actor.userId},
        jsonb_build_object(
          'from', archived_cards.status_before_archive,
          'to', 'archived',
          'transition', 'archive',
          'cascaded_from_card_type_id', ${cardTypeId}::text
        )
      FROM archived_cards
    )
    SELECT count(*)::int AS affected_cards FROM archived_cards
  `);

  const affectedCards = result.rows[0]?.affected_cards ?? 0;
  const updated = await requireCardType(cardTypeId, actor.tenantId);

  if (updated.status !== "archived") {
    throw new ForbiddenOperationError(
      `CardType ${cardTypeId} changed status concurrently; the transition was not applied. Retry.`,
    );
  }

  return { cardType: updated, affectedCards };
}

/**
 * Restore a card type from the trash, plus exactly the cards it dragged in.
 *
 * Cards archived individually (`archived_via_type_id IS NULL`) stay archived —
 * they were put in the trash on purpose and must not be resurrected by a
 * type-level restore.
 *
 * @returns The restored card type and how many cards were revived.
 * @throws {ValidationError} If the type is not archived.
 */
export async function restoreCardType(
  cardTypeId: string,
  actor: LifecycleActor,
): Promise<CardTypeCascadeResult> {
  const type = await requireCardType(cardTypeId, actor.tenantId);
  const restoreTo = assertCanRestore(
    type.status,
    type.statusBeforeArchive,
    "CardType",
  );

  const result = await db.execute<{ affected_cards: number }>(sql`
    WITH restored_type AS (
      UPDATE card_types SET
        status                = ${restoreTo}::lifecycle_status,
        status_before_archive = NULL,
        archived_at           = NULL,
        archived_by           = NULL,
        updated_at            = now()
      WHERE id = ${cardTypeId}::uuid
        AND tenant_id = ${actor.tenantId}::uuid
        AND status = 'archived'::lifecycle_status
      RETURNING id
    ), restored_cards AS (
      UPDATE cards SET
        status                = status_before_archive,
        status_before_archive = NULL,
        archived_at           = NULL,
        archived_by           = NULL,
        archived_via_type_id  = NULL,
        updated_at            = now()
      WHERE card_type_id IN (SELECT id FROM restored_type)
        AND tenant_id = ${actor.tenantId}::uuid
        AND status = 'archived'::lifecycle_status
        AND archived_via_type_id = ${cardTypeId}::uuid
      RETURNING id, status AS restored_to
    ), logged AS (
      INSERT INTO action_logs (tenant_id, card_id, log_type, executed_by, metadata)
      SELECT
        ${actor.tenantId}::uuid,
        restored_cards.id,
        'lifecycle',
        ${actor.userId},
        jsonb_build_object(
          'from', 'archived',
          'to', restored_cards.restored_to,
          'transition', 'restore',
          'cascaded_from_card_type_id', ${cardTypeId}::text
        )
      FROM restored_cards
    )
    SELECT count(*)::int AS affected_cards FROM restored_cards
  `);

  const affectedCards = result.rows[0]?.affected_cards ?? 0;
  const updated = await requireCardType(cardTypeId, actor.tenantId);

  if (updated.status === "archived") {
    throw new ForbiddenOperationError(
      `CardType ${cardTypeId} changed status concurrently; the transition was not applied. Retry.`,
    );
  }

  return { cardType: updated, affectedCards };
}

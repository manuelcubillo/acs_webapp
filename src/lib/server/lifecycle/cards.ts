/**
 * Card lifecycle transitions.
 *
 * Each function validates the transition against the state machine, applies it,
 * and writes an audit row to `action_logs` (log_type = 'lifecycle').
 *
 * ## Atomicity
 *
 * The Neon HTTP driver has no interactive transactions, so every transition is
 * expressed as a SINGLE SQL statement using a data-modifying CTE. One statement
 * is one implicit transaction in Postgres, so the status change and its audit
 * row commit together or not at all — real atomicity without changing driver.
 *
 * ## Authorization
 *
 * These functions do NOT check roles: they are the service layer. The Server
 * Actions in `src/lib/actions/lifecycle.ts` run `requireAdmin()` first, per the
 * project convention that guards live at the action boundary.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cards, cardTypes } from "@/lib/db/schema";
import { NotFoundError, ForbiddenOperationError } from "@/lib/dal/errors";
import type { Card, LifecycleStatus } from "@/lib/dal/types";
import {
  assertTransitionAllowed,
  assertCanRestore,
  targetStatus,
} from "./state-machine";

/** Who is performing the transition. */
export interface LifecycleActor {
  /** Better Auth user id (text, not uuid). */
  userId: string;
  /** Tenant the actor operates in — always from the session, never from input. */
  tenantId: string;
}

/** Metadata recorded on every lifecycle audit row. */
interface LifecycleLogMeta {
  from: LifecycleStatus;
  to: LifecycleStatus;
  transition: string;
  /** Set when the card was archived/restored as part of a card type cascade. */
  cascaded_from_card_type_id?: string;
}

/**
 * Fetch a card by id within a tenant, or throw.
 * Deliberately does not filter by status — lifecycle operations must be able to
 * address archived rows.
 */
async function requireCard(cardId: string, tenantId: string): Promise<Card> {
  const [card] = await db
    .select()
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.tenantId, tenantId)))
    .limit(1);

  if (!card) throw new NotFoundError("Card", cardId);
  return card;
}

/**
 * Apply a status change to one card and audit it, in a single statement.
 *
 * @param cardId   - Card UUID (already verified to belong to the tenant).
 * @param actor    - Who is acting.
 * @param set      - The column assignments for the new state.
 * @param meta     - Audit metadata (from / to / transition).
 * @param expected - The status the row must still hold, guarding against a
 *                   concurrent transition between our read and our write.
 * @returns The updated card row.
 * @throws {ForbiddenOperationError} If the row changed status concurrently.
 */
async function applyCardTransition(
  cardId: string,
  actor: LifecycleActor,
  set: {
    status: LifecycleStatus;
    archivedAt: Date | null;
    archivedBy: string | null;
    statusBeforeArchive: LifecycleStatus | null;
    archivedViaTypeId: string | null;
  },
  meta: LifecycleLogMeta,
  expected: LifecycleStatus,
): Promise<Card> {
  // Raw SQL returns snake_case columns, so the CTE only reports how many rows it
  // touched; the row itself is re-read through Drizzle below to get a properly
  // typed `Card`. The re-read is safe: the statement has already committed.
  const result = await db.execute<{ affected: number }>(sql`
    WITH updated AS (
      UPDATE cards SET
        status                = ${set.status}::lifecycle_status,
        archived_at           = ${set.archivedAt},
        archived_by           = ${set.archivedBy},
        status_before_archive = ${set.statusBeforeArchive}::lifecycle_status,
        archived_via_type_id  = ${set.archivedViaTypeId}::uuid,
        updated_at            = now()
      WHERE id = ${cardId}::uuid
        AND tenant_id = ${actor.tenantId}::uuid
        AND status = ${expected}::lifecycle_status
      RETURNING id
    ), logged AS (
      INSERT INTO action_logs (tenant_id, card_id, log_type, executed_by, metadata)
      SELECT ${actor.tenantId}::uuid, updated.id, 'lifecycle', ${actor.userId}, ${JSON.stringify(meta)}::jsonb
      FROM updated
    )
    SELECT count(*)::int AS affected FROM updated
  `);

  if ((result.rows[0]?.affected ?? 0) === 0) {
    // The row existed when we read it, so a zero-row update means its status
    // moved underneath us.
    throw new ForbiddenOperationError(
      `Card ${cardId} changed status concurrently; the transition was not applied. Retry.`,
    );
  }

  return requireCard(cardId, actor.tenantId);
}

/**
 * Switch a card back on: inactive | expired → active.
 *
 * @throws {NotFoundError} If the card does not exist in the tenant.
 * @throws {ValidationError} If the card is not inactive/expired.
 */
export async function activateCard(
  cardId: string,
  actor: LifecycleActor,
): Promise<Card> {
  const card = await requireCard(cardId, actor.tenantId);
  assertTransitionAllowed("activate", card.status, "Card");

  return applyCardTransition(
    cardId,
    actor,
    {
      status: "active",
      archivedAt: null,
      archivedBy: null,
      statusBeforeArchive: null,
      archivedViaTypeId: null,
    },
    { from: card.status, to: "active", transition: "activate" },
    card.status,
  );
}

/**
 * Switch a card off: active → inactive. Not a delete — the card stays forever
 * and never enters the trash.
 *
 * @throws {NotFoundError} If the card does not exist in the tenant.
 * @throws {ValidationError} If the card is not active.
 */
export async function deactivateCard(
  cardId: string,
  actor: LifecycleActor,
): Promise<Card> {
  const card = await requireCard(cardId, actor.tenantId);
  assertTransitionAllowed("deactivate", card.status, "Card");

  return applyCardTransition(
    cardId,
    actor,
    {
      status: "inactive",
      archivedAt: null,
      archivedBy: null,
      statusBeforeArchive: null,
      archivedViaTypeId: null,
    },
    { from: card.status, to: "inactive", transition: "deactivate" },
    card.status,
  );
}

/**
 * Move a card to the trash: active | inactive | expired → archived.
 * Records the pre-archive status so restore can put it back exactly.
 *
 * @throws {NotFoundError} If the card does not exist in the tenant.
 * @throws {ValidationError} If the card is already archived.
 */
export async function archiveCard(
  cardId: string,
  actor: LifecycleActor,
): Promise<Card> {
  const card = await requireCard(cardId, actor.tenantId);
  assertTransitionAllowed("archive", card.status, "Card");

  return applyCardTransition(
    cardId,
    actor,
    {
      status: targetStatus("archive"),
      archivedAt: new Date(),
      archivedBy: actor.userId,
      statusBeforeArchive: card.status,
      // Archived on its own, not via a card type cascade. Restoring the type
      // must therefore leave this card in the trash.
      archivedViaTypeId: null,
    },
    { from: card.status, to: "archived", transition: "archive" },
    card.status,
  );
}

/**
 * Restore a card from the trash to whatever it was before archiving.
 *
 * Refuses if the card's type is still archived: the card would come back alive
 * under a type that is itself counting down to physical deletion, and the purge
 * would then cascade it away — silently destroying the data the user just
 * rescued. The type must be restored first.
 *
 * @throws {NotFoundError} If the card does not exist in the tenant.
 * @throws {ValidationError} If the card is not archived.
 * @throws {ForbiddenOperationError} If its card type is still archived.
 */
export async function restoreCard(
  cardId: string,
  actor: LifecycleActor,
): Promise<Card> {
  const card = await requireCard(cardId, actor.tenantId);
  const restoreTo = assertCanRestore(card.status, card.statusBeforeArchive, "Card");

  await assertCardTypeNotArchived(card.cardTypeId, actor.tenantId);

  return applyCardTransition(
    cardId,
    actor,
    {
      status: restoreTo,
      archivedAt: null,
      archivedBy: null,
      statusBeforeArchive: null,
      archivedViaTypeId: null,
    },
    { from: "archived", to: restoreTo, transition: "restore" },
    "archived",
  );
}

/**
 * Guard: a card cannot be restored while its card type sits in the trash.
 *
 * @throws {ForbiddenOperationError} If the owning card type is archived.
 */
async function assertCardTypeNotArchived(
  cardTypeId: string,
  tenantId: string,
): Promise<void> {
  const [type] = await db
    .select({ name: cardTypes.name, status: cardTypes.status })
    .from(cardTypes)
    .where(and(eq(cardTypes.id, cardTypeId), eq(cardTypes.tenantId, tenantId)))
    .limit(1);

  if (type && type.status === "archived") {
    throw new ForbiddenOperationError(
      `Cannot restore this card because its card type "${type.name}" is archived. ` +
        `Restore the card type first — restoring the card now would leave it ` +
        `scheduled for deletion along with its type.`,
    );
  }
}

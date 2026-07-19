/**
 * Server Actions — Card / CardType lifecycle
 *
 * Role matrix (deliberately asymmetric, matching the project's existing rules):
 *   Cards      → ADMIN  (card CRUD is already admin-level)
 *   CardTypes  → MASTER (every card type mutation is master-only, and archiving
 *                        one cascades to every card of that type)
 *
 * The `override` permission is unrelated to these actions: it governs scanning,
 * which is phase 2.
 */

"use server";

import { z } from "zod";
import {
  actionHandler,
  requireAdmin,
  requireMaster,
  type ActionResult,
} from "@/lib/api";
import {
  activateCard,
  deactivateCard,
  archiveCard,
  restoreCard,
  activateCardType,
  deactivateCardType,
  archiveCardType,
  restoreCardType,
  hardDeleteArchivedCard,
  hardDeleteArchivedCardType,
  hardDeleteAllArchived,
  type CardTypeCascadeResult,
  type EmptyTrashResult,
} from "@/lib/server/lifecycle";
import { NotFoundError } from "@/lib/dal";
import type { Card, CardType } from "@/lib/dal";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const CardIdSchema = z.string().uuid();
const CardTypeIdSchema = z.string().uuid();

// ─── Card lifecycle (admin) ──────────────────────────────────────────────────

/**
 * Switch a card back on: inactive | expired → active.
 * @role admin | master
 */
export async function activateCardAction(
  cardId: unknown,
): Promise<ActionResult<Card>> {
  return actionHandler(async () => {
    const { userId, tenantId } = await requireAdmin();
    const id = CardIdSchema.parse(cardId);
    return activateCard(id, { userId, tenantId });
  });
}

/**
 * Switch a card off: active → inactive. Not a delete — the card is kept forever
 * and never enters the trash.
 * @role admin | master
 */
export async function deactivateCardAction(
  cardId: unknown,
): Promise<ActionResult<Card>> {
  return actionHandler(async () => {
    const { userId, tenantId } = await requireAdmin();
    const id = CardIdSchema.parse(cardId);
    return deactivateCard(id, { userId, tenantId });
  });
}

/**
 * Move a card to the trash. It stops appearing in management lists and starts
 * counting down to physical deletion.
 * @role admin | master
 */
export async function archiveCardAction(
  cardId: unknown,
): Promise<ActionResult<Card>> {
  return actionHandler(async () => {
    const { userId, tenantId } = await requireAdmin();
    const id = CardIdSchema.parse(cardId);
    return archiveCard(id, { userId, tenantId });
  });
}

/**
 * Restore a card from the trash to its pre-archive status.
 * Fails if the card's type is still archived.
 * @role admin | master
 */
export async function restoreCardAction(
  cardId: unknown,
): Promise<ActionResult<Card>> {
  return actionHandler(async () => {
    const { userId, tenantId } = await requireAdmin();
    const id = CardIdSchema.parse(cardId);
    return restoreCard(id, { userId, tenantId });
  });
}

// ─── CardType lifecycle (master) ─────────────────────────────────────────────

/**
 * Switch a card type back on: inactive → active. Does not touch its cards.
 * @role master
 */
export async function activateCardTypeAction(
  cardTypeId: unknown,
): Promise<ActionResult<CardType>> {
  return actionHandler(async () => {
    const { userId, tenantId } = await requireMaster();
    const id = CardTypeIdSchema.parse(cardTypeId);
    return activateCardType(id, { userId, tenantId });
  });
}

/**
 * Switch a card type off: active → inactive. Does not touch its cards.
 * @role master
 */
export async function deactivateCardTypeAction(
  cardTypeId: unknown,
): Promise<ActionResult<CardType>> {
  return actionHandler(async () => {
    const { userId, tenantId } = await requireMaster();
    const id = CardTypeIdSchema.parse(cardTypeId);
    return deactivateCardType(id, { userId, tenantId });
  });
}

/**
 * Move a card type to the trash, cascading to every one of its live cards.
 * @role master
 */
export async function archiveCardTypeAction(
  cardTypeId: unknown,
): Promise<ActionResult<CardTypeCascadeResult>> {
  return actionHandler(async () => {
    const { userId, tenantId } = await requireMaster();
    const id = CardTypeIdSchema.parse(cardTypeId);
    return archiveCardType(id, { userId, tenantId });
  });
}

/**
 * Restore a card type and exactly the cards it dragged into the trash.
 * Cards archived individually stay archived.
 * @role master
 */
export async function restoreCardTypeAction(
  cardTypeId: unknown,
): Promise<ActionResult<CardTypeCascadeResult>> {
  return actionHandler(async () => {
    const { userId, tenantId } = await requireMaster();
    const id = CardTypeIdSchema.parse(cardTypeId);
    return restoreCardType(id, { userId, tenantId });
  });
}

// ─── Hard delete / purge (master) — phase 4 ──────────────────────────────────
//
// The physical delete is master-only and irreversible. Each action revalidates
// that the target is archived (the primitive's WHERE guards it) and surfaces a
// NOT_FOUND when nothing matched — i.e. the row was live, already purged, or of
// another tenant.

/**
 * Permanently delete one archived card and everything that cascades from it.
 * Irreversible. Fails if the card is not an archived row of the caller's tenant.
 * @role master
 */
export async function purgeArchivedCardNowAction(
  cardId: unknown,
): Promise<ActionResult<{ deleted: true }>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    const id = CardIdSchema.parse(cardId);
    const removed = await hardDeleteArchivedCard(id, tenantId);
    if (removed === 0) throw new NotFoundError("Archived card", id);
    return { deleted: true as const };
  });
}

/**
 * Permanently delete one archived card type and its whole cascade (every card of
 * the type and all its schema). Irreversible. Fails if the type is not an
 * archived row of the caller's tenant.
 * @role master
 */
export async function purgeArchivedCardTypeNowAction(
  cardTypeId: unknown,
): Promise<ActionResult<{ deleted: true }>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    const id = CardTypeIdSchema.parse(cardTypeId);
    const removed = await hardDeleteArchivedCardType(id, tenantId);
    if (removed === 0) throw new NotFoundError("Archived card type", id);
    return { deleted: true as const };
  });
}

/**
 * Empty the entire trash: permanently delete every archived card type and card
 * of the caller's tenant. Irreversible.
 * @role master
 */
export async function emptyTrashAction(): Promise<
  ActionResult<EmptyTrashResult>
> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    return hardDeleteAllArchived(tenantId);
  });
}

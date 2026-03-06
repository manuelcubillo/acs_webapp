/**
 * Server Actions — Cards
 *
 * Create, read, update, delete and search operations on cards.
 * All tenant-scoped; tenantId is always taken from the session.
 *
 * Role matrix:
 *   OPERATOR: read cards, search, list
 *   ADMIN:    above + create, update values, update code, delete
 *   MASTER:   all (inherits admin)
 */

"use server";

import { z } from "zod";
import {
  actionHandler,
  requireOperator,
  requireAdmin,
  type ActionResult,
} from "@/lib/api";
import {
  createCard,
  getCardByCode,
  getCardById,
  updateCard,
  updateCardCode,
  deleteCard,
  listCards,
  searchCards,
} from "@/lib/dal";
import type {
  CardWithFields,
  PaginatedResult,
  SearchCardsInput,
} from "@/lib/dal";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const SearchOperatorSchema = z.enum(["eq", "contains", "gt", "lt", "gte", "lte"]);

const SearchFilterSchema = z.object({
  fieldDefinitionId: z.string().uuid(),
  operator: SearchOperatorSchema,
  value: z.unknown(),
});

const CreateCardSchema = z.object({
  cardTypeId: z.string().uuid(),
  code: z.string().min(1).max(100),
  /** Values keyed by fieldDefinitionId. */
  values: z.record(z.string().uuid(), z.unknown()),
});

const UpdateCardSchema = z.object({
  /** Values keyed by fieldDefinitionId. */
  values: z.record(z.string().uuid(), z.unknown()),
});

const UpdateCardCodeSchema = z.object({
  newCode: z.string().min(1).max(100),
});

const ListCardsSchema = z.object({
  cardTypeId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

const SearchCardsSchema = z.object({
  cardTypeId: z.string().uuid(),
  codeContains: z.string().optional(),
  filters: z.array(SearchFilterSchema).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

// ─── OPERATOR actions (read-only + action execution) ─────────────────────────

/**
 * Get a card by its tenant-scoped code.
 * @role operator | admin | master
 */
export async function getCardByCodeAction(
  code: string,
): Promise<ActionResult<CardWithFields>> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    return getCardByCode(code, tenantId);
  });
}

/**
 * Get a card by its internal UUID.
 * @role operator | admin | master
 */
export async function getCardByIdAction(
  id: string,
): Promise<ActionResult<CardWithFields>> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    return getCardById(id, tenantId);
  });
}

/**
 * List cards for a given card type (paginated).
 * @role operator | admin | master
 */
export async function listCardsAction(
  input: unknown,
): Promise<ActionResult<PaginatedResult<CardWithFields>>> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    const data = ListCardsSchema.parse(input);
    return listCards(data.cardTypeId, tenantId, {
      limit: data.limit,
      offset: data.offset,
    });
  });
}

/**
 * Search cards with optional code partial match and field filters.
 * @role operator | admin | master
 */
export async function searchCardsAction(
  input: unknown,
): Promise<ActionResult<PaginatedResult<CardWithFields>>> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    const data = SearchCardsSchema.parse(input);

    const searchInput: SearchCardsInput = {
      codeContains: data.codeContains,
      filters: data.filters,
    };

    return searchCards(data.cardTypeId, tenantId, searchInput, {
      limit: data.limit,
      offset: data.offset,
    });
  });
}

// ─── ADMIN actions (card mutations) ──────────────────────────────────────────

/**
 * Create a new card for the current tenant.
 * @role admin | master
 */
export async function createCardAction(
  input: unknown,
): Promise<ActionResult<CardWithFields>> {
  return actionHandler(async () => {
    const { tenantId } = await requireAdmin();
    const data = CreateCardSchema.parse(input);
    return createCard(data.cardTypeId, tenantId, data.code, data.values);
  });
}

/**
 * Update a card's field values.
 * @role admin | master
 */
export async function updateCardAction(
  code: string,
  input: unknown,
): Promise<ActionResult<CardWithFields>> {
  return actionHandler(async () => {
    const { tenantId } = await requireAdmin();
    const data = UpdateCardSchema.parse(input);
    return updateCard(code, tenantId, data.values);
  });
}

/**
 * Change a card's public code.
 * Returns the full card with enriched field values after the update.
 * @role admin | master
 */
export async function updateCardCodeAction(
  id: string,
  input: unknown,
): Promise<ActionResult<CardWithFields>> {
  return actionHandler(async () => {
    const { tenantId } = await requireAdmin();
    const { newCode } = UpdateCardCodeSchema.parse(input);
    // updateCardCode returns the plain Card row; fetch enriched result after.
    await updateCardCode(id, tenantId, newCode);
    return getCardById(id, tenantId);
  });
}

/**
 * Soft-delete a card (sets status → inactive).
 * @role admin | master
 */
export async function deleteCardAction(
  code: string,
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    const { tenantId } = await requireAdmin();
    await deleteCard(code, tenantId);
  });
}

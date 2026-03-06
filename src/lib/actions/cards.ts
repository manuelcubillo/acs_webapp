/**
 * Server Actions — Cards
 *
 * Create, read, update, delete and search operations on cards.
 * All tenant-scoped; tenantId is always taken from the session.
 */

"use server";

import { z } from "zod";
import { actionHandler, requireTenant, type ActionResult } from "@/lib/api";
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

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Create a new card for the current tenant.
 */
export async function createCardAction(
  input: unknown,
): Promise<ActionResult<CardWithFields>> {
  return actionHandler(async () => {
    const { tenantId } = await requireTenant();
    const data = CreateCardSchema.parse(input);
    return createCard(data.cardTypeId, tenantId, data.code, data.values);
  });
}

/**
 * Get a card by its tenant-scoped code.
 */
export async function getCardByCodeAction(
  code: string,
): Promise<ActionResult<CardWithFields>> {
  return actionHandler(async () => {
    const { tenantId } = await requireTenant();
    return getCardByCode(code, tenantId);
  });
}

/**
 * Get a card by its internal UUID.
 */
export async function getCardByIdAction(
  id: string,
): Promise<ActionResult<CardWithFields>> {
  return actionHandler(async () => {
    const { tenantId } = await requireTenant();
    return getCardById(id, tenantId);
  });
}

/**
 * Update a card's field values.
 */
export async function updateCardAction(
  code: string,
  input: unknown,
): Promise<ActionResult<CardWithFields>> {
  return actionHandler(async () => {
    const { tenantId } = await requireTenant();
    const data = UpdateCardSchema.parse(input);
    return updateCard(code, tenantId, data.values);
  });
}

/**
 * Change a card's public code.
 * Returns the full card with enriched field values after the update.
 */
export async function updateCardCodeAction(
  id: string,
  input: unknown,
): Promise<ActionResult<CardWithFields>> {
  return actionHandler(async () => {
    const { tenantId } = await requireTenant();
    const { newCode } = UpdateCardCodeSchema.parse(input);
    // updateCardCode returns the plain Card row; fetch enriched result after.
    await updateCardCode(id, tenantId, newCode);
    return getCardById(id, tenantId);
  });
}

/**
 * Soft-delete a card (sets status → inactive).
 */
export async function deleteCardAction(
  code: string,
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    const { tenantId } = await requireTenant();
    await deleteCard(code, tenantId);
  });
}

/**
 * List cards for a given card type (paginated).
 */
export async function listCardsAction(
  input: unknown,
): Promise<ActionResult<PaginatedResult<CardWithFields>>> {
  return actionHandler(async () => {
    const { tenantId } = await requireTenant();
    const data = ListCardsSchema.parse(input);
    return listCards(data.cardTypeId, tenantId, {
      limit: data.limit,
      offset: data.offset,
    });
  });
}

/**
 * Search cards with optional code partial match and field filters.
 */
export async function searchCardsAction(
  input: unknown,
): Promise<ActionResult<PaginatedResult<CardWithFields>>> {
  return actionHandler(async () => {
    const { tenantId } = await requireTenant();
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

/**
 * Server Actions — Cards
 *
 * Create, read, update, delete and search operations on cards.
 * All tenant-scoped; tenantId is always taken from the session.
 *
 * Role matrix:
 *   OPERATOR: read cards, search, list, execute operational scans
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
  getScanValidationsByCardType,
  getAutoExecuteActions,
  logScanEntry,
  executeAction,
} from "@/lib/dal";
import type {
  CardWithFields,
  PaginatedResult,
  SearchCardsInput,
  ScanWithAutoActionsResult,
  AutoActionResult,
} from "@/lib/dal";
import {
  validateScan,
  type ScanValidationResult,
} from "@/lib/validation/scan-validator";

// ─── Composite types ──────────────────────────────────────────────────────────

/** Card data enriched with scan validation results, returned on lookup/scan. */
export interface CardScanResult {
  card: CardWithFields;
  scanResult: ScanValidationResult;
}

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
 * Also runs all active scan validations and returns results alongside the card.
 * This is the INFORMATIONAL lookup — it does NOT log a scan entry or run auto-actions.
 * @role operator | admin | master
 */
export async function getCardByCodeAction(
  code: string,
): Promise<ActionResult<CardScanResult>> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    const card = await getCardByCode(code, tenantId);

    // Run scan validations (never throws — informational only)
    const svRules = await getScanValidationsByCardType(card.cardTypeId);
    const scanResult = validateScan(card.fields, svRules);

    return { card, scanResult };
  });
}

/**
 * Operational card scan: logs a scan entry, runs auto-execute actions, and
 * returns validation results.
 *
 * This is the OPERATIONAL path used when an operator actually scans a card
 * (via camera, barcode reader, or manual code input after confirmation).
 * It differs from getCardByCodeAction in that it:
 *   1. Inserts a log entry with log_type = "scan".
 *   2. Finds and executes all is_auto_execute = true action definitions.
 *   3. Returns the full result including auto-action outcomes.
 *
 * Auto-action failures are non-blocking — all auto-actions are attempted
 * even if one fails; errors are reported per-action in the result.
 *
 * @role operator | admin | master
 */
export async function executeScanWithAutoActionsAction(
  code: string,
): Promise<ActionResult<ScanWithAutoActionsResult>> {
  return actionHandler(async () => {
    const { userId, tenantId } = await requireOperator();

    // 1. Load card (throws NotFoundError if not found)
    const card = await getCardByCode(code, tenantId);

    // 2. Run scan validations (informational — never blocks)
    const svRules = await getScanValidationsByCardType(card.cardTypeId);
    const scanResult = validateScan(card.fields, svRules);

    // 3. Log the scan entry (log_type = "scan")
    await logScanEntry({
      cardId: card.id,
      tenantId,
      executedBy: userId,
      metadata: { method: "operational_scan", cardCode: code },
    });

    // 4. Get and execute all auto-execute actions (non-blocking per action)
    const autoActionDefs = await getAutoExecuteActions(card.cardTypeId);
    const autoActions: AutoActionResult[] = await Promise.all(
      autoActionDefs.map(async (def): Promise<AutoActionResult> => {
        try {
          const result = await executeAction({
            cardId: card.id,
            actionDefinitionId: def.id,
            tenantId,
            executedBy: userId,
          });
          return {
            actionDefinitionId: def.id,
            actionName: def.name,
            success: true,
            result,
          };
        } catch (err) {
          return {
            actionDefinitionId: def.id,
            actionName: def.name,
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          };
        }
      }),
    );

    return { card, scanResult, autoActions };
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

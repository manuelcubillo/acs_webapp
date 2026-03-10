/**
 * Server Actions — Action History
 *
 * Paginated full-history queries, field-level filter options, and CSV export.
 * All actions require OPERATOR+ access.
 */

"use server";

import { z } from "zod";
import { actionHandler, requireOperator, type ActionResult } from "@/lib/api";
import {
  getActionHistory,
  getActionHistoryForExport,
  getHistoryFilterOptions,
  getFilterableFieldDefinitions,
  buildCsvFromEntries,
} from "@/lib/dal";
import type {
  ActionHistoryFilters,
  ActionHistoryEntry,
  HistoryFilterOptions,
  FilterableFieldDefinition,
  PaginatedResult,
} from "@/lib/dal";

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const FieldFilterOperatorSchema = z.enum([
  "contains",
  "starts_with",
  "equals_text",
  "eq",
  "gt",
  "lt",
  "gte",
  "lte",
  "between",
  "is_true",
  "is_false",
  "date_eq",
  "date_before",
  "date_after",
  "date_between",
]);

const FieldFilterSchema = z.object({
  fieldDefinitionId: z.string().uuid(),
  operator: FieldFilterOperatorSchema,
  value: z.unknown(),
});

const ActionHistoryFiltersSchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  logTypes: z.array(z.enum(["scan", "action"])).optional(),
  cardTypeId: z.string().uuid().optional(),
  actionDefinitionIds: z.array(z.string().uuid()).optional(),
  executedBy: z.string().optional(),
  cardCode: z.string().max(500).optional(),
  fieldFilters: z.array(FieldFilterSchema).optional(),
});

const PAGE_SIZE = 50;

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Fetch one page of action history with optional filters.
 * Page is 1-based; page size is fixed at 50.
 */
export async function getActionHistoryAction(
  rawFilters: unknown,
  page: number,
): Promise<ActionResult<PaginatedResult<ActionHistoryEntry>>> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    const filters = ActionHistoryFiltersSchema.parse(rawFilters);
    return getActionHistory(tenantId, filters as ActionHistoryFilters, {
      page: Math.max(1, Math.floor(page)),
      pageSize: PAGE_SIZE,
    });
  });
}

/**
 * Export the currently filtered history as a CSV string.
 * Capped at 10,000 rows.
 *
 * Returns:
 *   - csv:           The CSV content as a string.
 *   - totalExported: Number of rows included.
 *   - capped:        True when the result was truncated at 10,000.
 */
export async function exportActionHistoryAction(
  rawFilters: unknown,
): Promise<ActionResult<{ csv: string; totalExported: number; capped: boolean }>> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    const filters = ActionHistoryFiltersSchema.parse(rawFilters);
    const { entries, capped } = await getActionHistoryForExport(
      tenantId,
      filters as ActionHistoryFilters,
    );
    const csv = buildCsvFromEntries(entries);
    return { csv, totalExported: entries.length, capped };
  });
}

/**
 * Returns dropdown options for the history filter panel:
 * card types, action definitions, and users for this tenant.
 */
export async function getHistoryFilterOptionsAction(): Promise<
  ActionResult<HistoryFilterOptions>
> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    return getHistoryFilterOptions(tenantId);
  });
}

/**
 * Returns filterable field definitions for a card type.
 * Photo fields are excluded. Used by HistoryFieldFilters when a card type
 * is selected to populate the field filter builder.
 */
export async function getFieldDefinitionsForFilterAction(
  cardTypeId: string,
): Promise<ActionResult<FilterableFieldDefinition[]>> {
  return actionHandler(async () => {
    await requireOperator();
    const parsed = z.string().uuid().parse(cardTypeId);
    return getFilterableFieldDefinitions(parsed);
  });
}

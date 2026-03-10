/**
 * Action History DAL
 *
 * Full-history queries for a tenant's action_logs with support for:
 *   - Date range, log-type, card-type, action, user, card-code filters
 *   - Structured field-level EXISTS subquery filters
 *   - Offset-based pagination (page size fixed at 50 in the server action)
 *   - Bulk export (capped at 10,000 rows)
 *   - Summary field enrichment (reuses card_type_summary_fields config)
 *
 * Performance notes:
 *   - Base query uses the (tenant_id, executed_at DESC) index.
 *   - Field-level filters use correlated EXISTS subqueries, optimised by PG.
 *   - COUNT query uses LEAST(count(*), 10001) to cap expensive full scans.
 *     When total === 10001, the UI displays ">10,000".
 */

import { eq, and, or, desc, inArray, ilike, gte, lte, isNotNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  actionLogs,
  cards,
  cardTypes,
  actionDefinitions,
  cardTypeSummaryFields,
  fieldValues,
  fieldDefinitions,
  user,
} from "@/lib/db/schema";
import { extractValue } from "./field-values";
import type {
  ActionHistoryFilters,
  ActionHistoryEntry,
  HistoryFilterOptions,
  FilterableFieldDefinition,
  FieldFilter,
  PaginatedResult,
} from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Returned count is capped here so large COUNT queries don't time out. */
const COUNT_CAP = 10001;

/** Hard row cap for CSV exports. */
export const EXPORT_ROW_CAP = 10000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Escape % and _ characters in LIKE / ILIKE patterns. */
function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Build a correlated EXISTS subquery SQL fragment for a single field filter.
 * The outer table alias is `action_logs` (the actual DB table name).
 */
function buildFieldFilterSQL(filter: FieldFilter): SQL | null {
  const { fieldDefinitionId, operator, value } = filter;
  if (!fieldDefinitionId) return null;

  // Shared correlated sub-WHERE prefix (parameterised)
  const base = sql`fv.card_id = action_logs.card_id AND fv.field_definition_id = ${fieldDefinitionId}::uuid`;

  switch (operator) {
    case "contains": {
      const v = "%" + escapeLike(String(value ?? "")) + "%";
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE ${base} AND fv.value_text ILIKE ${v})`;
    }
    case "starts_with": {
      const v = escapeLike(String(value ?? "")) + "%";
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE ${base} AND fv.value_text ILIKE ${v})`;
    }
    case "equals_text": {
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE ${base} AND fv.value_text = ${String(value ?? "")})`;
    }
    case "eq": {
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE ${base} AND fv.value_number = ${Number(value)})`;
    }
    case "gt": {
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE ${base} AND fv.value_number > ${Number(value)})`;
    }
    case "lt": {
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE ${base} AND fv.value_number < ${Number(value)})`;
    }
    case "gte": {
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE ${base} AND fv.value_number >= ${Number(value)})`;
    }
    case "lte": {
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE ${base} AND fv.value_number <= ${Number(value)})`;
    }
    case "between": {
      const r = value as { min?: unknown; max?: unknown } | null;
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE ${base} AND fv.value_number BETWEEN ${Number(r?.min ?? 0)} AND ${Number(r?.max ?? 0)})`;
    }
    case "is_true": {
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE ${base} AND fv.value_boolean = true)`;
    }
    case "is_false": {
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE ${base} AND fv.value_boolean = false)`;
    }
    case "date_eq": {
      const d = value instanceof Date ? value : new Date(String(value ?? ""));
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE ${base} AND fv.value_date::date = ${d}::date)`;
    }
    case "date_before": {
      const d = value instanceof Date ? value : new Date(String(value ?? ""));
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE ${base} AND fv.value_date < ${d})`;
    }
    case "date_after": {
      const d = value instanceof Date ? value : new Date(String(value ?? ""));
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE ${base} AND fv.value_date > ${d})`;
    }
    case "date_between": {
      const r = value as { min?: unknown; max?: unknown } | null;
      const mn = r?.min instanceof Date ? r.min : new Date(String(r?.min ?? ""));
      const mx = r?.max instanceof Date ? r.max : new Date(String(r?.max ?? ""));
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE ${base} AND fv.value_date BETWEEN ${mn} AND ${mx})`;
    }
    default:
      return null;
  }
}

/**
 * Build the full WHERE clause for the history query.
 * Always includes the tenantId guard; other conditions are appended as active.
 */
function buildWhere(tenantId: string, filters: ActionHistoryFilters) {
  const conds: (SQL | undefined)[] = [eq(actionLogs.tenantId, tenantId)];

  if (filters.dateFrom) conds.push(gte(actionLogs.executedAt, filters.dateFrom));
  if (filters.dateTo)   conds.push(lte(actionLogs.executedAt, filters.dateTo));

  if (filters.logTypes?.length) {
    const ltConds = filters.logTypes.map((lt) => eq(actionLogs.logType, lt));
    conds.push(ltConds.length === 1 ? ltConds[0] : or(...ltConds));
  }

  if (filters.cardTypeId) conds.push(eq(cards.cardTypeId, filters.cardTypeId));

  if (filters.actionDefinitionIds?.length) {
    conds.push(inArray(actionLogs.actionDefinitionId, filters.actionDefinitionIds));
  }

  if (filters.executedBy) conds.push(eq(actionLogs.executedBy, filters.executedBy));

  if (filters.cardCode) {
    conds.push(ilike(cards.code, `%${escapeLike(filters.cardCode)}%`));
  }

  if (filters.fieldFilters?.length && filters.cardTypeId) {
    for (const ff of filters.fieldFilters) {
      const c = buildFieldFilterSQL(ff);
      if (c) conds.push(c);
    }
  }

  return and(...conds);
}

// ─── Summary field enrichment (shared with activity-feed) ─────────────────────

type RawRow = {
  id: string;
  logType: "scan" | "action";
  cardId: string;
  cardCode: string;
  cardTypeId: string;
  cardTypeName: string;
  actionDefinitionId: string | null;
  actionName: string | null;
  actionColor: string | null;
  actionIcon: string | null;
  executedAt: Date;
  executedBy: string | null;
  executedByName: string | null;
  metadata: unknown;
};

async function enrichWithSummaryFields(
  tenantId: string,
  rows: RawRow[],
): Promise<ActionHistoryEntry[]> {
  if (rows.length === 0) return [];

  const cardTypeIds = [...new Set(rows.map((r) => r.cardTypeId))];
  const cardIds = [...new Set(rows.map((r) => r.cardId))];

  // Load summary field definitions for all card types
  const summaryFieldDefs = await db
    .select({
      cardTypeId: cardTypeSummaryFields.cardTypeId,
      fieldDefinitionId: cardTypeSummaryFields.fieldDefinitionId,
      label: fieldDefinitions.label,
      fieldType: fieldDefinitions.fieldType,
      position: cardTypeSummaryFields.position,
    })
    .from(cardTypeSummaryFields)
    .innerJoin(
      fieldDefinitions,
      eq(cardTypeSummaryFields.fieldDefinitionId, fieldDefinitions.id),
    )
    .where(
      and(
        eq(cardTypeSummaryFields.tenantId, tenantId),
        inArray(cardTypeSummaryFields.cardTypeId, cardTypeIds),
      ),
    )
    .orderBy(cardTypeSummaryFields.position);

  const summaryDefsByType = new Map<
    string,
    { fieldDefinitionId: string; label: string; fieldType: string }[]
  >();
  for (const d of summaryFieldDefs) {
    const list = summaryDefsByType.get(d.cardTypeId) ?? [];
    list.push(d);
    summaryDefsByType.set(d.cardTypeId, list);
  }

  const allFieldDefIds = [...new Set(summaryFieldDefs.map((d) => d.fieldDefinitionId))];

  let fvRows: {
    cardId: string;
    fieldDefinitionId: string;
    valueText: string | null;
    valueNumber: number | null;
    valueBoolean: boolean | null;
    valueDate: Date | null;
    valueJson: unknown;
  }[] = [];

  if (allFieldDefIds.length > 0 && cardIds.length > 0) {
    fvRows = await db
      .select({
        cardId: fieldValues.cardId,
        fieldDefinitionId: fieldValues.fieldDefinitionId,
        valueText: fieldValues.valueText,
        valueNumber: fieldValues.valueNumber,
        valueBoolean: fieldValues.valueBoolean,
        valueDate: fieldValues.valueDate,
        valueJson: fieldValues.valueJson,
      })
      .from(fieldValues)
      .where(
        and(
          inArray(fieldValues.cardId, cardIds),
          inArray(fieldValues.fieldDefinitionId, allFieldDefIds),
        ),
      );
  }

  const fvMap = new Map<string, typeof fvRows[0]>();
  for (const fv of fvRows) {
    fvMap.set(`${fv.cardId}:${fv.fieldDefinitionId}`, fv);
  }

  return rows.map((row): ActionHistoryEntry => {
    const defs = summaryDefsByType.get(row.cardTypeId) ?? [];
    const summaryFields = defs.map((def) => {
      const fv = fvMap.get(`${row.cardId}:${def.fieldDefinitionId}`);
      const value = fv
        ? extractValue(
            fv as Parameters<typeof extractValue>[0],
            def.fieldType as Parameters<typeof extractValue>[1],
          )
        : null;
      return { label: def.label, value, fieldType: def.fieldType as "text" };
    });

    return {
      id: row.id,
      logType: row.logType,
      cardId: row.cardId,
      cardCode: row.cardCode,
      cardTypeId: row.cardTypeId,
      cardTypeName: row.cardTypeName,
      actionDefinitionId: row.actionDefinitionId,
      actionName: row.actionName,
      actionColor: row.actionColor,
      actionIcon: row.actionIcon,
      executedAt: row.executedAt,
      executedBy: row.executedBy,
      executedByName: row.executedByName,
      metadata: row.metadata as Record<string, unknown> | null,
      operatorOverride:
        (row.metadata as Record<string, unknown> | null)?.operator_override === true,
      summaryFields,
    };
  });
}

// ─── Base query builder ───────────────────────────────────────────────────────

function baseQuery(tenantId: string, filters: ActionHistoryFilters) {
  const whereClause = buildWhere(tenantId, filters);
  return db
    .select({
      id: actionLogs.id,
      logType: actionLogs.logType,
      cardId: actionLogs.cardId,
      cardCode: cards.code,
      cardTypeId: cards.cardTypeId,
      cardTypeName: cardTypes.name,
      actionDefinitionId: actionLogs.actionDefinitionId,
      actionName: actionDefinitions.name,
      actionColor: actionDefinitions.color,
      actionIcon: actionDefinitions.icon,
      executedAt: actionLogs.executedAt,
      executedBy: actionLogs.executedBy,
      executedByName: user.name,
      metadata: actionLogs.metadata,
    })
    .from(actionLogs)
    .innerJoin(cards, eq(actionLogs.cardId, cards.id))
    .innerJoin(cardTypes, eq(cards.cardTypeId, cardTypes.id))
    .leftJoin(actionDefinitions, eq(actionLogs.actionDefinitionId, actionDefinitions.id))
    .leftJoin(user, eq(actionLogs.executedBy, user.id))
    .where(whereClause);
}

// ─── getActionHistory ─────────────────────────────────────────────────────────

/**
 * Returns paginated action history for a tenant with optional filters.
 *
 * The `total` field is capped at COUNT_CAP (10001). When total === 10001 the
 * UI should display ">10,000" instead of the exact number.
 */
export async function getActionHistory(
  tenantId: string,
  filters: ActionHistoryFilters,
  pagination: { page: number; pageSize: number },
): Promise<PaginatedResult<ActionHistoryEntry>> {
  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;
  const whereClause = buildWhere(tenantId, filters);

  // ── Count (capped to avoid slow full-table scans on large datasets) ──────────
  const countRows = await db
    .select({
      count: sql<number>`cast(least(count(*), ${COUNT_CAP}) as int)`,
    })
    .from(actionLogs)
    .innerJoin(cards, eq(actionLogs.cardId, cards.id))
    .innerJoin(cardTypes, eq(cards.cardTypeId, cardTypes.id))
    .where(whereClause);

  const total = countRows[0]?.count ?? 0;

  // ── Data page ─────────────────────────────────────────────────────────────
  const rows = await baseQuery(tenantId, filters)
    .orderBy(desc(actionLogs.executedAt))
    .limit(pageSize)
    .offset(offset);

  const enriched = await enrichWithSummaryFields(tenantId, rows as RawRow[]);

  return {
    data: enriched,
    total,
    limit: pageSize,
    offset,
  };
}

// ─── getActionHistoryForExport ────────────────────────────────────────────────

/**
 * Fetches ALL matching entries for CSV export (no pagination).
 * Hard-capped at EXPORT_ROW_CAP rows to avoid memory exhaustion.
 *
 * @returns { entries, capped } — capped is true when the result was truncated.
 */
export async function getActionHistoryForExport(
  tenantId: string,
  filters: ActionHistoryFilters,
): Promise<{ entries: ActionHistoryEntry[]; capped: boolean }> {
  const rows = await baseQuery(tenantId, filters)
    .orderBy(desc(actionLogs.executedAt))
    .limit(EXPORT_ROW_CAP + 1); // fetch one extra to detect truncation

  const capped = rows.length > EXPORT_ROW_CAP;
  const sliced = capped ? rows.slice(0, EXPORT_ROW_CAP) : rows;

  const enriched = await enrichWithSummaryFields(tenantId, sliced as RawRow[]);

  return { entries: enriched, capped };
}

// ─── getHistoryFilterOptions ──────────────────────────────────────────────────

/**
 * Returns the dropdown options for the history filter panel:
 *   - Active card types for the tenant
 *   - Active action definitions (grouped by card type name for display)
 *   - Distinct users who appear in action_logs for the tenant
 */
export async function getHistoryFilterOptions(
  tenantId: string,
): Promise<HistoryFilterOptions> {
  const [cardTypeRows, actionDefRows, userRows] = await Promise.all([
    // Active card types
    db
      .select({ id: cardTypes.id, name: cardTypes.name })
      .from(cardTypes)
      .where(and(eq(cardTypes.tenantId, tenantId), eq(cardTypes.isActive, true)))
      .orderBy(cardTypes.name),

    // Active action definitions across all card types
    db
      .select({
        id: actionDefinitions.id,
        name: actionDefinitions.name,
        cardTypeId: cardTypes.id,
        cardTypeName: cardTypes.name,
      })
      .from(actionDefinitions)
      .innerJoin(cardTypes, eq(actionDefinitions.cardTypeId, cardTypes.id))
      .where(
        and(
          eq(cardTypes.tenantId, tenantId),
          eq(actionDefinitions.isActive, true),
        ),
      )
      .orderBy(cardTypes.name, actionDefinitions.name),

    // Distinct users who have executed actions / scans for the tenant
    db
      .selectDistinct({
        id: actionLogs.executedBy,
        name: user.name,
      })
      .from(actionLogs)
      .innerJoin(user, eq(actionLogs.executedBy, user.id))
      .where(and(eq(actionLogs.tenantId, tenantId), isNotNull(actionLogs.executedBy)))
      .orderBy(user.name),
  ]);

  return {
    cardTypes: cardTypeRows,
    actionDefinitions: actionDefRows,
    users: userRows
      .filter((u): u is typeof u & { id: string } => u.id !== null)
      .map((u) => ({ id: u.id, name: u.name })),
  };
}

// ─── getFilterableFieldDefinitions ───────────────────────────────────────────

/**
 * Returns active field definitions for a card type that can be used in
 * the field-level filter builder. Photo fields are excluded (not searchable).
 */
export async function getFilterableFieldDefinitions(
  cardTypeId: string,
): Promise<FilterableFieldDefinition[]> {
  const rows = await db
    .select({
      id: fieldDefinitions.id,
      name: fieldDefinitions.name,
      label: fieldDefinitions.label,
      fieldType: fieldDefinitions.fieldType,
      validationRules: fieldDefinitions.validationRules,
    })
    .from(fieldDefinitions)
    .where(
      and(
        eq(fieldDefinitions.cardTypeId, cardTypeId),
        eq(fieldDefinitions.isActive, true),
      ),
    )
    .orderBy(fieldDefinitions.position);

  // Exclude photo fields (not searchable)
  return rows
    .filter((r) => r.fieldType !== "photo")
    .map((r) => ({
      id: r.id,
      name: r.name,
      label: r.label,
      fieldType: r.fieldType,
      validationRules: r.validationRules,
    }));
}

// ─── CSV builder ─────────────────────────────────────────────────────────────

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toISOString().replace("T", " ").slice(0, 19);
  return String(value);
}

function formatDetailsCell(metadata: Record<string, unknown> | null): string {
  if (!metadata) return "—";
  const field = metadata.target_field;
  const before = metadata.before_value;
  const after = metadata.after_value;
  if (field === undefined) return "—";
  return `${field}: ${formatCsvValue(before)} → ${formatCsvValue(after)}`;
}

export function buildCsvFromEntries(
  entries: ActionHistoryEntry[],
): string {
  // Collect union of all summary field labels (sorted for stable column order)
  const allLabels = new Set<string>();
  for (const e of entries) {
    for (const sf of e.summaryFields) allLabels.add(sf.label);
  }
  const summaryLabels = [...allLabels].sort();

  const headers = [
    "Date/Time",
    "Card Code",
    "Card Type",
    "Action",
    "Executed By",
    "Override",
    ...summaryLabels,
    "Details",
  ];

  const rows = entries.map((e) => {
    const summaryValues = summaryLabels.map((label) => {
      const sf = e.summaryFields.find((f) => f.label === label);
      return sf ? formatCsvValue(sf.value) : "";
    });

    return [
      e.executedAt.toISOString().replace("T", " ").slice(0, 19),
      e.cardCode,
      e.cardTypeName,
      e.actionName ?? "Scan",
      e.executedByName ?? "—",
      e.operatorOverride ? "Yes" : "No",
      ...summaryValues,
      e.logType === "action" ? formatDetailsCell(e.metadata) : "—",
    ];
  });

  return [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((r) => r.map(escapeCsvCell).join(",")),
  ].join("\n");
}

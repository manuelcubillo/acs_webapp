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
import { isPresenceRowSql } from "./presence";
import { PRESENCE_FILTER_LABEL } from "@/lib/presence/labels";
import { historyRowLabel, lifecycleTransitionLabel } from "@/lib/history/log-types";
import {
  diffSnapshots,
  loadSnapshotsForLogRows,
  projectSnapshotFields,
  type SnapshotFieldChange,
  type SummaryFieldConfig,
} from "@/lib/snapshots";
import { excludeSystemFields } from "@/lib/fields/system";
import { formatChangeForExport, orderChangesForDisplay } from "@/lib/history/detail-format";
import type {
  FieldType,
  LogType,
  ActionHistoryFilters,
  ActionHistoryEntry,
  ActionHistorySummaryField,
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
 *
 * When fieldDefinitionIds has multiple values (multi-type filtering),
 * the subquery matches ANY of those IDs using an IN clause.
 */
function buildFieldFilterSQL(filter: FieldFilter): SQL | null {
  const { fieldDefinitionIds, operator, value } = filter;
  if (!fieldDefinitionIds?.length) return null;

  // Build field_definition_id match clause (single or IN for multiple)
  const idMatch = fieldDefinitionIds.length === 1
    ? sql`fv.field_definition_id = ${fieldDefinitionIds[0]}::uuid`
    : sql`fv.field_definition_id IN (${sql.join(
        fieldDefinitionIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`;

  // Shared correlated sub-WHERE prefix
  const base = sql`fv.card_id = action_logs.card_id AND ${idMatch}`;

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

  // Three states, not two. `undefined` is "no constraint"; a non-empty array is
  // a whitelist; an EMPTY array means the user deselected every log type and
  // must match nothing. Treating empty as "no constraint" is what would show
  // the whole table to someone who asked for none of it — and it is how
  // `card_edit` rows were reaching the table before `toEffectiveFilters` began
  // always sending an explicit list.
  if (filters.logTypes) {
    if (filters.logTypes.length === 0) {
      conds.push(sql`false`);
    } else {
      const ltConds = filters.logTypes.map((lt) => eq(actionLogs.logType, lt));
      conds.push(ltConds.length === 1 ? ltConds[0] : or(...ltConds));
    }
  }

  if (filters.cardTypeIds?.length) {
    if (filters.cardTypeIds.length === 1) {
      conds.push(eq(cards.cardTypeId, filters.cardTypeIds[0]));
    } else {
      conds.push(inArray(cards.cardTypeId, filters.cardTypeIds));
    }
  }

  if (filters.actionDefinitionIds?.length) {
    conds.push(inArray(actionLogs.actionDefinitionId, filters.actionDefinitionIds));
  }

  if (filters.executedBy) conds.push(eq(actionLogs.executedBy, filters.executedBy));

  if (filters.cardCode) {
    conds.push(ilike(cards.code, `%${escapeLike(filters.cardCode)}%`));
  }

  // A field filter carries its own fieldDefinitionIds (one per card type), so
  // it is self-contained and applies whether or not a card type is selected —
  // same as the card list. Gating it on cardTypeIds only made the filter
  // silently do nothing.
  if (filters.fieldFilters?.length) {
    for (const ff of filters.fieldFilters) {
      const c = buildFieldFilterSQL(ff);
      if (c) conds.push(c);
    }
  }

  return and(...conds);
}

// ─── Summary field enrichment ────────────────────────────────────────────────
//
// A2 moved the VALUES to the frozen snapshot. Which fields to show still comes
// from the tenant's CURRENT `card_type_summary_fields` configuration, so a
// summary field added today populates for a row from last year — while the
// values stay those of the moment the row was written.
//
// Pre-migration-0022 rows have no snapshot and there is no backfill, so the old
// live join is still here, now loaded ONLY for the cards those rows point at.
// On a page written entirely after 0022 it costs no query at all.

type RawRow = {
  id: string;
  logType: LogType;
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
  /** Derived in SQL by `isPresenceRowSql`, not stored. */
  isPresence: boolean;
  /** Null for a row written before migration 0022. */
  cardSnapshotId: string | null;
  snapshotCreated: boolean;
};

/**
 * Reduce a `photo` change to a presence flag.
 *
 * The payload holds a storage object key. It must not reach the browser (ADR
 * `2026-08-02-card-list-photos-stable-route.md`) and would be meaningless in a
 * Detail cell, so all a photo change can report is whether an image arrived,
 * left, or was replaced. Historical photo serving is out of scope: the key in
 * an old payload may point at an image that has since been overwritten.
 */
function reducePhotoChanges(changes: SnapshotFieldChange[]): SnapshotFieldChange[] {
  return changes.map((c) =>
    c.type === "photo"
      ? {
          ...c,
          before: typeof c.before === "string" && c.before.length > 0,
          after: typeof c.after === "string" && c.after.length > 0,
        }
      : c,
  );
}

async function enrichWithSummaryFields(
  tenantId: string,
  rows: RawRow[],
): Promise<ActionHistoryEntry[]> {
  if (rows.length === 0) return [];

  const cardTypeIds = [...new Set(rows.map((r) => r.cardTypeId))];

  // ── Which fields this surface shows: today's configuration ────────────────
  //
  // Photo fields are NOT excluded here, unlike the dashboard feed's config:
  // `HistoryTableRow` renders a thumbnail for one, addressed by route from the
  // card code plus the field id.
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

  const summaryDefsByType = new Map<string, SummaryFieldConfig[]>();
  for (const d of summaryFieldDefs) {
    const list = summaryDefsByType.get(d.cardTypeId) ?? [];
    list.push({
      fieldDefinitionId: d.fieldDefinitionId,
      label: d.label,
      fieldType: d.fieldType as FieldType,
    });
    summaryDefsByType.set(d.cardTypeId, list);
  }

  // ── The values: one query for every distinct snapshot on the page ──────────
  const snapshots = await loadSnapshotsForLogRows(tenantId, rows);

  // ── The fallback: live values, for pre-0022 rows only ──────────────────────
  const fallbackCardIds = [
    ...new Set(
      rows
        .filter((r) => !r.cardSnapshotId || !snapshots.has(r.cardSnapshotId))
        .map((r) => r.cardId),
    ),
  ];
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

  if (allFieldDefIds.length > 0 && fallbackCardIds.length > 0) {
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
          inArray(fieldValues.cardId, fallbackCardIds),
          inArray(fieldValues.fieldDefinitionId, allFieldDefIds),
        ),
      );
  }

  const fvMap = new Map<string, typeof fvRows[0]>();
  for (const fv of fvRows) {
    fvMap.set(`${fv.cardId}:${fv.fieldDefinitionId}`, fv);
  }

  /** The live join, unchanged — the only thing serving pre-0022 rows. */
  function liveSummaryFields(row: RawRow): ActionHistorySummaryField[] {
    const defs = summaryDefsByType.get(row.cardTypeId) ?? [];
    return defs.map((def): ActionHistorySummaryField => {
      const fv = fvMap.get(`${row.cardId}:${def.fieldDefinitionId}`);
      const value = fv
        ? extractValue(
            fv as Parameters<typeof extractValue>[0],
            def.fieldType as Parameters<typeof extractValue>[1],
          )
        : null;
      // A photo's stored value is an object key, which the row would otherwise
      // print as raw text. The thumbnail is addressed by route from the card
      // code + field id, so ship presence only and keep the key server-side.
      return {
        fieldDefinitionId: def.fieldDefinitionId,
        label: def.label,
        fieldType: def.fieldType,
        value:
          def.fieldType === "photo"
            ? typeof value === "string" && value.length > 0
            : value,
      };
    });
  }

  return rows.map((row): ActionHistoryEntry => {
    const defs = summaryDefsByType.get(row.cardTypeId) ?? [];
    const resolved = row.cardSnapshotId
      ? (snapshots.get(row.cardSnapshotId) ?? null)
      : null;

    // The Detail diff, and ONLY when this event changed something. A row with
    // `snapshot_created = false` observed the card without touching it, and a
    // V0 has no predecessor — `diffSnapshots` returns nothing for either, so
    // the first scan of a pre-0022 card does not render as "12 fields changed".
    const snapshotChanges =
      resolved && row.snapshotCreated
        ? orderChangesForDisplay(
            reducePhotoChanges(
              diffSnapshots(resolved.previousPayload, resolved.payload),
            ),
          )
        : [];

    return {
      id: row.id,
      logType: row.logType,
      cardId: row.cardId,
      cardCode: row.cardCode,
      cardTypeId: row.cardTypeId,
      cardTypeName: row.cardTypeName,
      // Frozen identity, for display. The live `cardCode` above stays the one
      // every link and photo route is built from, so a card renamed after this
      // row was written still navigates.
      cardCodeAtEvent: resolved?.payload.code ?? null,
      cardTypeNameAtEvent: resolved?.payload.cardTypeName ?? null,
      hasSnapshot: resolved !== null,
      snapshotCreated: row.snapshotCreated === true,
      snapshotChanges,
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
      isPresence: row.isPresence === true,
      summaryFields: resolved
        ? projectSnapshotFields(resolved.payload, defs)
        : liveSummaryFields(row),
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
      // Derived from the join, not stored — see `isPresenceRowSql`. A row with
      // no action definition (card_edit, lifecycle) can never be flagged: the
      // left join yields a null target field and the predicate requires one.
      isPresence: isPresenceRowSql,
      // The frozen card state this row observed, and whether it changed it.
      // Null / false on rows written before migration 0022.
      cardSnapshotId: actionLogs.cardSnapshotId,
      snapshotCreated: actionLogs.snapshotCreated,
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
      .where(and(eq(cardTypes.tenantId, tenantId), eq(cardTypes.status, "active")))
      .orderBy(cardTypes.name),

    // Active action definitions across all card types
    db
      .select({
        id: actionDefinitions.id,
        // The presence action is named "Presencia" internally, which tells an
        // operator nothing. It stays ONE option filtering by
        // action_definition_id — splitting it into two direction filters would
        // mean filtering on jsonb plus a new dimension across the URL keys, the
        // Zod schema, buildWhere and sanitizeHistoryQuery.
        name: sql<string>`CASE WHEN ${isPresenceRowSql}
          THEN ${PRESENCE_FILTER_LABEL}
          ELSE ${actionDefinitions.name} END`,
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
      isSystem: fieldDefinitions.isSystem,
    })
    .from(fieldDefinitions)
    .where(
      and(
        eq(fieldDefinitions.cardTypeId, cardTypeId),
        eq(fieldDefinitions.isActive, true),
      ),
    )
    .orderBy(fieldDefinitions.position);

  // Exclude photo fields (not searchable). System fields are NOT filtered here
  // — this is a DAL read; the caller declares that intent with
  // `excludeSystemFields` (see src/lib/fields/system.ts).
  return rows
    .filter((r) => r.fieldType !== "photo")
    .map((r) => ({
      id: r.id,
      name: r.name,
      label: r.label,
      fieldType: r.fieldType,
      validationRules: r.validationRules,
      isSystem: r.isSystem,
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

/**
 * The Detail cell for a row written BEFORE migration 0022.
 *
 * The only thing serving those rows: they have no snapshot and there is no
 * backfill, so `metadata.before_value` / `after_value` remain their sole record
 * of what changed — one field, the action's target. Do not delete this path.
 */
function formatLegacyDetailsCell(metadata: Record<string, unknown> | null): string {
  if (!metadata) return "—";
  const field = metadata.target_field;
  const before = metadata.before_value;
  const after = metadata.after_value;
  if (field === undefined) return "—";
  return `${field}: ${formatCsvValue(before)} → ${formatCsvValue(after)}`;
}

/**
 * The Detail cell for one exported row.
 *
 * Identical in content to what `HistoryTableRow` renders, because both derive it
 * from `snapshotChanges` through `formatChange`. The three cases mirror the
 * table exactly:
 *   - a snapshot that this event CREATED  → the field-level diff
 *   - a snapshot it merely observed        → nothing changed, so nothing to say
 *   - no snapshot (pre-0022)               → the legacy metadata pair
 *
 * System fields are dropped here rather than in `diffSnapshots`: a system
 * field's value is machine state, not a card attribute, and each surface
 * declares that intent itself (`src/lib/fields/system.ts`).
 */
function formatDetailsCell(entry: ActionHistoryEntry): string {
  if (entry.logType === "lifecycle") {
    return lifecycleTransitionLabel(entry.metadata) ?? "—";
  }
  if (entry.hasSnapshot) {
    return formatChangeForExport(excludeSystemFields(entry.snapshotChanges));
  }
  return entry.logType === "action"
    ? formatLegacyDetailsCell(entry.metadata)
    : "—";
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
      // Photo fields carry a presence flag, so they export as Yes / No — a CSV
      // cell cannot hold the image and must never hold the object key.
      const sf = e.summaryFields.find((f) => f.label === label);
      return sf ? formatCsvValue(sf.value) : "";
    });

    return [
      e.executedAt.toISOString().replace("T", " ").slice(0, 19),
      // The code and type AS OF the event, exactly as the table shows them.
      // Falls back to the live values for a row with no snapshot.
      e.cardCodeAtEvent ?? e.cardCode,
      e.cardTypeNameAtEvent ?? e.cardTypeName,
      // One shared derivation with HistoryTableRow — the export must not
      // disagree with the table it was exported from.
      historyRowLabel(e),
      e.executedByName ?? "—",
      e.operatorOverride ? "Yes" : "No",
      ...summaryValues,
      formatDetailsCell(e),
    ];
  });

  return [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((r) => r.map(escapeCsvCell).join(",")),
  ].join("\n");
}

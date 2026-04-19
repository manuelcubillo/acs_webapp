# Module: history

**Last updated**: 2026-04-19 · **Last feature**: documentation sync against source code

## Responsibility

Full audit log for the tenant: paginated view of all `action_logs` entries (scans and actions) with advanced filtering, and CSV export. Distinct from the dashboard activity feed — the feed shows a small live window; the history view provides complete retrospective access with search.

Does not write to `action_logs` (consumer only). Does not own scan execution or action execution (see `scanning` and `actions`).

## Key files

- `src/app/(dashboard)/history/page.tsx` — History page (OPERATOR+). Server-renders first page + filter options, then hydrates client-side.
- `src/components/history/ActionHistoryView.tsx` — Root client component. Manages filter state, pagination, export.
- `src/components/history/HistoryFilters.tsx` — Top-level filter panel (date range, log type, card type, action, user, card code).
- `src/components/history/HistoryFieldFilters.tsx` — Field-level filter builder (shown when a card type is selected).
- `src/components/history/HistoryTable.tsx` — Paginated results table.
- `src/components/history/HistoryTableRow.tsx` — Single row renderer (scan vs action, summary fields, override badge).
- `src/components/history/HistoryPagination.tsx` — Page controls.
- `src/components/history/HistoryScanToggle.tsx` — Toggle to include/exclude scan entries.
- `src/components/history/HistoryExportButton.tsx` — Triggers CSV export via `exportActionHistoryAction`.
- `src/lib/dal/action-history.ts` — `getActionHistory`, `getActionHistoryForExport`, `getHistoryFilterOptions`, `getFilterableFieldDefinitions`, `buildCsvFromEntries`. Core query builder with WHERE clause composition and summary-field enrichment.
- `src/lib/actions/action-history.ts` — Server Actions: `getActionHistoryAction`, `exportActionHistoryAction`, `getHistoryFilterOptionsAction`, `getFieldDefinitionsForFilterAction` (deprecated), `getCommonFieldDefinitionsAction`.

## Data model (relevant subset)

Read-only access to:

- `action_logs` — source of truth. Filtered by `tenant_id`. Joined to `cards`, `card_types`, `action_definitions`, `user`.
- `card_type_summary_fields` + `field_values` — enriches each row with the tenant-configured summary fields (same config used by the dashboard activity feed).
- `field_values` — field-level filter subqueries use correlated `EXISTS` against this table.

## Supported filters

| Filter | Description |
|--------|-------------|
| Date range | `dateFrom` / `dateTo` on `executed_at` |
| Log type | `scan`, `action`, or both |
| Card type | One or more card type IDs |
| Action definition | One or more action definition IDs |
| User | Single `executed_by` user ID |
| Card code | ILIKE partial match on `cards.code` |
| Field-level filters | Per-field conditions using 14 operators (see below) |

### Field-level filter operators

`contains`, `starts_with`, `equals_text` (text fields) · `eq`, `gt`, `lt`, `gte`, `lte`, `between` (number fields) · `is_true`, `is_false` (boolean fields) · `date_eq`, `date_before`, `date_after`, `date_between` (date fields). Photo fields are excluded (not searchable). Field filters only apply when at least one card type is selected.

## Main flows

### Paginated history load

1. `getActionHistoryAction(rawFilters, page)` validates input with Zod, requires OPERATOR.
2. `getActionHistory(tenantId, filters, { page, pageSize: 50 })` builds WHERE clause, runs capped COUNT (`LEAST(count(*), 10001)`), fetches page.
3. Each page is enriched with `card_type_summary_fields` values via `enrichWithSummaryFields`.
4. Client renders `HistoryTable`. Pagination controls call `getActionHistoryAction` on page change.

**COUNT cap**: when `total === 10001`, the UI displays ">10,000" to avoid slow full-table scans.

### CSV export

1. `exportActionHistoryAction(rawFilters)` calls `getActionHistoryForExport` — same WHERE, no pagination, hard cap at 10,000 rows.
2. `buildCsvFromEntries` serializes to CSV (columns: Date/Time, Card Code, Card Type, Action, Executed By, Override, [summary field labels], Details).
3. Returns `{ csv, totalExported, capped }`. Client triggers a browser download.

### Filter options load

`getHistoryFilterOptionsAction()` returns: active card types, active action definitions (grouped by card type), distinct users who appear in `action_logs` for the tenant. Used to populate dropdowns.

### Field filter builder

When operator selects one or more card types, `getCommonFieldDefinitionsAction(cardTypeIds)` returns common filterable fields (photo excluded). Operator picks a field, operator, and value → appended as a `FieldFilter` to the query.

## Extension points

- **New filter dimension** → extend `ActionHistoryFilters` type, `buildWhere`, and `HistoryFilters` UI.
- **New field filter operator** → add to `FieldFilterOperatorSchema` (Zod), `buildFieldFilterSQL`, and `HistoryFieldFilters` UI.
- **New export format** → add a builder alongside `buildCsvFromEntries` in `action-history.ts`.

## Module interactions

- Reads from: `action_logs` (primary source), `cards`, `card_types`, `action_definitions`, `user` (JOINs), `card_type_summary_fields` + `field_values` (enrichment), `field_definitions` (filter builder).
- Uses: `getCommonFieldDefinitions` from `fields` module (common fields across selected card types).
- Related: `dashboard` also reads from `action_logs` but for a small live feed (`getActivityFeed`), not full-history audit. Both use `card_type_summary_fields` for enrichment.
- Produced by: `actions` (action log entries) and `scanning` (scan log entries via `executeScanWithAutoActionsAction`).

## Open TODOs

- [ ] None specific (no tagged `TODO:` comments in source as of sync date).

## Recent changes

- 2026-04-19 — Module created: history feature documented for the first time (feature existed in source but had no context documentation).

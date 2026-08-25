# Module: history

**Last updated**: 2026-08-25 · **Last feature**: presence rows read as Entrada/Salida in table + CSV; the scan toggle defaults off for presence tenants

## Responsibility

Full audit log for the tenant: paginated view of all `action_logs` entries (scans and actions) with advanced filtering, and CSV export. Distinct from the dashboard activity feed — the feed shows a small live window; the history view provides complete retrospective access with search.

Does not write to `action_logs` (consumer only). Does not own scan execution or action execution (see `scanning` and `actions`).

## Key files

- `src/app/(dashboard)/history/page.tsx` — History page (OPERATOR+). Reads the view state from `searchParams`, server-renders **that** page + filter options, then hydrates client-side.
- `src/lib/history/filter-params.ts` — View state ↔ query string: `parseHistoryParams`, `buildHistoryQuery`, `sanitizeHistoryQuery` (the whitelist for the `hq` return blob), `toEffectiveFilters` (scan-toggle merge, shared by server page and client view). Dependency-free — imported by both. Its readers come from `src/lib/navigation/query-codec.ts`, shared with `cards`.
- `src/lib/history/scroll-restore.ts` — `rememberHistoryScroll` / `consumeHistoryScroll`. Pins a storage key on the shared `createScrollMemory` (`src/lib/navigation/return-scroll.ts`), so a history offset can never be restored into `/cards`.
- `src/lib/cards/return-origin.ts` — Owns the `from` / `hq` / `cq` params in both directions. `HistoryTableRow` builds its link with `cardDetailHref`; the card detail resolves it with `resolveCardOrigin`.
- `src/components/history/ActionHistoryView.tsx` — Root client component. Manages filter state, pagination, export.
- `src/components/history/HistoryFilters.tsx` — Top-level filter panel (date range, log type, card type, action, user, card code).
- `src/components/history/HistoryFieldFilters.tsx` — Loads the common field definitions for the *effective* card types (the selection, or every active type when nothing is selected — the caller decides), then delegates to the shared `src/components/shared/FieldFilterBuilder.tsx` (same component the card list uses — a fix there lands on both surfaces).
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
  ⚠️ Since 2026-07-17 the table also holds `log_type = 'lifecycle'` rows (card archive/restore/activate/deactivate). The history view and its filters cover `scan | action` only — surfacing lifecycle entries is a later phase of the archiving feature. Any new query here must filter `logType` explicitly rather than assuming two values.
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

`contains`, `starts_with`, `equals_text` (text fields) · `eq`, `gt`, `lt`, `gte`, `lte`, `between` (number fields) · `is_true`, `is_false` (boolean fields) · `date_eq`, `date_before`, `date_after`, `date_between` (date fields). Photo fields are excluded (not searchable).

A field filter is self-contained — it carries one `fieldDefinitionId` per card type — so it applies whether or not a card type is selected. ⚠️ The filter reads the card's **current** value, not the value at the time of the log: "puntos > 5" means "logs of cards that hold puntos > 5 *today*".

`select` fields reuse `equals_text` — correct, because `mapValueToColumn` stores a select value in `value_text`, not `value_json` (see `modules/fields.md`). Their value input is a dropdown of the field's configured options rather than a free-text box.

## View state in the URL

⚠️ **`scans` is the one key that is ALWAYS serialized**, as `0` or `1`. Every
other key is omitted at its default. The scan toggle's default is now
tenant-dependent — off when presence control is enabled, since each scan
produces both a scan row and a presence action row — so absence no longer has a
single meaning. `parseHistoryParams(raw, defaultShowScans)` takes it injected;
the module stays dependency-free and never becomes tenant-aware itself. Because
build always emits the key, `sanitizeHistoryQuery` round-trips an `hq` blob
exactly, which is why the card detail page can keep calling it without knowing
the tenant.

The filters, scan toggle and page number live in the query string — `df`, `dt`,
`ct`, `act`, `user`, `code`, `ff` (JSON), `scans=0|1`, `page` — so a filtered view
is shareable, survives a reload, and can be handed to another page and rebuilt.
The server page parses them and renders the requested result set directly;
`ActionHistoryView` seeds its state from the same values and mirrors every change
back with `history.replaceState` (no router navigation — the rows on screen were
just fetched). `parseHistoryParams` is deliberately lenient: it reads a URL, so
an unusable value drops out instead of throwing at the Zod boundary and leaving
an unexplained empty table. **A new filter dimension must be added to both the
query keys and `ActionHistoryFiltersSchema`, or it stops surviving navigation.**
ADR `2026-08-02-history-url-state-and-return.md`.

## Main flows

### Row → card detail → back

1. A row navigates to `/cards/[code]?from=history&hq=<current history query>`
   (whole row clickable; the code cell keeps a real `<Link>` for ⌘-click).
2. Before leaving, it stores **two** offsets keyed by that query: the table
   container's `scrollTop` (the rows scroll inside the table) and the page
   offset. The latter comes from `readPageScroll`, not `window.scrollY` —
   `DashboardShell` scrolls an inner `<main data-slot="page-scroll">`, so the
   window offset is permanently 0.
3. The card detail back link reads `from=history` for its label and rebuilds
   `/history` + `sanitizeHistoryQuery(hq)`. Sanitizing is a parse-then-build
   round trip, so the href can only ever be a history query.
4. On return, `HistoryTable` consumes the stored offsets once, and only if the
   query still matches — re-filter before coming back and it opens at the top.
   The container offset is applied a frame later (once the rows are laid out);
   the page offset goes through `restorePageScroll`, which re-applies it until
   it survives the App Router's post-navigation scroll reset.

### Paginated history load

1. `getActionHistoryAction(rawFilters, page)` validates input with Zod, requires OPERATOR.
2. `getActionHistory(tenantId, filters, { page, pageSize: 50 })` builds WHERE clause, runs capped COUNT (`LEAST(count(*), 10001)`), fetches page.
3. Each page is enriched with `card_type_summary_fields` values via `enrichWithSummaryFields`. Each entry carries the card's own `fieldDefinitionId`; a `photo` field's value is reduced to a boolean presence flag — the object key never reaches the browser.
4. Client renders `HistoryTable`. Pagination controls call `getActionHistoryAction` on page change. `HistoryTableRow` renders a `photo` summary field as a thumbnail addressed by `cardPhotoRoute(cardCode, { fieldDefinitionId })`, the same stable route the dashboard feed uses; every other type is formatted as text.

**COUNT cap**: when `total === 10001`, the UI displays ">10,000" to avoid slow full-table scans.

### CSV export

1. `exportActionHistoryAction(rawFilters)` calls `getActionHistoryForExport` — same WHERE, no pagination, hard cap at 10,000 rows.
2. `buildCsvFromEntries` serializes to CSV (columns: Date/Time, Card Code, Card Type, Action, Executed By, Override, [summary field labels], Details). A photo column exports as `Yes` / `No` — a cell can hold neither the image nor the key.
3. Returns `{ csv, totalExported, capped }`. Client triggers a browser download.

### Filter options load

`getHistoryFilterOptionsAction()` returns: active card types, active action definitions (grouped by card type), distinct users who appear in `action_logs` for the tenant. Used to populate dropdowns.

⚠️ The **action** dropdown deliberately still lists system actions (e.g. presence's "Presencia"), unlike the **field** filter builder, which excludes system fields via `excludeSystemFields` inside `getCommonFieldDefinitionsAction`. The distinction is configuration vs audit: a presence toggle produces real `action_logs` rows, so hiding it from the filter would make those rows visible in the table yet unfindable. Constraint #27 governs configuration surfaces; a log filter is a read of history.

### Field filter builder

`HistoryFilters` resolves the *effective* card types — the selection, or all of `options.cardTypes` when nothing is selected (`getHistoryFilterOptions` returns active types only) — and `getCommonFieldDefinitionsAction(effectiveTypeIds)` returns the fields common to all of them (photo excluded). Operator picks a field, operator, and value → appended as a `FieldFilter` to the query. The builder renders nothing when those types share no filterable field. Changing the type selection clears the field filters, since a filter on a field the new selection does not share would match nothing — same rule as `CardList`.

## Extension points

- **New filter dimension** → extend `ActionHistoryFilters` type, `buildWhere`, `HistoryFilters` UI, **and** the query keys in `src/lib/history/filter-params.ts` (both directions) plus `ActionHistoryFiltersSchema`. If it needs a new kind of value read out of a URL, add the reader to `src/lib/navigation/query-codec.ts` — `cards` parses the same shapes.
- **New field filter operator** → add to `FieldFilterOperatorSchema` (Zod), `buildFieldFilterSQL`, and `HistoryFieldFilters` UI.
- **New export format** → add a builder alongside `buildCsvFromEntries` in `action-history.ts`.

## Module interactions

- Reads from: `action_logs` (primary source), `cards`, `card_types`, `action_definitions`, `user` (JOINs), `card_type_summary_fields` + `field_values` (enrichment), `field_definitions` (filter builder).
- Uses: `getCommonFieldDefinitions` from `fields` module (common fields across selected card types).
- Related: `dashboard` also reads from `action_logs` but for a small live feed (`getActivityFeed`), not full-history audit. Both use `card_type_summary_fields` for enrichment.
- Navigates to: `cards` — a row opens `/cards/[code]?from=history&hq=…` via `cardDetailHref`, and the detail page's back link depends on `sanitizeHistoryQuery` from this module's `filter-params.ts`. Changing the query keys changes what a return trip can restore. The origin now survives the card's edit page too.
- Shares with `cards`: `src/lib/navigation/query-codec.ts` (URL readers) and `src/lib/navigation/return-scroll.ts` (scroll memory + page-scroll helpers). Both were extracted from this module — a change here affects `/cards`.
- Produced by: `actions` (action log entries) and `scanning` (scan log entries via `executeScanWithAutoActionsAction`).

## Open TODOs

- [ ] None specific (no tagged `TODO:` comments in source as of sync date).

## Recent changes

- 2026-08-25 — Presence rows read by DIRECTION. `getActionHistory` / `getActionHistoryForExport` project `isPresence`, derived in SQL by comparing the action's target field to `card_types.presence_field_definition_id` (`isPresenceRowSql`) — not stamped at write time, so a tenant that later disables presence sees those rows fall back to the action name, which is accepted degradation. `HistoryTableRow` and `buildCsvFromEntries` both derive the label through the single shared `presenceDirectionLabel`, so the export cannot disagree with the table. `getHistoryFilterOptions` relabels the presence action **"Entrada / Salida"** while keeping it ONE option filtering by `action_definition_id`. The scan toggle now defaults **off** when the tenant has presence enabled (every scan otherwise shows twice): `parseHistoryParams` takes the default as an injected parameter, and `buildHistoryQuery` ALWAYS serializes `scans` as `0`/`1` because absence stopped having a single meaning. ADR `2026-08-25-feed-grouping-and-scan-correlation.md`.
- 2026-08-24 — The field-filter builder now excludes `is_system = true` fields: the filter is applied in `getCommonFieldDefinitionsAction` (and in the deprecated `getFieldDefinitionsForFilterAction`), not in the DAL, so `getCommonFieldDefinitions` stays the unfiltered source of truth. `CommonFieldDefinition` / `FilterableFieldDefinition` gained `isSystem`. The **action** dropdown is deliberately left unfiltered — see "Filter options load". Presence toggles need no other change here: they are `log_type='action'` rows with the usual `before_value` / `after_value`, so the table, the summary strip and the CSV export render them as-is. ADR `2026-08-24-presence-control.md`.
- 2026-08-15 — Field-level filters stopped requiring a card type. `buildWhere` gated them on `cardTypeIds`, so a filter set without one was accepted, serialized to `?ff=`, counted in the badge — and silently ignored by the query; the panel hid the builder entirely until a type was picked. Both gates are gone: `HistoryFilters` passes the effective types (selection, or every active type) and the DAL applies each filter on its own `fieldDefinitionIds`. Covered by `src/lib/dal/__tests__/history-field-filters.integration.test.ts`. Bug fix + parity with `/cards`, no ADR.
- 2026-08-02 — `/cards` adopted this module's URL-state pattern, and the shared parts moved out: the defensive readers to `src/lib/navigation/query-codec.ts`, the scroll memory to `src/lib/navigation/return-scroll.ts`, and the `from`/`hq`/`cq` params to `src/lib/cards/return-origin.ts` (`HistoryTableRow` now builds its link with `cardDetailHref`). Two scroll bugs surfaced and were fixed for both surfaces: the page offset was read from `window.scrollY`, which is always 0 because `DashboardShell` scrolls an inner `<main>`, and a single assignment did not survive the router's post-navigation reset. The card detail also stops dropping `hq` at its edit page — a follow-up from the previous ADR. ADR `2026-08-02-card-list-url-state-and-return.md`.
- 2026-08-02 — Select fields became filterable in the history view, via the same shared `FieldFilterBuilder` fix as the card list: options were read from `validationRules.options`, a shape nothing writes, so the value dropdown was always empty. Now uses `getSelectOptions` from `@/lib/validation/rules`. `buildFieldFilterSQL` was already correct and is unchanged. Bug fix, no ADR.

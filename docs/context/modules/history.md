# Module: history

**Last updated**: 2026-08-28 · **Last feature**: snapshot read path — rows show the values of their own event, `card_edit` and `lifecycle` surfaced, multi-field Detail column

## Responsibility

Full audit log for the tenant: paginated view of **every** `action_logs` entry — scans, actions, manual edits and lifecycle transitions — with advanced filtering, and CSV export. Distinct from the dashboard activity feed — the feed shows a small live window; the history view provides complete retrospective access with search.

Does not write to `action_logs` (consumer only). Does not own scan execution or action execution (see `scanning` and `actions`).

## Key files

- `src/app/(dashboard)/history/page.tsx` — History page (OPERATOR+). Reads the view state from `searchParams`, server-renders **that** page + filter options, then hydrates client-side.
- `src/lib/history/filter-params.ts` — View state ↔ query string: `parseHistoryParams`, `buildHistoryQuery`, `sanitizeHistoryQuery` (the whitelist for the `hq` return blob), `toEffectiveFilters` (scan-toggle merge, shared by server page and client view). Dependency-free — imported by both. Its readers come from `src/lib/navigation/query-codec.ts`, shared with `cards`.
- `src/lib/history/scroll-restore.ts` — `rememberHistoryScroll` / `consumeHistoryScroll`. Pins a storage key on the shared `createScrollMemory` (`src/lib/navigation/return-scroll.ts`), so a history offset can never be restored into `/cards`.
- `src/lib/cards/return-origin.ts` — Owns the `from` / `hq` / `cq` params in both directions. `HistoryTableRow` builds its link with `cardDetailHref`; the card detail resolves it with `resolveCardOrigin`.
- `src/components/history/ActionHistoryView.tsx` — Root client component. Manages filter state, pagination, export.
- `src/components/history/HistoryFilters.tsx` — Top-level filter panel (date range, log type, card type, action, user, card code). Carries the one-line note explaining that filters match CURRENT values while the table shows values as of each event.
- `src/lib/history/log-types.ts` — Pure. `HISTORY_LOG_TYPES` (all four), `LOG_TYPE_LABEL` (Spanish), `historyRowLabel` (the Acción column's ONE derivation, shared by the table and the CSV) and `lifecycleTransitionLabel`.
- `src/lib/history/detail-format.ts` — Pure. `formatChange` renders one snapshot change as `Etiqueta: antes → después`; `formatChangeForExport` joins them one per line for a CSV cell; `orderChangesForDisplay` reorders for reading (identity first, then by label) because the payload's own order is `fieldDefinitionId` order. Table and export both call these, so they cannot disagree.
- `src/lib/cards/lifecycle-labels.ts` — `LIFECYCLE_STATUS_LABEL` / `lifecycleStatusLabel`, shared with `CardStatusBadge`.
- `src/components/history/HistoryFieldFilters.tsx` — Loads the common field definitions for the *effective* card types (the selection, or every active type when nothing is selected — the caller decides), then delegates to the shared `src/components/shared/FieldFilterBuilder.tsx` (same component the card list uses — a fix there lands on both surfaces).
- `src/components/history/HistoryTable.tsx` — Paginated results table.
- `src/components/history/HistoryTableRow.tsx` — Single row renderer (scan vs action, summary fields, override badge).
- `src/components/history/HistoryPagination.tsx` — Page controls.
- `src/components/history/HistoryScanToggle.tsx` — Toggle to include/exclude scan entries.
- `src/components/history/HistoryExportButton.tsx` — Triggers CSV export via `exportActionHistoryAction`.
- `src/lib/dal/action-history.ts` — `getActionHistory`, `getActionHistoryForExport`, `getHistoryFilterOptions`, `getFilterableFieldDefinitions`, `buildCsvFromEntries`. Core query builder with WHERE clause composition and summary-field enrichment. Values come from the frozen snapshot (`loadSnapshotsForLogRows` + `projectSnapshotFields`); the live `field_values` join now runs only for the cards whose rows predate migration 0022.
- `src/lib/actions/action-history.ts` — Server Actions: `getActionHistoryAction`, `exportActionHistoryAction`, `getHistoryFilterOptionsAction`, `getFieldDefinitionsForFilterAction` (deprecated), `getCommonFieldDefinitionsAction`.

## Data model (relevant subset)

Read-only access to:

- `action_logs` — source of truth. Filtered by `tenant_id`. Joined to `cards`, `card_types`, `action_definitions`, `user`.
  **All four log types are shown.** `/history` is the audit surface; the dashboard feed is the operational one and keeps its `scan | action` whitelist.
  ⚠️ `buildWhere` reads `filters.logTypes` in **three** states: `undefined` = no constraint, a non-empty array = whitelist, an EMPTY array = match nothing. `toEffectiveFilters` now always sends an explicit list, so the predicate always applies.
- `card_snapshots` — the frozen card state each row points at, plus its predecessor for the Detail diff. One query per page over the page's DISTINCT snapshot ids (`loadSnapshotsForLogRows`), never a JOIN — a payload joined per row would repeat once per row through a 10,000-row export.
- `card_type_summary_fields` — which fields a row shows (today's configuration). The VALUES come from the payload, so a summary field added today populates for a row from last year. Photo fields are **not** excluded here, unlike the feed's config: the table renders a thumbnail.
- `field_values` — two remaining uses: the field-level filter `EXISTS` subqueries, and the summary-value fallback for rows written before migration 0022 (no backfill exists; that path must not be deleted).

## Supported filters

| Filter | Description |
|--------|-------------|
| Date range | `dateFrom` / `dateTo` on `executed_at` |
| Log type | Any of `scan`, `action`, `card_edit`, `lifecycle` — multi-select chips in the panel, composed with the inline scan toggle by `toEffectiveFilters` (the toggle can only ever remove `scan`). Serialized as `lt=`. |
| Card type | One or more card type IDs |
| Action definition | One or more action definition IDs |
| User | Single `executed_by` user ID |
| Card code | ILIKE partial match on `cards.code` |
| Field-level filters | Per-field conditions using 14 operators (see below) |

### Field-level filter operators

`contains`, `starts_with`, `equals_text` (text fields) · `eq`, `gt`, `lt`, `gte`, `lte`, `between` (number fields) · `is_true`, `is_false` (boolean fields) · `date_eq`, `date_before`, `date_after`, `date_between` (date fields). Photo fields are excluded (not searchable).

A field filter is self-contained — it carries one `fieldDefinitionId` per card type — so it applies whether or not a card type is selected. ⚠️ The filter reads the card's **current** value, not the value at the time of the log: "puntos > 5" means "logs of cards that hold puntos > 5 *today*".

**That is settled, not a gap.** Filters stay scoped to current values permanently: an operator filtering history is asking "show me the log for the cards in state X *now*", and filtering on frozen values would need a GIN index on a jsonb column that grows with every state change, to answer a question nobody asked. ⚠️ **The divergence is now visible**: a row matching "saldo = 0" may display "saldo: 3" — the filter looks at *today*, the column shows *then*. `HistoryFilters` carries one line of Spanish copy saying so; without it the row reads as a bug. Do not add GIN indexes or a snapshot-filtering toggle. ADR `2026-08-28-card-snapshots-read-path.md`.

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
3. `enrichWithSummaryFields` resolves each row: today's `card_type_summary_fields` decide WHICH fields show, `loadSnapshotsForLogRows` (one query for the page's distinct snapshots + their predecessors) supplies the values and labels, and `projectSnapshotFields` combines them. A row with no snapshot falls back to the live `field_values` join, loaded only for those cards. A `photo` field is reduced to a boolean presence flag — the object key never reaches the browser.
4. The Detail diff is computed here, not in the renderer, so the table and the CSV cannot disagree: `diffSnapshots(previousPayload, payload)` when the row CREATED its snapshot, photo values reduced to presence, then `orderChangesForDisplay`. Empty when the event only observed the card, and empty for a V0 (a card's first snapshot is a state, not a transition — otherwise the first scan of every pre-0022 card would read "12 fields changed").
5. Client renders `HistoryTable`. Pagination controls call `getActionHistoryAction` on page change. `HistoryTableRow` renders a `photo` summary field as a thumbnail addressed by `cardPhotoRoute(cardCode, { fieldDefinitionId })`, the same stable route the dashboard feed uses; every other type is formatted as text.

**What a row displays vs what it addresses.** `cardCodeAtEvent` / `cardTypeNameAtEvent` are printed; `cardCode` stays the LIVE code and is what the detail link and the photo route are built from, so a card renamed after the row was written still navigates. When they differ, the cell's `title` names the current code.

**The Detail column has four modes.** A `lifecycle` row shows its transition (`Activo → Archivado`, from `metadata.from`/`to` — it carries no snapshot). A row that changed the card shows up to three changes inline as `Etiqueta: antes → después`, the rest behind a `+N` **Popover**. A row that only observed the card shows nothing. A pre-0022 row falls back to the legacy `metadata.before_value` / `after_value` pair, which is all those rows will ever have.

⚠️ System-field changes are dropped **at render** (`excludeSystemFields`), not inside `diffSnapshots` — same rule as `src/lib/fields/system.ts`. A presence toggle therefore shows an empty Detail, which is correct: the Acción column already says Entrada / Salida.

**COUNT cap**: when `total === 10001`, the UI displays ">10,000" to avoid slow full-table scans.

### CSV export

1. `exportActionHistoryAction(rawFilters)` calls `getActionHistoryForExport` — same WHERE, no pagination, hard cap at 10,000 rows.
2. `buildCsvFromEntries` serializes to CSV (columns: Date/Time, Card Code, Card Type, Action, Executed By, Override, [summary field labels], Details). A photo column exports as `Yes` / `No` — a cell can hold neither the image nor the key. The Action column and the Details cell come from `historyRowLabel` and `formatChange`, the same functions the table uses.
   Multiple changes go in ONE cell, one per line; `escapeCsvCell` already quotes and doubles-up any cell containing a newline, so a spreadsheet reads it as a single cell. Newline-separated rather than comma-separated: a comma would be indistinguishable from a comma inside a value.
3. Returns `{ csv, totalExported, capped }`. Client triggers a browser download.

### Filter options load

`getHistoryFilterOptionsAction()` returns: active card types, active action definitions (grouped by card type), distinct users who appear in `action_logs` for the tenant. Used to populate dropdowns.

⚠️ The **action** dropdown deliberately still lists system actions (e.g. presence's "Presencia"), unlike the **field** filter builder, which excludes system fields via `excludeSystemFields` inside `getCommonFieldDefinitionsAction`. The distinction is configuration vs audit: a presence toggle produces real `action_logs` rows, so hiding it from the filter would make those rows visible in the table yet unfindable. Constraint #27 governs configuration surfaces; a log filter is a read of history.

### Field filter builder

`HistoryFilters` resolves the *effective* card types — the selection, or all of `options.cardTypes` when nothing is selected (`getHistoryFilterOptions` returns active types only) — and `getCommonFieldDefinitionsAction(effectiveTypeIds)` returns the fields common to all of them (photo excluded). Operator picks a field, operator, and value → appended as a `FieldFilter` to the query. The builder renders nothing when those types share no filterable field. Changing the type selection clears the field filters, since a filter on a field the new selection does not share would match nothing — same rule as `CardList`.

## Extension points

- **New filter dimension** → extend `ActionHistoryFilters` type, `buildWhere`, `HistoryFilters` UI, **and** the query keys in `src/lib/history/filter-params.ts` (both directions) plus `ActionHistoryFiltersSchema`. If it needs a new kind of value read out of a URL, add the reader to `src/lib/navigation/query-codec.ts` — `cards` parses the same shapes.
- **New field filter operator** → add to `FieldFilterOperatorSchema` (Zod), `buildFieldFilterSQL`, and `HistoryFieldFilters` UI.
- **New export format** → add a builder alongside `buildCsvFromEntries` in `action-history.ts`. Derive the Action column from `historyRowLabel` and the Detail cell from `formatChange` — do not re-derive either.
- **New log type** → add it to `logTypeEnum`, then to `HISTORY_LOG_TYPES` + `LOG_TYPE_LABEL` (`src/lib/history/log-types.ts`) and to `ActionHistoryFiltersSchema`. Everything else — the filter chips, `toEffectiveFilters`, `buildWhere`, the row label, the export — reads from those two. Adding it to the dashboard FEED is a separate, deliberate decision (`getActivityFeed`'s whitelist).

## Module interactions

- Reads from: `action_logs` (primary source), `cards`, `card_types`, `action_definitions`, `user` (JOINs), `card_snapshots` (values, labels, and the Detail diff), `card_type_summary_fields` (which fields to show), `field_values` (filter subqueries + the pre-0022 fallback), `field_definitions` (filter builder).
- Shares with `dashboard`: `loadSnapshotsForLogRows` and `projectSnapshotFields` from `src/lib/snapshots/`. Both surfaces resolve a page of log rows the same way; the feed additionally shares the projection with its CLIENT producer.
- Uses: `getCommonFieldDefinitions` from `fields` module (common fields across selected card types).
- Related: `dashboard` also reads from `action_logs` but for a small live feed (`getActivityFeed`), not full-history audit. Both use `card_type_summary_fields` for enrichment.
- Navigates to: `cards` — a row opens `/cards/[code]?from=history&hq=…` via `cardDetailHref`, and the detail page's back link depends on `sanitizeHistoryQuery` from this module's `filter-params.ts`. Changing the query keys changes what a return trip can restore. The origin now survives the card's edit page too.
- Shares with `cards`: `src/lib/navigation/query-codec.ts` (URL readers) and `src/lib/navigation/return-scroll.ts` (scroll memory + page-scroll helpers). Both were extracted from this module — a change here affects `/cards`.
- Produced by: `actions` (action log entries) and `scanning` (scan log entries via `executeScanWithAutoActionsAction`).

## Open TODOs

- [ ] **Invitation tenant: entries/exits can render as no-ops.** For `scan_strategy = 'invitation'`, `GUEST_ENTRY` paid with a half-credit and `GUEST_EXIT` (refunding or not) log `before_value === after_value` on `invitations`; the real `HALF_INVITATION` change goes through the unlogged `setFieldValue`. Only `metadata.invitationSettlement` records what happened, and no surface reads it. Fix belongs here, not in the strategy. ADR `2026-08-27-invitation-accounting.md`.

## Recent changes

- 2026-08-28 — **Snapshot read path (A2).** Every row now reports the values, labels, card code and card type name of its OWN event, resolved from `card_snapshots` by `loadSnapshotsForLogRows` + `projectSnapshotFields` (one query per page over the distinct snapshots, never a JOIN). `card_edit` rows are surfaced; so are `lifecycle` rows — **legitimised rather than hidden**, since they had in fact been reaching the table since 2026-07-17 and an administrator may already rely on seeing that a card was archived (the "excluded" claim lived only in a `filter-params.ts` comment and in this file's Data model section — no ADR ever asserted it). The Detail column became a multi-field diff (`diffSnapshots`, three inline plus a `+N` Popover, system fields dropped at render), the CSV serialises the same changes one per line in one quoted cell, and both derive their Action label from the single shared `historyRowLabel`. A "Tipo de registro" multi-select was added — there had been no log-type filter UI at all, only the boolean scan toggle — and `toEffectiveFilters` now always sends an EXPLICIT list, which is what closes the leak: it used to DELETE the key when the toggle was on, so no log-type predicate applied. `buildWhere` accordingly treats an empty array as "match nothing". Filters remain on CURRENT values permanently, and the panel now says so in one line. ADR `2026-08-28-card-snapshots-read-path.md`.
- 2026-08-28 — **`card_edit` rows written and temporarily excluded (A1).** `buildWhere` gained an unconditional `ne(actionLogs.logType, "card_edit")` so both queries hid the new manual-edit rows until this read path could render them. Removed the same day by the entry above. That exclusion is also how the pre-existing **lifecycle leak** was found. ADR `2026-08-28-card-snapshots-write-path.md`.
- 2026-08-25 — Presence rows read by DIRECTION. `getActionHistory` / `getActionHistoryForExport` project `isPresence`, derived in SQL by comparing the action's target field to `card_types.presence_field_definition_id` (`isPresenceRowSql`) — not stamped at write time, so a tenant that later disables presence sees those rows fall back to the action name, which is accepted degradation. `HistoryTableRow` and `buildCsvFromEntries` both derive the label through the single shared `presenceDirectionLabel`, so the export cannot disagree with the table. `getHistoryFilterOptions` relabels the presence action **"Entrada / Salida"** while keeping it ONE option filtering by `action_definition_id`. The scan toggle now defaults **off** when the tenant has presence enabled (every scan otherwise shows twice): `parseHistoryParams` takes the default as an injected parameter, and `buildHistoryQuery` ALWAYS serializes `scans` as `0`/`1` because absence stopped having a single meaning. ADR `2026-08-25-feed-grouping-and-scan-correlation.md`.
- 2026-08-24 — The field-filter builder now excludes `is_system = true` fields: the filter is applied in `getCommonFieldDefinitionsAction` (and in the deprecated `getFieldDefinitionsForFilterAction`), not in the DAL, so `getCommonFieldDefinitions` stays the unfiltered source of truth. `CommonFieldDefinition` / `FilterableFieldDefinition` gained `isSystem`. The **action** dropdown is deliberately left unfiltered — see "Filter options load". Presence toggles need no other change here: they are `log_type='action'` rows with the usual `before_value` / `after_value`, so the table, the summary strip and the CSV export render them as-is. ADR `2026-08-24-presence-control.md`.
- 2026-08-15 — Field-level filters stopped requiring a card type. `buildWhere` gated them on `cardTypeIds`, so a filter set without one was accepted, serialized to `?ff=`, counted in the badge — and silently ignored by the query; the panel hid the builder entirely until a type was picked. Both gates are gone: `HistoryFilters` passes the effective types (selection, or every active type) and the DAL applies each filter on its own `fieldDefinitionIds`. Covered by `src/lib/dal/__tests__/history-field-filters.integration.test.ts`. Bug fix + parity with `/cards`, no ADR.
_Pruned to the 5-entry cap: the select-field filter fix and the `/cards` URL-state extraction (both 2026-08-02) are described in `modules/fields.md` → Select options and in `2026-08-02-card-list-url-state-and-return.md`._

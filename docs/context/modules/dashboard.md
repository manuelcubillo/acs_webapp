# Module: dashboard

**Last updated**: 2026-08-04 · **Last feature**: configurable 3×3 summary grid for the last-scanned card panel, with two-row photo cells

## Responsibility

The operator dashboard and associated tenant settings: active card zone, activity feed, summary fields per card type, and dashboard configuration.

⚠️ Two per-card-type field configurations exist and are **deliberately independent** — different tables, different surfaces, no shared code:

| Config | Table | Drives | Photo fields |
| ------ | ----- | ------ | ------------ |
| Panel grid | `card_type_active_zone_fields` | `ActiveCardZone` 3×3 grid | Included (can span two rows) |
| Feed summary | `card_type_summary_fields` | `ActivityFeedEntryRow` inline strip | Excluded |

See ADR `2026-08-04-active-card-summary-grid.md`.

Does not own action execution (see `actions`) or card lookup (see `cards`).

## Key files

- `src/app/(dashboard)/dashboard/page.tsx` — Dashboard page (OPERATOR+). Parallel fetch of `getDashboardSettings` + `getTenantById`, then parallel `getActivityFeed` + 2 × `getActionHistory` (KPI counts) + `listCardTypes` (active-types KPI) + `getFeedSummaryFieldConfig`. Constructs `DashboardKpiData` and `FeedBuilderConfig` and passes both to `DashboardView`.
- `src/app/(dashboard)/dashboard/actions.ts` — Dashboard route-level Server Actions (wraps `getActivityFeed` etc.).
- `src/app/(dashboard)/dashboard/QuickCodeInput.tsx` — Informational code lookup widget: navigates to `/cards/[code]` without triggering an operational scan. Distinct from `DashboardSearchBar`. (Still pre-Phase-2 styling — Phase 3 target.)
- `src/components/dashboard/DashboardView.tsx` — Primary client container. On scan code received: calls `executeScanWithAutoActionsAction` (operational scan pipeline). **Owns the feed's entries**: every mutation it performs (scan, resumed auto-actions, manual action) appends the rows the server just logged, built locally. `refreshFeed` is the only path back to the server for feed data. Composes `DashboardSearchBar` (focal point) + `DashboardKpis` + two-column area of `ActiveCardZone` and `ActivityFeed`. Token-driven; zero inline styles.
- `src/components/dashboard/DashboardSearchBar.tsx` — **Operational scan input**: manual code entry + external reader. Calls `onScan(code)` → `executeScanWithAutoActionsAction` in parent. Focused on mount for immediate barcode capture. Visually the focal point of the page.
- `src/components/dashboard/DashboardKpis.tsx` — Read-only KPI strip: scans today, actions today, active card types, last activity. Pure presentation — values come from props.
- `src/components/dashboard/ActiveCardZone.tsx` — Currently scanned card + inline action execution. State → token mapping: granted=green / warning=amber / denied=red / **override=orange** (phase 2), each with icon + label. Lifecycle takes precedence over scan validation: archived → red denial with no action buttons; inactive/expired → orange `--state-override` surface (via the `lifecycleGate` prop). Shows a neutral `CardStatusBadge`. The summary area (`SummaryGrid`) places each configured field at its grid cell via the `summaryLayout` prop; a two-row photo gets `sm:row-span-2` and the taller `--photo-thumbnail-size-tall` cap. **Empty layout = unconfigured**, which falls back to the legacy first-6-fields-with-a-value grid. Values are resolved by `fieldDefinitionId` (not by walking `card.fields`) so a configured-but-empty field renders "—" instead of collapsing the arrangement. `photo` fields are signed URLs; click falls through the wrapping `Link` to the card detail.
- `src/components/dashboard/ActivityFeed.tsx` — Recent entries list. Presentational and fully controlled — no polling, no state of its own. `lastRefreshedAt` renders as "Actualizado HH:MM": the last time the SERVER was asked, which is what makes the no-polling trade honest.
- `src/components/dashboard/ActivityFeedEntryRow.tsx` — Single row renderer. Scan rows show the card's photo thumbnail (`entry.cardPhotoUrl`, `object-cover` avatar), falling back to the `--state-info` scan icon when absent. Action rows keep the `--primary` Zap icon. Override badge = `--state-override` (orange, distinct from amber warning). Renders no photo-typed summary field — see `getFeedSummaryFieldConfig`.
- `src/lib/dashboard/feed-entries.ts` — Client-side row construction: `buildScanEntries`, `buildActionEntries`, `prependEntries`. **Mirrors the server's logging rules** — keep in step with `src/lib/actions/cards.ts`.
- `src/app/api/photos/cards/[code]/route.ts` — Session-authenticated (OPERATOR+) card photo. 302 → signed storage URL, minted per request. ADR `2026-07-17-stable-photo-routes.md`.
- `src/components/dashboard/AutoActionFeedback.tsx` — Per-result feedback for auto-executed actions. Success = state-granted, failure = state-denied.
- `src/components/layout/DashboardShell.tsx` — Sidebar + topbar shell. Token-driven, includes `ThemeToggle` icon button and `Avatar` primitive.
- `src/components/shared/ThemeToggle.tsx` — Binary light ↔ dark switch, wired to `next-themes` via `useThemeContext()`.
- `src/app/(dashboard)/settings/dashboard/page.tsx` — Dashboard settings (MASTER). Feed options + summary fields config.
- `src/components/settings/dashboard/DashboardSettingsView.tsx` — Wrapper. Section order: **ActiveCardFieldsSection first**, then FeedSettingsSection, then SummaryFieldsSection.
- `src/components/settings/dashboard/ActiveCardFieldsSection.tsx` — Per-card-type 3×3 grid editor for the panel. One `<Select>` per cell (not drag & drop — justified in the file header and the ADR), plus an "Ocupar dos filas" `Switch` on photo cells, disabled when the span is geometrically impossible. Runs the same `validateActiveZoneLayout` the Server Action does.
- `src/components/settings/dashboard/FeedSettingsSection.tsx` — Activity feed display options.
- `src/components/settings/dashboard/SummaryFieldsSection.tsx` — Per-card-type FEED summary field config (max 3 in the UI, `.max(5)` in the Zod schema — a long-standing inconsistency). Photo fields are selectable here but silently dropped by the feed.
- `src/lib/dashboard/active-zone-layout.ts` — **Pure** grid geometry: dimensions, `rowOf`/`colOf`/`cellBelow`, `occupiedCells`, `buildOccupancyMap`, `canSpanTwoRows`, `validateActiveZoneLayout`, and the Spanish `LAYOUT_ERRORS`. No server or React dependency, so the editor and the Server Action enforce identical rules. Unit-tested in `__tests__/active-zone-layout.unit.test.ts` (21 cases).
- `src/lib/dal/active-card-zone-fields.ts` — `cardTypeActiveZoneFields` CRUD: `getActiveZoneFieldsForCardType(s)` for the editor and `getActiveZoneFieldConfig(tenantId)` (joined to field definitions, `photo` INCLUDED, inactive fields excluded) for the dashboard. `setCardTypeActiveZoneFields` replaces a layout wholesale.
- `src/lib/dal/dashboard-settings.ts` — `dashboardSettings` + `cardTypeSummaryFields` CRUD, plus `getFeedSummaryFieldConfig` (the static per-tenant config the client needs to build rows; excludes `photo` fields, whose value is an object key). **Untouched by the grid feature.**
- `src/lib/dal/activity-feed.ts` — `getActivityFeed` (unified scan + action query). Runs on page load and manual refresh only. Sets `entry.cardPhotoUrl` to the stable photo route when any active `photo` field of the card holds a key — it no longer signs anything.
- `src/lib/actions/dashboard-settings.ts` — Server Actions for feed settings and summary fields.

## Data model (relevant subset)

- `dashboard_settings(tenant_id, ...)` — per-tenant feed configuration.
- `card_type_summary_fields(card_type_id, field_definition_id, position)` — which fields appear compactly **in the feed**.
- `card_type_active_zone_fields(card_type_id, field_definition_id, position, row_span)` — the **panel's** 3×3 grid. `position` 0–8 (`CHECK`), `row_span` 1|2 (`CHECK`), `UNIQUE(card_type_id, position)` and `UNIQUE(card_type_id, field_definition_id)`. Migration `0018`. Note the DB cannot express the lower half of a two-row photo, so that overlap is caught only by `validateActiveZoneLayout`.
- `action_logs` — source for the feed. `tenant_id` denormalized for single-table queries.

## Main flows

### Activity feed load and refresh

**The feed does not poll.** ADR `2026-07-17-dashboard-feed-no-polling.md`.

1. Server-built rows arrive only at page load and on Refrescar (`DashboardView.refreshFeed` → `getActivityFeedAction` → `getActivityFeed`), which queries `action_logs` by `tenant_id`, pre-joins summary fields and flags which cards have a photo.
2. In between, `DashboardView` appends rows itself after every mutation, built from what the action already returned (`feed-entries.ts`). No round trip.
3. Refresh REPLACES the list wholesale — server rows already contain the locally appended scans, so client rows never need reconciling. Hence their `id` may be a client UUID (nothing reads it but React's list key) and their `executedAt` the client clock (rows are prepended, never sorted).
4. Rendered by `ActivityFeed` → one `ActivityFeedEntryRow` per entry.

Consequence: rows produced by OTHER dashboards appear only on refresh.

### Operational scan (primary surface)

1. Operator enters a code in `DashboardSearchBar` (or an external reader fires in `DashboardView`'s `useExternalScanner`).
2. `DashboardView` calls `executeScanWithAutoActionsAction(code)` (see `modules/actions.md`).
3. Result is displayed in `ActiveCardZone`: card details, auto-action feedback, manual action buttons.
4. If `pausedForConfirmation=true` (blocking scan errors, **or** an inactive/expired card with override allowed — phase 2), a modal appears. On confirm, `resumeAutoActionsAction` is called. An archived card is denied outright (red, no modal, no buttons).
5. On any manual action execution, `DashboardView` pre-checks `validateBeforeActionAction` (which now returns `lifecycleGate`): archived/blocked → inline error; inactive/expired + override → override modal, then `executeActionAction` with the flag. The server re-enforces the gate regardless. Card state and scan-validation state update.

### Dashboard settings (master)

1. `/settings/dashboard` — panel grid (first), feed options, feed summary fields per card type.
2. Panel grid: each of the 9 cells takes one field of that card type (photo included). A photo cell can be toggled to span two rows, which reserves the cell below it. On save, `setCardTypeActiveZoneFieldsAction` re-validates the geometry server-side — resolving field types **from the DB**, never from the payload — then replaces the layout (delete + insert; neon-http has no interactive transactions).
3. Feed summary fields are chosen from the card type's field definitions (`getCardTypeById`, **not** `getCommonFieldDefinitions`). On save, the Server Action replaces `card_type_summary_fields` (delete + insert).

## Extension points

- **New feed display option** → extend `dashboard_settings` schema + `FeedSettingsSection` + rendering logic in `ActivityFeed`. If it filters entries, `feed-entries.ts` must apply it too — the client re-applies the DAL's filters when appending.
- **New feed entry type** → extend `log_type` enum + `ActivityFeedEntryRow` variant + a producer in `actions` or `scanning`, **and** a client mirror in `feed-entries.ts`. Without the mirror the row only appears on refresh. (`lifecycle` entries are deliberately not surfaced — the feed filters to scan|action.)
- **Change the panel's grid size** → `src/lib/dashboard/active-zone-layout.ts` derives everything from `ACTIVE_ZONE_COLUMNS` / `ACTIVE_ZONE_ROWS`, but the DB `CHECK` on `position` and the literal `COL_START_CLASS` / `ROW_START_CLASS` arrays in `ActiveCardZone` are hardcoded to 3×3 and need a migration + edit. Tailwind cannot generate placement classes from interpolated strings.
- **New field type in the panel** → `SummaryCell` branches on `photo` vs everything else. A type needing custom display adds a branch there; only `photo` may span two rows (enforced in `validateActiveZoneLayout`).
- **Cross-tenant analytics** — out of current scope. A new module would be warranted.

## Module interactions

- Reads from: `action_logs` (feed and operational scan pipeline), `cards` + `fields` (summary fields resolution), `card-types` (field definitions), `dashboard_settings` (feed limits, `allow_override_on_error`).
- Serves: feed thumbnails via `/api/photos/cards/[code]` (`cardPhotoRoute` in `@/lib/storage/photo-routes`), which signs per request. `ActiveCardZone` still renders signed URLs embedded in the scanned card by `@/lib/dal/photo-urls` — correct there (short-lived surface, refreshed by every scan).
- Mirrors: the logging rules of `executeScanWithAutoActionsAction` / `resumeAutoActionsAction` (`src/lib/actions/cards.ts`), client-side in `feed-entries.ts`. Changing what those log means changing the mirror.
- Calls: `executeScanWithAutoActionsAction` and `resumeAutoActionsAction` (from `modules/cards.md`) — dashboard is the primary operational scan surface.
- Related: `modules/history.md` also reads from `action_logs` but for full-history audit/export with advanced filtering, not the live feed.

## Open TODOs

- [ ] None specific (no tagged `TODO:` comments in source as of sync date).

## Recent changes

- 2026-08-04 — Configurable panel grid: `ActiveCardZone`'s summary area becomes a per-card-type 3×3 grid (up to 9 cells) with an optional two-row `photo` cell, stored in the NEW `card_type_active_zone_fields` table (migration `0018`) and edited from the now-first section of the Dashboard settings tab. The feed keeps its own `card_type_summary_fields` config, untouched — the decoupling is the whole point of the ADR. Discovered along the way: the panel never read any config at all (it sliced the card's first 6 valued fields), `SummaryFieldsSection` never used `getCommonFieldDefinitions` so photo fields were already selectable there, and no Server Action in the codebase calls `revalidatePath` (every dashboard page is `force-dynamic`). ADR `2026-08-04-active-card-summary-grid.md`.
- 2026-07-17 — Phase-2 lifecycle surface: `ActiveCardZone` gains an orange `--state-override` state for inactive/expired and a red no-action denial for archived, driven by the new `lifecycleGate` prop; neutral `CardStatusBadge` added. `DashboardView` gates manual actions on the gate (deny / block / override modal) before executing. `CardActions` gained `overrideTone` / `hideBanner`. ADR `2026-07-17-card-lifecycle-scan-behaviour.md`.
- 2026-07-17 — Feed stops polling: `DashboardView` owns the entries and appends what each mutation logs, built client-side (`feed-entries.ts`); server asked only on load + Refrescar. Thumbnails move to `/api/photos/cards/[code]`; `getActivityFeed` no longer signs. Fixed along the way: `key={feedKey}` remounted the feed on every scan, reverting it to page-load data (and starving it entirely under 15s scan intervals); resumed auto-actions never reached the feed (call commented out); photo summary fields printed the object key as text — now excluded on both paths. ADRs `2026-07-17-dashboard-feed-no-polling.md`, `2026-07-17-stable-photo-routes.md`.
- 2026-07-16 — Card photo thumbnails on the dashboard: `ActivityFeedEntryRow` scan rows show the card's photo (`cardPhotoUrl`, `object-cover` avatar, fallback to the `--state-info` scan icon); `ActiveCardZone` renders `photo` summary fields as thumbnails. `getActivityFeed` resolves each card's primary photo; scan/resume actions in `src/lib/actions/cards.ts` sign the returned card's photos.
- 2026-06-06 — Dashboard rebuild: every dashboard file rewritten on shadcn primitives + Layer 2 tokens. Zero inline styles, zero hex left in the rebuilt surface. Override and warning are now visually distinct (orange vs amber). Scan-feed icon is now neutral (`--state-info`), not grant-green. ThemeToggle added in topbar. KPI strip introduced (4 cards from existing DAL only — no new queries). See `decisions/2026-06-06-dashboard-rebuild.md`.

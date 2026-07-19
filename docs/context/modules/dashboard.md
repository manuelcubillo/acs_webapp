# Module: dashboard

**Last updated**: 2026-07-17 · **Last feature**: activity feed stops polling — the client builds the rows its own scans produce; photos move to a stable route

## Responsibility

The operator dashboard and associated tenant settings: active card zone, activity feed, summary fields per card type, and dashboard configuration.

Does not own action execution (see `actions`) or card lookup (see `cards`).

## Key files

- `src/app/(dashboard)/dashboard/page.tsx` — Dashboard page (OPERATOR+). Parallel fetch of `getDashboardSettings` + `getTenantById`, then parallel `getActivityFeed` + 2 × `getActionHistory` (KPI counts) + `listCardTypes` (active-types KPI) + `getFeedSummaryFieldConfig`. Constructs `DashboardKpiData` and `FeedBuilderConfig` and passes both to `DashboardView`.
- `src/app/(dashboard)/dashboard/actions.ts` — Dashboard route-level Server Actions (wraps `getActivityFeed` etc.).
- `src/app/(dashboard)/dashboard/QuickCodeInput.tsx` — Informational code lookup widget: navigates to `/cards/[code]` without triggering an operational scan. Distinct from `DashboardSearchBar`. (Still pre-Phase-2 styling — Phase 3 target.)
- `src/components/dashboard/DashboardView.tsx` — Primary client container. On scan code received: calls `executeScanWithAutoActionsAction` (operational scan pipeline). **Owns the feed's entries**: every mutation it performs (scan, resumed auto-actions, manual action) appends the rows the server just logged, built locally. `refreshFeed` is the only path back to the server for feed data. Composes `DashboardSearchBar` (focal point) + `DashboardKpis` + two-column area of `ActiveCardZone` and `ActivityFeed`. Token-driven; zero inline styles.
- `src/components/dashboard/DashboardSearchBar.tsx` — **Operational scan input**: manual code entry + external reader. Calls `onScan(code)` → `executeScanWithAutoActionsAction` in parent. Focused on mount for immediate barcode capture. Visually the focal point of the page.
- `src/components/dashboard/DashboardKpis.tsx` — Read-only KPI strip: scans today, actions today, active card types, last activity. Pure presentation — values come from props.
- `src/components/dashboard/ActiveCardZone.tsx` — Currently scanned card + inline action execution. State → token mapping: granted=green / warning=amber / denied=red / **override=orange** (phase 2), each with icon + label. Lifecycle takes precedence over scan validation: archived → red denial with no action buttons; inactive/expired → orange `--state-override` surface (via the `lifecycleGate` prop). Shows a neutral `CardStatusBadge`. Summary grid renders `photo` fields as thumbnails; click falls through the wrapping `Link` to the card detail.
- `src/components/dashboard/ActivityFeed.tsx` — Recent entries list. Presentational and fully controlled — no polling, no state of its own. `lastRefreshedAt` renders as "Actualizado HH:MM": the last time the SERVER was asked, which is what makes the no-polling trade honest.
- `src/components/dashboard/ActivityFeedEntryRow.tsx` — Single row renderer. Scan rows show the card's photo thumbnail (`entry.cardPhotoUrl`, `object-cover` avatar), falling back to the `--state-info` scan icon when absent. Action rows keep the `--primary` Zap icon. Override badge = `--state-override` (orange, distinct from amber warning). Renders no photo-typed summary field — see `getFeedSummaryFieldConfig`.
- `src/lib/dashboard/feed-entries.ts` — Client-side row construction: `buildScanEntries`, `buildActionEntries`, `prependEntries`. **Mirrors the server's logging rules** — keep in step with `src/lib/actions/cards.ts`.
- `src/app/api/photos/cards/[code]/route.ts` — Session-authenticated (OPERATOR+) card photo. 302 → signed storage URL, minted per request. ADR `2026-07-17-stable-photo-routes.md`.
- `src/components/dashboard/AutoActionFeedback.tsx` — Per-result feedback for auto-executed actions. Success = state-granted, failure = state-denied.
- `src/components/layout/DashboardShell.tsx` — Sidebar + topbar shell. Token-driven, includes `ThemeToggle` icon button and `Avatar` primitive.
- `src/components/shared/ThemeToggle.tsx` — Binary light ↔ dark switch, wired to `next-themes` via `useThemeContext()`.
- `src/app/(dashboard)/settings/dashboard/page.tsx` — Dashboard settings (MASTER). Feed options + summary fields config.
- `src/components/settings/dashboard/DashboardSettingsView.tsx` — Wrapper.
- `src/components/settings/dashboard/FeedSettingsSection.tsx` — Activity feed display options.
- `src/components/settings/dashboard/SummaryFieldsSection.tsx` — Per-card-type summary field config.
- `src/lib/dal/dashboard-settings.ts` — `dashboardSettings` + `cardTypeSummaryFields` CRUD, plus `getFeedSummaryFieldConfig` (the static per-tenant config the client needs to build rows; excludes `photo` fields, whose value is an object key).
- `src/lib/dal/activity-feed.ts` — `getActivityFeed` (unified scan + action query). Runs on page load and manual refresh only. Sets `entry.cardPhotoUrl` to the stable photo route when any active `photo` field of the card holds a key — it no longer signs anything.
- `src/lib/actions/dashboard-settings.ts` — Server Actions for feed settings and summary fields.

## Data model (relevant subset)

- `dashboard_settings(tenant_id, ...)` — per-tenant feed configuration.
- `card_type_summary_fields(card_type_id, field_definition_id, position)` — which fields appear compactly.
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

1. `/settings/dashboard` — feed options + summary fields per card type.
2. Summary fields are chosen from the union of the card type's field definitions. Position is draggable.
3. On save, `Server Action` writes to `card_type_summary_fields` (upsert + soft-delete missing).

## Extension points

- **New feed display option** → extend `dashboard_settings` schema + `FeedSettingsSection` + rendering logic in `ActivityFeed`. If it filters entries, `feed-entries.ts` must apply it too — the client re-applies the DAL's filters when appending.
- **New feed entry type** → extend `log_type` enum + `ActivityFeedEntryRow` variant + a producer in `actions` or `scanning`, **and** a client mirror in `feed-entries.ts`. Without the mirror the row only appears on refresh. (`lifecycle` entries are deliberately not surfaced — the feed filters to scan|action.)
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

- 2026-07-17 — Phase-2 lifecycle surface: `ActiveCardZone` gains an orange `--state-override` state for inactive/expired and a red no-action denial for archived, driven by the new `lifecycleGate` prop; neutral `CardStatusBadge` added. `DashboardView` gates manual actions on the gate (deny / block / override modal) before executing. `CardActions` gained `overrideTone` / `hideBanner`. ADR `2026-07-17-card-lifecycle-scan-behaviour.md`.
- 2026-07-17 — Feed stops polling: `DashboardView` owns the entries and appends what each mutation logs, built client-side (`feed-entries.ts`); server asked only on load + Refrescar. Thumbnails move to `/api/photos/cards/[code]`; `getActivityFeed` no longer signs. Fixed along the way: `key={feedKey}` remounted the feed on every scan, reverting it to page-load data (and starving it entirely under 15s scan intervals); resumed auto-actions never reached the feed (call commented out); photo summary fields printed the object key as text — now excluded on both paths. ADRs `2026-07-17-dashboard-feed-no-polling.md`, `2026-07-17-stable-photo-routes.md`.
- 2026-07-16 — Card photo thumbnails on the dashboard: `ActivityFeedEntryRow` scan rows show the card's photo (`cardPhotoUrl`, `object-cover` avatar, fallback to the `--state-info` scan icon); `ActiveCardZone` renders `photo` summary fields as thumbnails. `getActivityFeed` resolves each card's primary photo; scan/resume actions in `src/lib/actions/cards.ts` sign the returned card's photos.
- 2026-06-06 — Dashboard rebuild: every dashboard file rewritten on shadcn primitives + Layer 2 tokens. Zero inline styles, zero hex left in the rebuilt surface. Override and warning are now visually distinct (orange vs amber). Scan-feed icon is now neutral (`--state-info`), not grant-green. ThemeToggle added in topbar. KPI strip introduced (4 cards from existing DAL only — no new queries). See `decisions/2026-06-06-dashboard-rebuild.md`.
- 2026-06-06 — Design system foundation landed (Phase 1) — OKLCH tokens, shadcn primitives, `next-themes`, brand swap via `data-brand`. See `decisions/2026-06-06-design-system-tokens.md` + `decisions/2026-06-06-adopt-shadcn-ui.md`.

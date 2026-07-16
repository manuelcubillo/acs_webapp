# Module: dashboard

**Last updated**: 2026-07-16 · **Last feature**: card photo thumbnails in the activity feed (scan rows) and the active-card zone

## Responsibility

The operator dashboard and associated tenant settings: active card zone, activity feed, summary fields per card type, and dashboard configuration.

Does not own action execution (see `actions`) or card lookup (see `cards`).

## Key files

- `src/app/(dashboard)/dashboard/page.tsx` — Dashboard page (OPERATOR+). Parallel fetch of `getDashboardSettings` + `getTenantById`, then parallel `getActivityFeed` + 2 × `getActionHistory` (KPI counts) + `listCardTypes` (active-types KPI). Constructs `DashboardKpiData` and passes to `DashboardView`.
- `src/app/(dashboard)/dashboard/actions.ts` — Dashboard route-level Server Actions (wraps `getActivityFeed` etc.).
- `src/app/(dashboard)/dashboard/QuickCodeInput.tsx` — Informational code lookup widget: navigates to `/cards/[code]` without triggering an operational scan. Distinct from `DashboardSearchBar`. (Still pre-Phase-2 styling — Phase 3 target.)
- `src/components/dashboard/DashboardView.tsx` — Primary client container. On scan code received: calls `executeScanWithAutoActionsAction` (operational scan pipeline). Composes `DashboardSearchBar` (focal point) + `DashboardKpis` + two-column area of `ActiveCardZone` and `ActivityFeed`. Token-driven; zero inline styles.
- `src/components/dashboard/DashboardSearchBar.tsx` — **Operational scan input**: manual code entry + external reader. Calls `onScan(code)` → `executeScanWithAutoActionsAction` in parent. Focused on mount for immediate barcode capture. Visually the focal point of the page.
- `src/components/dashboard/DashboardKpis.tsx` — Read-only KPI strip: scans today, actions today, active card types, last activity. Pure presentation — values come from props.
- `src/components/dashboard/ActiveCardZone.tsx` — Currently scanned card + inline action execution. State → token mapping: granted=green / warning=amber / denied=red, each with icon + label. Summary grid renders `photo` fields as thumbnails (signed URL from the scan action); click falls through the wrapping `Link` to the card detail.
- `src/components/dashboard/ActivityFeed.tsx` — Recent entries list with 15s polling.
- `src/components/dashboard/ActivityFeedEntryRow.tsx` — Single row renderer. Scan rows show the card's photo thumbnail (`entry.cardPhotoUrl`, `object-cover` avatar), falling back to the `--state-info` scan icon when absent. Action rows keep the `--primary` Zap icon. Override badge = `--state-override` (orange, distinct from amber warning).
- `src/components/dashboard/AutoActionFeedback.tsx` — Per-result feedback for auto-executed actions. Success = state-granted, failure = state-denied.
- `src/components/layout/DashboardShell.tsx` — Sidebar + topbar shell. Token-driven, includes `ThemeToggle` icon button and `Avatar` primitive.
- `src/components/shared/ThemeToggle.tsx` — Binary light ↔ dark switch, wired to `next-themes` via `useThemeContext()`.
- `src/app/(dashboard)/settings/dashboard/page.tsx` — Dashboard settings (MASTER). Feed options + summary fields config.
- `src/components/settings/dashboard/DashboardSettingsView.tsx` — Wrapper.
- `src/components/settings/dashboard/FeedSettingsSection.tsx` — Activity feed display options.
- `src/components/settings/dashboard/SummaryFieldsSection.tsx` — Per-card-type summary field config.
- `src/lib/dal/dashboard-settings.ts` — `dashboardSettings` + `cardTypeSummaryFields` CRUD.
- `src/lib/dal/activity-feed.ts` — `getActivityFeed` (unified scan + action query). Also resolves each card's primary photo (lowest-position active `photo` field) and signs it into `entry.cardPhotoUrl` via `signPhotosForRead`.
- `src/lib/actions/dashboard-settings.ts` — Server Actions for feed settings and summary fields.

## Data model (relevant subset)

- `dashboard_settings(tenant_id, ...)` — per-tenant feed configuration.
- `card_type_summary_fields(card_type_id, field_definition_id, position)` — which fields appear compactly.
- `action_logs` — source for the feed. `tenant_id` denormalized for single-table queries.

## Main flows

### Activity feed load

1. `getActivityFeed(tenantId, { limit, includeScanEntries, includeActionEntries })` queries `action_logs` filtered by `tenant_id`.
2. Returns unified entries — each is either a scan or an action. Card summary fields are pre-joined. Each card's primary photo is resolved to a signed `cardPhotoUrl` (batched, de-duplicated) so scan rows can render a thumbnail without a per-row round-trip.
3. Rendered by `ActivityFeed` → one `ActivityFeedEntryRow` per entry.

### Operational scan (primary surface)

1. Operator enters a code in `DashboardSearchBar` (or an external reader fires in `DashboardView`'s `useExternalScanner`).
2. `DashboardView` calls `executeScanWithAutoActionsAction(code)` (see `modules/actions.md`).
3. Result is displayed in `ActiveCardZone`: card details, auto-action feedback, manual action buttons.
4. If `pausedForConfirmation=true` (blocking errors + override allowed), a modal appears. On confirm, `resumeAutoActionsAction` is called.
5. On any manual action execution, `executeActionAction` is called; card state and scan-validation state update.

### Dashboard settings (master)

1. `/settings/dashboard` — feed options + summary fields per card type.
2. Summary fields are chosen from the union of the card type's field definitions. Position is draggable.
3. On save, `Server Action` writes to `card_type_summary_fields` (upsert + soft-delete missing).

## Extension points

- **New feed display option** → extend `dashboard_settings` schema + `FeedSettingsSection` + rendering logic in `ActivityFeed`.
- **New feed entry type** → extend `log_type` enum + `ActivityFeedEntryRow` variant. Requires corresponding producer in `actions` or `scanning`.
- **Cross-tenant analytics** — out of current scope. A new module would be warranted.

## Module interactions

- Reads from: `action_logs` (feed and operational scan pipeline), `cards` + `fields` (summary fields resolution), `card-types` (field definitions), `dashboard_settings` (feed limits, `allow_override_on_error`).
- Signs: card photo object keys → read URLs via `@/lib/storage/read` (`signPhotosForRead`) for feed and active-card thumbnails.
- Calls: `executeScanWithAutoActionsAction` and `resumeAutoActionsAction` (from `modules/cards.md`) — dashboard is the primary operational scan surface.
- Related: `modules/history.md` also reads from `action_logs` but for full-history audit/export with advanced filtering, not the live feed.

## Open TODOs

- [ ] None specific (no tagged `TODO:` comments in source as of sync date).

## Recent changes

- 2026-07-16 — Card photo thumbnails on the dashboard: `ActivityFeedEntryRow` scan rows show the card's photo (`cardPhotoUrl`, `object-cover` avatar, fallback to the `--state-info` scan icon); `ActiveCardZone` renders `photo` summary fields as thumbnails. `getActivityFeed` resolves + signs each card's primary photo; scan/resume actions in `src/lib/actions/cards.ts` sign the returned card's photos.
- 2026-06-06 — Dashboard rebuild: every dashboard file rewritten on shadcn primitives + Layer 2 tokens. Zero inline styles, zero hex left in the rebuilt surface. Override and warning are now visually distinct (orange vs amber). Scan-feed icon is now neutral (`--state-info`), not grant-green. ThemeToggle added in topbar. KPI strip introduced (4 cards from existing DAL only — no new queries). See `decisions/2026-06-06-dashboard-rebuild.md`.
- 2026-06-06 — Design system foundation landed (Phase 1) — OKLCH tokens, shadcn primitives, `next-themes`, brand swap via `data-brand`. See `decisions/2026-06-06-design-system-tokens.md` + `decisions/2026-06-06-adopt-shadcn-ui.md`.
- 2026-04-19 — Initial extraction from technical handoff + documentation sync against source code.

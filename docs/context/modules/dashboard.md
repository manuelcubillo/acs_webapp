# Module: dashboard

**Last updated**: 2026-04-19 · **Last feature**: documentation sync against source code

## Responsibility

The operator dashboard and associated tenant settings: active card zone, activity feed, summary fields per card type, and dashboard configuration.

Does not own action execution (see `actions`) or card lookup (see `cards`).

## Key files

- `src/app/(dashboard)/dashboard/page.tsx` — Dashboard page (OPERATOR+). Parallel fetch of `getDashboardSettings` + `getTenantById`, then sequential `getActivityFeed` (uses `feedLimit` from settings).
- `src/app/(dashboard)/dashboard/actions.ts` — Dashboard route-level Server Actions (wraps `getActivityFeed` etc.).
- `src/app/(dashboard)/dashboard/QuickCodeInput.tsx` — Informational code lookup widget: navigates to `/cards/[code]` without triggering an operational scan. Distinct from `DashboardSearchBar`.
- `src/components/dashboard/DashboardView.tsx` — Primary client container. On scan code received: calls `executeScanWithAutoActionsAction` (operational scan pipeline). Mounts `DashboardSearchBar`, `ActiveCardZone`, `ActivityFeed`.
- `src/components/dashboard/DashboardSearchBar.tsx` — **Operational scan input**: manual code entry + external reader. Calls `onScan(code)` → `executeScanWithAutoActionsAction` in parent. Focused on mount for immediate barcode capture.
- `src/components/dashboard/ActiveCardZone.tsx` — Currently scanned card + inline action execution.
- `src/components/dashboard/ActivityFeed.tsx` — Recent entries list.
- `src/components/dashboard/ActivityFeedEntryRow.tsx` — Single row renderer (scan vs action).
- `src/components/dashboard/AutoActionFeedback.tsx` — Toast for auto-executed actions.
- `src/app/(dashboard)/settings/dashboard/page.tsx` — Dashboard settings (MASTER). Feed options + summary fields config.
- `src/components/settings/dashboard/DashboardSettingsView.tsx` — Wrapper.
- `src/components/settings/dashboard/FeedSettingsSection.tsx` — Activity feed display options.
- `src/components/settings/dashboard/SummaryFieldsSection.tsx` — Per-card-type summary field config.
- `src/lib/dal/dashboard-settings.ts` — `dashboardSettings` + `cardTypeSummaryFields` CRUD.
- `src/lib/dal/activity-feed.ts` — `getActivityFeed` (unified scan + action query).
- `src/lib/actions/dashboard-settings.ts` — Server Actions for feed settings and summary fields.

## Data model (relevant subset)

- `dashboard_settings(tenant_id, ...)` — per-tenant feed configuration.
- `card_type_summary_fields(card_type_id, field_definition_id, position)` — which fields appear compactly.
- `action_logs` — source for the feed. `tenant_id` denormalized for single-table queries.

## Main flows

### Activity feed load

1. `getActivityFeed(tenantId, { limit, includeScanEntries, includeActionEntries })` queries `action_logs` filtered by `tenant_id`.
2. Returns unified entries — each is either a scan or an action. Card summary fields are pre-joined.
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
- Calls: `executeScanWithAutoActionsAction` and `resumeAutoActionsAction` (from `modules/cards.md`) — dashboard is the primary operational scan surface.
- Related: `modules/history.md` also reads from `action_logs` but for full-history audit/export with advanced filtering, not the live feed.

## Open TODOs

- [ ] None specific (no tagged `TODO:` comments in source as of sync date).

## Recent changes

- 2026-04-19 — Initial extraction from technical handoff.
- 2026-04-19 — Synchronized documentation against source code: added `QuickCodeInput`, corrected `DashboardSearchBar` as operational scan input, added `DashboardView` → `executeScanWithAutoActionsAction` interaction, fixed data-fetch sequence, cross-referenced `history` module.

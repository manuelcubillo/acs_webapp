# Module: dashboard

**Last updated**: 2026-08-28 · **Last feature**: feed rows show the values each event observed — both producers project the same frozen snapshot

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
- `src/components/dashboard/ActiveCardZone.tsx` — Currently scanned card + inline action execution. `toggle` actions render as a `Switch` (state via the `toggleStates` prop); everything else stays a `Button`. State → token mapping: granted=green / warning=amber / denied=red / **override=orange** (phase 2), each with icon + label. Lifecycle takes precedence over scan validation: archived → red denial with no action buttons; inactive/expired → orange `--state-override` surface (via the `lifecycleGate` prop). Shows a neutral `CardStatusBadge`. The summary area (`SummaryGrid`) places each configured field at its grid cell via the `summaryLayout` prop; a two-row photo gets `sm:row-span-2` and the taller `--photo-thumbnail-size-tall` cap. **Empty layout = unconfigured**, which falls back to the legacy first-6-fields-with-a-value grid. Values are resolved by `fieldDefinitionId` (not by walking `card.fields`) so a configured-but-empty field renders "—" instead of collapsing the arrangement. `photo` fields render via `PhotoRenderer` in stable-route mode (`cardCode` + `fieldDefinitionId`, `enlargeable={false}`) — **not** the field's raw value, which is presence-only here; click falls through the wrapping `Link` to the card detail. See ADR `2026-08-25-active-card-zone-stable-photo-route.md`.
- `src/components/shared/PhotoRenderer.tsx` — Shared photo thumbnail (+ optional lightbox), used by `ActiveCardZone` and `cards`' `DynamicFieldRenderer`. Stable-route mode when given `cardCode` + `fieldDefinitionId` (the default everywhere except the external API and the card detail server page, which still pass a pre-signed `value`). Accepts `className` to override its default thumbnail sizing.
- `src/components/dashboard/ActivityFeed.tsx` — Recent entries list. Presentational and fully controlled — no polling, no state of its own. `lastRefreshedAt` renders as "Actualizado HH:MM": the last time the SERVER was asked, which is what makes the no-polling trade honest. Owns `badgeLabel` — the ONLY place a feed row's action label is resolved, for absorbed and standalone rows alike.
- `src/components/dashboard/ActivityFeedEntryRow.tsx` — Single row renderer. Scan rows show the card's photo thumbnail (`entry.cardPhotoUrl`, `object-cover` avatar), falling back to the `--state-info` scan icon when absent. Action rows keep the `--primary` Zap icon and render `actionLabel ?? entry.actionName` — the component never reasons about presence, it is handed finished strings. Override badge = `--state-override` (orange, distinct from amber warning). Renders no photo-typed summary field — see `getFeedSummaryFieldConfig`.
- `src/lib/dashboard/feed-entries.ts` — Client-side row construction: `buildScanEntries`, `buildActionEntries`, `prependEntries`. **Mirrors the server's logging rules** — keep in step with `src/lib/actions/cards.ts`. Sets `scanLogId` / `isPresence` / `presenceAfterValue` so locally-built rows group and label exactly like server-built ones, and builds each row's VALUES with `projectSnapshotFields` — the same function `getActivityFeed` calls. Imports it from `@/lib/snapshots/project` directly, not the barrel, which re-exports DB-backed and `node:crypto` code.
- `src/lib/dashboard/feed-grouping.ts` — **Pure**, no imports beyond types: `groupFeedRows(entries) → GroupedFeedEntry[]`. The ONLY grouping implementation; neither builder groups. Also owns feed sizing: `DEFAULT_FEED_LIMIT` and `feedRawBudget(displayLimit)` (raw rows a producer must fetch to fill that many groups). Unit-tested in `__tests__/feed-grouping.unit.test.ts` (20 cases, including a "loses no rows" invariant).
- `src/components/presence/PresenceControl.tsx` — Two-segment Entrada/Salida group, replacing the phase-1 `Switch`. Rendered on the scan panel, the card detail and `/presence`.
- `src/app/api/photos/cards/[code]/route.ts` — Session-authenticated (OPERATOR+) card photo. 302 → signed storage URL, minted per request. ADR `2026-07-17-stable-photo-routes.md`.
- `src/components/dashboard/AutoActionFeedback.tsx` — Per-result feedback for auto-executed actions. Success = state-granted, failure = state-denied.
- `src/components/layout/DashboardShell.tsx` — Sidebar + topbar shell. Token-driven, includes `ThemeToggle` icon button and `Avatar` primitive. The sidebar is `md:` and up; below that breakpoint the topbar's `MobileNavMenu` dropdown carries the same entries, fed by the single `visibleNav` array (role + `presenceEnabled` filtering computed once in `DashboardShellBody`). `signOutAndRedirect` is module-level so the sidebar button and the mobile entry share one flow.
- `src/components/shared/ThemeToggle.tsx` — Binary light ↔ dark switch, wired to `next-themes` via `useThemeContext()`.
- `src/app/(dashboard)/settings/dashboard/page.tsx` — Dashboard settings (MASTER). Feed options + summary fields config.
- `src/components/settings/dashboard/DashboardSettingsView.tsx` — Wrapper. Section order: **ActiveCardFieldsSection first**, then FeedSettingsSection, then SummaryFieldsSection.
- `src/components/settings/dashboard/ActiveCardFieldsSection.tsx` — Per-card-type 3×3 grid editor for the panel. One `<Select>` per cell (not drag & drop — justified in the file header and the ADR), plus an "Ocupar dos filas" `Switch` on photo cells, disabled when the span is geometrically impossible. Runs the same `validateActiveZoneLayout` the Server Action does.
- `src/components/settings/dashboard/FeedSettingsSection.tsx` — Activity feed display options.
- `src/components/settings/dashboard/SummaryFieldsSection.tsx` — Per-card-type FEED summary field config (max 3 in the UI, `.max(5)` in the Zod schema — a long-standing inconsistency). Photo fields are selectable here but silently dropped by the feed.
- `src/lib/dashboard/active-zone-layout.ts` — **Pure** grid geometry: dimensions, `rowOf`/`colOf`/`cellBelow`, `occupiedCells`, `buildOccupancyMap`, `canSpanTwoRows`, `validateActiveZoneLayout`, and the Spanish `LAYOUT_ERRORS`. No server or React dependency, so the editor and the Server Action enforce identical rules. Unit-tested in `__tests__/active-zone-layout.unit.test.ts` (21 cases).
- `src/lib/dal/active-card-zone-fields.ts` — `cardTypeActiveZoneFields` CRUD: `getActiveZoneFieldsForCardType(s)` for the editor and `getActiveZoneFieldConfig(tenantId)` (joined to field definitions, `photo` INCLUDED, inactive fields excluded) for the dashboard. `setCardTypeActiveZoneFields` replaces a layout wholesale.
- `src/lib/dal/dashboard-settings.ts` — `dashboardSettings` + `cardTypeSummaryFields` CRUD, plus `getFeedSummaryFieldConfig` (the static per-tenant config the client needs to build rows; excludes `photo` fields, whose value is an object key). **Untouched by the grid feature.**
- `src/lib/dal/activity-feed.ts` — `getActivityFeed` (unified scan + action query). Runs on page load and manual refresh only. Summary values come from each row's frozen snapshot (`loadSnapshotsForLogRows` + `projectSnapshotFields`); the live `field_values` join runs only for cards whose rows predate migration 0022. Sets `entry.cardPhotoUrl` to the stable photo route when any active `photo` field of the card holds a key — it no longer signs anything.
- `src/lib/actions/dashboard-settings.ts` — Server Actions for feed settings and summary fields.

## Data model (relevant subset)

- `dashboard_settings(tenant_id, ...)` — per-tenant feed configuration.
- `card_type_summary_fields(card_type_id, field_definition_id, position)` — which fields appear compactly **in the feed**.
- `card_type_active_zone_fields(card_type_id, field_definition_id, position, row_span)` — the **panel's** 3×3 grid. `position` 0–8 (`CHECK`), `row_span` 1|2 (`CHECK`), `UNIQUE(card_type_id, position)` and `UNIQUE(card_type_id, field_definition_id)`. Migration `0018`. Note the DB cannot express the lower half of a two-row photo, so that overlap is caught only by `validateActiveZoneLayout`.
- `action_logs` — source for the feed. `tenant_id` denormalized for single-table queries. Four `log_type` values exist; `getActivityFeed` uses a positive **whitelist** (`scan` and/or `action`), which is what keeps `lifecycle` and `card_edit` out.
- `card_snapshots` — the state each feed row observed. Same two-step resolution `/history` uses.
  ⚠️ For `card_edit` that exclusion is **permanent**, not staging for A2. The feed answers "what is happening at the door right now"; an administrator correcting a phone number in the office is not a door event. It belongs in `/history`, the audit surface. `MakeEntryArgs.logType` in `feed-entries.ts` is narrowed to `"scan" | "action"` so building one client-side is a compile error.

## Main flows

### Feed grouping (at render)

`ActivityFeed` calls `groupFeedRows` on whatever rows it was handed. **Neither
builder groups** — the feed is produced twice (server DAL + client mirror), and
implementing grouping in both would guarantee two algorithms that drift, with "the
feed rearranges itself on Refrescar" as the symptom.

Three rules:

1. **Scan groups.** A `scan` row absorbs every `action` row whose `scanLogId`
   equals its `id`, rendering as one "Escaneado" entry with one badge per
   absorbed auto-action. The presence badge reads **Entrada** / **Salida** via
   `presenceDirectionLabel`; every other badge is the action's name. An
   auto-action whose scan fell past the feed limit renders **standalone**, never
   dropped.
2. **Repeated manual actions.** Consecutive uncorrelated `action` rows merge into
   one "×N" when they share card + action definition + **executing user** +
   **presence direction**, each within 10s of its neighbour (a chain, so a steady
   stream keeps merging). The same-user requirement is not optional: two
   operators are two facts, and so are an entry and an exit — the group renders
   the newest row's label, so merging opposite directions would print
   "Salida ×2" over one of each.
3. Everything else passes through. A group of one is never a group — no `×1`.

⚠️ **The label is resolved for every `action` row, grouped or not.**
`ActivityFeed.badgeLabel` runs over a scan's absorbed actions AND over a
standalone / repeated row's own badge. Applying it only to the absorbed ones was
the bug where an operator's manual Entrada/Salida read "Presencia" while the
identical scan-driven toggle read the direction.

The tenant's `feedLimit` ("Número de entradas a mostrar") **counts GROUPS**, so a
"×3" run is one entry, not three. It is applied at the same boundary as the
grouping — `groupFeedRows(entries).slice(0, feedLimit)` in `ActivityFeed` —
because a producer that has not grouped yet cannot apply it correctly.

⚠️ **Producers therefore fetch a raw-row BUDGET, never the display limit**:
`feedRawBudget(feedLimit)` = `min(feedLimit * 3, 100)`. That applies to
`getActivityFeed`'s SQL `LIMIT` (dashboard page + `getActivityFeedAction`) and to
`prependEntries`' client-side trim. Passing the display limit to either is the
bug this replaced. The surplus rows also keep the group-boundary artefact below
the display cut — auto-actions sort *above* their scan, so the anchoring row is
the oldest in its group and a cut through one orphans its actions.
At `feedLimit = 100` the budget is the cap, so a heavily grouped feed can still
show fewer — pre-existing degradation, never worse.
ADR `2026-08-25-feed-limit-counts-groups.md`.

### Activity feed load and refresh

**The feed does not poll.** ADR `2026-07-17-dashboard-feed-no-polling.md`.

1. Server-built rows arrive only at page load and on Refrescar (`DashboardView.refreshFeed` → `getActivityFeedAction` → `getActivityFeed`), which queries `action_logs` by `tenant_id`, resolves each row's snapshot and flags which cards have a photo.
2. In between, `DashboardView` appends rows itself after every mutation, built from what the action already returned (`feed-entries.ts`). No round trip.
3. Refresh REPLACES the list wholesale — server rows already contain the locally appended scans, so client rows never need reconciling. Hence their `id` may be a client UUID (nothing reads it but React's list key) and their `executedAt` the client clock (rows are prepended, never sorted).
4. Rendered by `ActivityFeed` → one `ActivityFeedEntryRow` per entry.

Consequence: rows produced by OTHER dashboards appear only on refresh.

⚠️ **The two producers must project the same frozen state, and this is where it is easy to get wrong.** `ScanWithAutoActionsResult.card` is the card AFTER its auto-actions ran. A scan row built from it would show a balance of 9 where the server, on the very next Refrescar, shows the 10 the scan actually observed — `logScanEntry` freezes the state before any action runs. So the Server Actions return, alongside what they always returned:

- `scanSnapshotId` — the scan row's snapshot (null on the resume path, which writes no scan row);
- `snapshots` — snapshotId → payload for every row the call wrote, deduplicated;
- per action row, `result.log.id` / `.cardSnapshotId` / `.snapshotCreated`, which `ActionLog` already carried.

`buildScanEntries` uses `scanSnapshotId` for the scan row and each action's own `result.log.cardSnapshotId` for its row, then calls `projectSnapshotFields` — the same function the server calls, on the same payload. The acceptance test lives in `src/lib/snapshots/__tests__/read-path.integration.test.ts`: scan a card whose auto-action decrements 10 → 9, and the scan row must read 10 both before and after Refrescar.

Payloads are stripped of `photo` object keys at the Server Action boundary (`loadClientSnapshots`), where `signScanResultPhotos` already sits.

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
- **New feed entry type** → extend `log_type` enum + `ActivityFeedEntryRow` variant + a producer in `actions` or `scanning`, **and** a client mirror in `feed-entries.ts` (widening `MakeEntryArgs.logType`, which is narrowed on purpose). Without the mirror the row only appears on refresh. `lifecycle` and `card_edit` entries are deliberately not surfaced — the whitelist in `getActivityFeed` is the exclusion, and for `card_edit` it is permanent.
- **A new value on a feed row** → derive it inside `projectSnapshotFields` or from the payload, never from `CardWithFields` on the client. Reading the live card is what makes the two producers disagree.
- **Change the panel's grid size** → `src/lib/dashboard/active-zone-layout.ts` derives everything from `ACTIVE_ZONE_COLUMNS` / `ACTIVE_ZONE_ROWS`, but the DB `CHECK` on `position` and the literal `COL_START_CLASS` / `ROW_START_CLASS` arrays in `ActiveCardZone` are hardcoded to 3×3 and need a migration + edit. Tailwind cannot generate placement classes from interpolated strings.
- **New field type in the panel** → `SummaryCell` branches on `photo` vs everything else. A type needing custom display adds a branch there; only `photo` may span two rows (enforced in `validateActiveZoneLayout`).
- **New nav entry** → one push to `NAV_ITEMS` in `DashboardShell`; the sidebar and the mobile dropdown both consume the already-filtered `visibleNav`, so there is no second list to keep in step. Role gating stays on the item's `minRole` — see `modules/auth-tenants.md`.
- **Cross-tenant analytics** — out of current scope. A new module would be warranted.

## Module interactions

- Reads from: `action_logs` (feed and operational scan pipeline), `cards` + `fields` (summary fields resolution), `card-types` (field definitions), `dashboard_settings` (feed limits, `allow_override_on_error`).
- Serves: feed thumbnails and the `ActiveCardZone` panel photo cell both via `/api/photos/cards/[code]` (`cardPhotoRoute` in `@/lib/storage/photo-routes`, `PhotoRenderer` in `src/components/shared/`), which signs per request. `signCardPhotos` (`@/lib/dal/photo-urls`) still embeds signed URLs in the card object for the external API route and the card detail server page, but the dashboard panel no longer depends on it — see ADR `2026-08-25-active-card-zone-stable-photo-route.md`.
- Mirrors: the logging rules of `executeScanWithAutoActionsAction` / `resumeAutoActionsAction` (`src/lib/actions/cards.ts`), client-side in `feed-entries.ts`. Changing what those log means changing the mirror.
- Calls: `executeScanWithAutoActionsAction` and `resumeAutoActionsAction` (from `modules/cards.md`) — dashboard is the primary operational scan surface.
- Related: `modules/history.md` also reads from `action_logs` but for full-history audit/export with advanced filtering, not the live feed.

## Open TODOs

- [ ] **Invitation tenant: entries/exits can render as no-ops.** For `scan_strategy = 'invitation'`, `GUEST_ENTRY` paid with a half-credit and `GUEST_EXIT` (refunding or not) log `before_value === after_value` on `invitations`; the real `HALF_INVITATION` change goes through the unlogged `setFieldValue`. Only `metadata.invitationSettlement` records what happened, and no surface reads it. Fix belongs here, not in the strategy. ADR `2026-08-27-invitation-accounting.md`.

## Recent changes

- 2026-08-28 — **Feed values come from the snapshot (A2).** `getActivityFeed` resolves each row through `loadSnapshotsForLogRows` + `projectSnapshotFields`, and `feed-entries.ts` calls the SAME projection on payloads the Server Action now returns (`scanSnapshotId`, `snapshots`, plus the per-action log ids `ActionLog` already carried). This closes the hazard A2 created: `ScanWithAutoActionsResult.card` is the post-auto-action state, so a client-built scan row would have shown 9 where the next Refrescar showed 10. Payloads are stripped of photo object keys at the boundary. The card code and card type name stay LIVE here, unlike `/history` — the feed is a twenty-row operational window and the code is what the operator reads off the card in hand. `card_edit` remains permanently excluded. ADR `2026-08-28-card-snapshots-read-path.md`.
- 2026-08-28 — Card snapshots landed (write path) and added a fourth `log_type`, `card_edit`. The feed's whitelist already excluded it; that exclusion is now **stated and permanent**. `MakeEntryArgs.logType` was narrowed from the whole enum to `"scan" | "action"`, so a client-built row for a filtered-out type is a compile error rather than a row that vanishes on the next Refrescar. ADR `2026-08-28-card-snapshots-write-path.md`.
- 2026-08-25 — Mobile navigation. Below `md` the sidebar is hidden and nothing replaced it: on a phone the whole nav — including Configuración and Cerrar sesión — was unreachable. The topbar now opens with a `MobileNavMenu` dropdown (hamburger left of the title, `md:hidden` on the trigger AND on the portal content, which outlives a resize). It renders the SAME `visibleNav` the sidebar gets — already filtered by role and `presenceEnabled` — so visibility rules stay in one place; entries are `DropdownMenuItem asChild` + `<Link>` (Radix closes on select), under a tenant header that restores the otherwise-invisible `BrandHeader` identity. `signOutAndRedirect` was lifted out of `SignOutButton` so both surfaces share it. Chosen over a `Sheet` drawer because `dropdown-menu` already exists in `src/components/ui/` and a new primitive was not worth it. Nothing changes at `md` and above. No ADR — responsive UI addition inside the existing shell.
- 2026-08-25 — Fixed: a MANUAL presence toggle showed "Presencia" in the feed while the scan-driven one showed "Entrada" / "Salida". Root cause: `presenceDirectionLabel` was reached only through `badgeLabel`, which `ActivityFeed` applied exclusively to the actions a scan absorbed; a manual row carries no `scanLogId`, renders as `single`, and fell to `entry.actionName` — the system action's name. `ActivityFeedEntryRow` now takes an `actionLabel` prop (falling back to `actionName`) and `ActivityFeed` fills it with the same derivation. The data was already there in both producers. Two knock-ons: `executeAndRefresh` now passes the execution result into its synthetic `AutoActionResult`, so the locally-appended row knows `newValue` and labels itself immediately instead of waiting for a Refrescar; and `repeatKey` gained the direction, so an entry and an exit within the 10s window no longer merge into a "×2" wearing the newer row's label. No ADR — a fix inside the existing rules. 2 tests added (22 in `feed-grouping.unit.test.ts`).
- 2026-08-25 — Fixed: a grouped feed under-filled the tenant's configured limit — a "×3" run or a scan with two auto-actions cost three entries of the budget and rendered as one line. The limit now **counts groups**: `ActivityFeed` applies it right after `groupFeedRows`, and both producers fetch `feedRawBudget(feedLimit)` = `min(feedLimit * 3, 100)` raw rows instead. This supersedes only the "Accepted consequence" clause of the grouping ADR — the correlation key and render-time grouping stand, and `groupFeedRows` itself is untouched (its 15 tests still pass, 5 added). `prependEntries`' third param renamed `feedLimit` → `rawBudget`, since passing the display limit there was the bug; `DEFAULT_FEED_LIMIT` moved into `feed-grouping.ts`, collapsing three of four hardcoded `20`s. The over-fetch also hides a boundary artefact: auto-actions sort *above* their scan, so a cut through a group orphans them. ADR `2026-08-25-feed-limit-counts-groups.md`.

_Pruned to the 5-entry cap: the feed-grouping (2026-08-25), presence-control
(2026-08-24), panel-grid (2026-08-04) and phase-2 lifecycle (2026-07-17) entries
live on in ADRs `2026-08-25-feed-grouping-and-scan-correlation.md`,
`2026-08-24-presence-control.md`, `2026-08-04-active-card-summary-grid.md` and
`2026-07-17-card-lifecycle-scan-behaviour.md`._

_Pruned to the 5-entry cap: the `ActiveCardZone` signed-photo fix (2026-08-25) is described in `2026-08-25-active-card-zone-stable-photo-route.md`._

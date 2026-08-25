# Module: actions

**Last updated**: 2026-08-25 · **Last feature**: `metadataExtra` — caller-supplied log annotation, keeping `executeAction` generic

## Responsibility

Action definitions on card types, execution (`executeAction`), auto-action sequencing during operational scans, the override-on-error flow, and action logging.

Does not own scan triggering (see `scanning`) or validation rules (see `validations`).

## Key files

- `src/lib/dal/actions.ts` — `getActionsForCardType`, `getAutoExecuteActions`, `executeAction`, `logScanEntry`, CRUD.
- `src/lib/actions/cards.ts` — `executeScanWithAutoActionsAction`, `resumeAutoActionsAction`, `validateBeforeActionAction` (operational scan pipeline lives here, not in `actions.ts`).
- `src/lib/actions/actions.ts` — `executeActionAction` Server Action (manual single-action execution).
- `src/lib/db/schema/access-control.ts` — `action_definitions`, `action_logs` tables.
- `src/components/card-types/steps/ActionsStep.tsx` — Add/remove/configure action definitions in the wizard. The "Auto-ejecutar al escanear" toggle marks an action `is_auto_execute`.
- `src/components/cards/CardActions.tsx` — Execute controls on card detail. Filters on `is_operator_visible` (prop `onlyOperatorVisible`) — **not** `!is_auto_execute` any more. A `toggle` action renders as a shadcn `Switch` reflecting `toggleStates[action.id]`; everything else is a `Button`. One action loading at a time (`loadingId` state).
- `src/components/dashboard/ActiveCardZone.tsx` — Displays operational scan result (active card + auto-action feedback + manual action controls). `toggle` actions render as a `Switch`. Delegates execution to `DashboardView` via `onManualAction`; `DashboardView` is where the `is_operator_visible` filter is applied.
- `src/lib/action-strategies/compute-new-value.ts` — The `action_type` switch (relocated out of `executeAction` by ADR `2026-07-09`). `toggle` returns `!(current ?? false)`.
- `src/lib/fields/toggle-state.ts` — `buildToggleStates(actions, fields)`: `actionId → current boolean`, so a switch can show the value it would flip. Called by the parents, which are the only place both the card values and the action list are in hand.
- `src/components/dashboard/AutoActionFeedback.tsx` — Toast/feedback for auto-executed actions after an operational scan.
- `src/app/api/cards/[code]/actions/[actionDefinitionId]/execute/route.ts` — External execution endpoint.

## Data model (relevant subset)

### `action_definitions`

| Column                         | Notes                                                     |
| ------------------------------ | --------------------------------------------------------- |
| `id`                           | UUID PK                                                   |
| `card_type_id`                 | FK                                                        |
| `name`                         | Display name                                              |
| `action_type`                  | `increment | decrement | check | uncheck | toggle`        |
| `target_field_definition_id`   | FK → `field_definitions`. Type compatibility enforced.    |
| `config`                       | jsonb — e.g. `{ amount }` for increment                   |
| `icon`, `color`                | UI                                                        |
| `position`                     | Order of buttons                                          |
| `is_auto_execute`              | Runs on every operational scan. **Nothing else.**         |
| `is_operator_visible`          | Renders as a control. Independent of `is_auto_execute`.   |
| `is_system`                    | Server-provisioned; hidden from configuration surfaces.   |
| `is_active`                    | Soft delete                                               |

**Type compatibility** — one map, `REQUIRED_FIELD_TYPE` in `src/lib/dal/actions.ts`, consumed by both `assertCompatible` (the writer) and `getCompatibleFieldsForAction` (the picker), so they cannot disagree:

- `increment` / `decrement` → target must be a `number` field. Config: `{ amount: number }`.
- `check` / `uncheck` / `toggle` → target must be a `boolean` field. `toggle` config is `{}`.

**Visibility vs auto-execution.** Until 2026-08-24 these were one flag: both operator surfaces hid actions with `!is_auto_execute`. Presence control needs an action that fires on scan **and** is correctable by hand, so they are now separate columns. Migration 0021 backfilled `is_operator_visible = NOT is_auto_execute`, preserving prior rendering exactly. All four combinations are meaningful.

### `action_logs`

Unified table for scans **and** actions. `log_type: 'scan' | 'action'`. `tenant_id` is denormalized for fast feed queries (must be kept in sync on card operations).

**The `metadata` contract.** Untyped jsonb with several producers. Keys read by more than one layer are declared in `src/lib/dal/metadata-keys.ts` — never spell one inline, a typo fails silently as a row that never matches.

| Producer | Keys |
| --- | --- |
| `executeAction` | `action_type`, `target_field`, `before_value`, `after_value` |
| …override branch | `operator_override`, `override_validation_errors` |
| …`metadataExtra` (caller) | currently `scanLogId` |
| …strategy result | whatever a `TenantActionStrategy` returns |
| `logScanEntry` ← scan pipeline | `method: "operational_scan"`, `cardCode` |
| lifecycle CTEs | `from`, `to`, `transition`, `cascaded_from_card_type_id` |

⚠️ Two naming conventions coexist: `executeAction` writes **snake_case**, the scan pipeline **camelCase**. Pre-existing; `scanLogId` follows the scan side. Nothing normalises existing rows.

**`metadataExtra`** is how a caller annotates a log row without `executeAction` learning anything caller-specific — it stays a pure read → compute → write → log primitive (ADR `2026-07-09`). Merged **before** the override flags, so a caller can annotate but never rewrite `operator_override`. The scan pipeline is its only current user.

**`scanLogId`** correlates an auto-action with the scan that caused it. Present on every action a scan executes, **including a resumed override run** (the id round-trips through the client — see `modules/cards.md`). Absent on manual actions, and that absence is the definition. Absent on every row written before 2026-08-25; there is no backfill, so historical rows never group. ADR `2026-08-25-feed-grouping-and-scan-correlation.md`.

## Main flows

### `executeAction` (single action, user-triggered)

1. Read current `field_value` for the target field.
2. Compute new value based on `action_type` + `config`.
3. Write new value.
4. Insert row in `action_logs` with `log_type='action'`, before/after metadata, `executed_at`, `executed_by`.

**Atomicity note:** Neon HTTP driver does not support interactive transactions. The sequence is read → write → log using separate DB calls. A crash between steps could leave partial state. This is a known limitation tracked for migration to a transaction-capable driver.

### Operational scan — `executeScanWithAutoActionsAction(code)`

Full sequence (implemented in `src/lib/actions/cards.ts`, primary home in this module):

1. Fetch card by code. Run initial scan validations (`validateScan`).
2. Log the scan entry (`logScanEntry` → `log_type='scan'`).
3. Fetch `dashboard_settings` to check `allow_override_on_error`.
4. If initial validations have **error-level failures**:
   - `allow_override_on_error=false` → return `hasBlockingErrors=true`, no modal. Auto-actions do not run.
   - `allow_override_on_error=true` → return `pausedForConfirmation=true` with `pendingAutoActionIds`. Client opens override modal.
5. Fetch `is_auto_execute` actions (`getAutoExecuteActions`). Execute **sequentially**, stopping on first failure. After each action: re-fetch card, re-run `validateScan`.
   - Mid-loop error-level failure → same BLOCK / PAUSE logic as step 4 (with remaining action IDs).
6. Return final card state, per-action results, and final `ScanValidationResult`.

### Override resume — `resumeAutoActionsAction(input)`

Called when operator confirms the modal (`pausedForConfirmation=true` was returned). Executes the `pendingActionIds` list in order, each with `operatorOverride=true`. Logged with `operator_override: true` (and `override_validation_errors`) in `action_logs.metadata`. Can re-pause mid-loop for the same override logic. Cross-referenced from `modules/scanning.md` and `modules/cards.md`.

### Manual execution — `executeActionAction({ cardId, actionDefinitionId })`

Called from `CardActions` (card detail page) and `DashboardView` (active card zone manual actions). Returns `{ success, data: { previousValue, newValue }, ... }`. UI re-renders with the new value and re-evaluates scan validations client-side.

**Lifecycle gate (phase 2, server-side):** before executing, it loads the card's status (`getCardLifecycleStatus`) and runs `resolveLifecycleGate` (see `modules/cards.md`). `archived` → `CardArchivedError` (403); `inactive`/`expired` with override off → `LifecycleBlockedError` (422); with override on but no `operatorOverride` flag → `OverrideRequiredError` (422, client opens the override modal and retries); with the flag → executes and appends the lifecycle reason to `override_validation_errors`. This is a genuine server-side block — distinct from scan validations, which never block (constraint #9). The clients pre-check via `validateBeforeActionAction` (now returns `lifecycleGate`) for UX, but the server is the source of truth.

## Extension points

- **New action type** → extend the `action_type` enum (its own migration — `ALTER TYPE … ADD VALUE` cannot be followed by a use of the value in the same transaction), add a case to `computeNewValue`, add an entry to `REQUIRED_FIELD_TYPE`, and extend the maps in `ActionsStep` (`ACTION_TYPE_META` + `ACTION_TYPE_ORDER`) and `ReviewStep` (`ACTION_META`). ⚠️ Also the two **hand-written duplicates** of the union that do not derive from the table: `ActionType` in `src/hooks/useCardTypeWizard.ts` and `ActionTypeSchema` in `src/lib/actions/actions.ts`. `ActionType` in `src/lib/dal/types.ts` derives from the schema and updates itself.
- **New target field compatibility** → update the compatibility map in `ActionsStep` + DAL validator.

## Module interactions

- Reads from: `fields` (target field values + definitions).
- Writes to: `field_values` (via execution), `action_logs`.
- Triggered by: `dashboard` (operational scan via `DashboardSearchBar` / `DashboardView`), `cards` (manual execution on detail page), external API. Note: `scanning` describes the input surface but delegates to `dashboard` for the operational pipeline.
- Feeds: `dashboard` (activity feed).

## Open TODOs

- [ ] Atomicity — revisit when/if a transaction-capable driver replaces Neon HTTP, or add a compensating-write strategy.

## Future considerations

- Plugin/handler registry for `executeAction` extensibility (no code tag; design not started).

## Recent changes

- 2026-08-25 — `ExecuteActionInput` gained `metadataExtra?: Record<string, unknown>`, merged into the log row's metadata before the override flags. It exists so the scan pipeline can stamp `scanLogId` without `executeAction` knowing what a scan is; a caller can annotate but not overwrite `operator_override`. Well-known metadata keys and their readers now live in `src/lib/dal/metadata-keys.ts`. ADR `2026-08-25-feed-grouping-and-scan-correlation.md`.
- 2026-08-24 — New `toggle` action type (general purpose: any boolean field, any card type; `!(current ?? false)`, so a missing value row reads as off and the first toggle turns it on). `is_operator_visible` split out of `is_auto_execute` — both operator surfaces now filter on the new column, backfilled to `NOT is_auto_execute` so existing data renders identically. `toggle` actions render as a shadcn `Switch` (state from `buildToggleStates`) instead of a `Button`, in both `CardActions` and `ActiveCardZone`. Type compatibility consolidated into one `REQUIRED_FIELD_TYPE` map. First consumer is presence control — see `modules/presence.md`. ADR `2026-08-24-presence-control.md`.
- 2026-07-17 — Phase-2 lifecycle gate. `executeActionAction` enforces `resolveLifecycleGate` server-side (archived → `CardArchivedError` 403; inactive/expired → `LifecycleBlockedError` / `OverrideRequiredError` 422). The operational pipeline denies archived (no auto-actions, scan still logged) and pauses/blocks inactive/expired via a synthetic scan check. New error classes in `src/lib/api/errors.ts`. External `execute` route gates too (archived 403, off 422, no interactive override). See `modules/cards.md` and ADR `2026-07-17-card-lifecycle-scan-behaviour.md`.
- 2026-04-19 — Initial extraction from technical handoff + memory context about auto-action sequencing and override flow.
- 2026-04-19 — Synchronized documentation against source code: added `logScanEntry`, `executeScanWithAutoActionsAction`, `resumeAutoActionsAction`; corrected operational scan flow with re-validation detail; clarified `is_auto_execute` flag behavior.

# Module: actions

**Last updated**: 2026-04-19 · **Last feature**: documentation sync against source code

## Responsibility

Action definitions on card types, execution (`executeAction`), auto-action sequencing during operational scans, the override-on-error flow, and action logging.

Does not own scan triggering (see `scanning`) or validation rules (see `validations`).

## Key files

- `src/lib/dal/actions.ts` — `getActionsForCardType`, `getAutoExecuteActions`, `executeAction`, `logScanEntry`, CRUD.
- `src/lib/actions/cards.ts` — `executeScanWithAutoActionsAction`, `resumeAutoActionsAction`, `validateBeforeActionAction` (operational scan pipeline lives here, not in `actions.ts`).
- `src/lib/actions/actions.ts` — `executeActionAction` Server Action (manual single-action execution).
- `src/lib/db/schema/access-control.ts` — `action_definitions`, `action_logs` tables.
- `src/components/card-types/steps/ActionsStep.tsx` — Add/remove/configure action definitions in the wizard. The "Auto-ejecutar al escanear" toggle marks an action `is_auto_execute`.
- `src/components/cards/CardActions.tsx` — Execute buttons on card detail. Hides `is_auto_execute` actions (those run on scan, not manually). One action loading at a time (`loadingId` state).
- `src/components/dashboard/ActiveCardZone.tsx` — Displays operational scan result (active card + auto-action feedback + manual action buttons). Delegates execution to `DashboardView` via `onManualAction`.
- `src/components/dashboard/AutoActionFeedback.tsx` — Toast/feedback for auto-executed actions after an operational scan.
- `src/app/api/cards/[code]/actions/[actionDefinitionId]/execute/route.ts` — External execution endpoint.

## Data model (relevant subset)

### `action_definitions`

| Column                         | Notes                                                     |
| ------------------------------ | --------------------------------------------------------- |
| `id`                           | UUID PK                                                   |
| `card_type_id`                 | FK                                                        |
| `name`                         | Display name                                              |
| `action_type`                  | `increment | decrement | check | uncheck`                 |
| `target_field_definition_id`   | FK → `field_definitions`. Type compatibility enforced.    |
| `config`                       | jsonb — e.g. `{ amount }` for increment                   |
| `icon`, `color`                | UI                                                        |
| `position`                     | Order of buttons                                          |
| `is_active`                    | Soft delete                                               |

**Type compatibility:**

- `increment` / `decrement` → target must be a `number` field. Config: `{ amount: number }`.
- `check` / `uncheck` → target must be a `boolean` field.

### `action_logs`

Unified table for scans **and** actions. `log_type: 'scan' | 'action'`. `tenant_id` is denormalized for fast feed queries (must be kept in sync on card operations). Action rows carry metadata with `before_value`, `after_value`, `action_type`, `target_field`.

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

## Extension points

- **New action type** → extend `action_type` enum, add handler in `executeAction`, update `ActionsStep` config UI, enforce new field-type compatibility rule.
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

- 2026-04-19 — Initial extraction from technical handoff + memory context about auto-action sequencing and override flow.
- 2026-04-19 — Synchronized documentation against source code: added `logScanEntry`, `executeScanWithAutoActionsAction`, `resumeAutoActionsAction`; corrected operational scan flow with re-validation detail; clarified `is_auto_execute` flag behavior.

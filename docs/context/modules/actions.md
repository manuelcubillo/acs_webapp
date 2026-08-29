# Module: actions

**Last updated**: 2026-08-29 · **Last feature**: Invitation purchase mode — a per-card boolean that disables half-day slot accounting on that card

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
- `src/lib/action-strategies/invitation-strategy.ts` — The one live custom strategy (`scan_strategy = 'invitation'`). Half-day guest entry/exit accounting over two number fields, plus a per-card boolean that opts a card out of it (R4). Exported pure functions (`resolveLocalMoment`, `decideEntry`, `decideExit`, `countSettlements`, `toFlag`, …) with I/O at the edges; `INVITATION_CONFIG` at the top holds the five tenant UUIDs. ADRs `2026-08-27-invitation-accounting.md`, `2026-08-29-invitation-purchase-mode.md`.
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

Unified table for scans, actions, lifecycle transitions **and** manual card edits. `log_type: 'scan' | 'action' | 'lifecycle' | 'card_edit'`. `tenant_id` is denormalized for fast feed queries (must be kept in sync on card operations).

Two columns carry the frozen card state (migration 0022):

| Column | Notes |
| ------ | ----- |
| `card_snapshot_id` | The `card_snapshots` row holding the card's field state as this row observed it. `SET NULL`, never `CASCADE` — an audit row must not be destroyed by a snapshot disappearing. **NULL means "written before 2026-08-28"**; there is no backfill, exactly like `metadata.scanLogId`. |
| `snapshot_created` | Whether THIS row's write produced that snapshot, i.e. whether it changed anything. Stored, not derived: the derivation is a window function over the largest table in the schema and is wrong whenever two rows share a timestamp — which the scan path produces routinely. |

`card_edit` rows are written by `updateCard` (see `modules/cards.md`), carry a null `action_definition_id`, and are excluded from the feed permanently and from `/history` until the A2 read-path change.

**The `metadata` contract.** Untyped jsonb with several producers. Keys read by more than one layer are declared in `src/lib/dal/metadata-keys.ts` — never spell one inline, a typo fails silently as a row that never matches.

| Producer | Keys |
| --- | --- |
| `executeAction` | `action_type`, `target_field`, `before_value`, `after_value` |
| …override branch | `operator_override`, `override_validation_errors` |
| …`metadataExtra` (caller) | currently `scanLogId` |
| …strategy result | whatever a `TenantActionStrategy` returns — currently `invitationSettlement`, `invitationSlot`, `invitationDate`, `invitationMode` |
| `logScanEntry` ← scan pipeline | `method: "operational_scan"`, `cardCode` |
| lifecycle CTEs | `from`, `to`, `transition`, `cascaded_from_card_type_id` |
| presence bulk close (CTE) | `action_type`, `target_field`, `before_value`, `after_value` — hand-written to match `executeAction` |

⚠️ **`executeAction` is no longer the only producer of presence `action_logs` rows.** The bulk
close (`closeAllPresence`, `src/lib/server/presence/close.ts`) writes exit rows itself, from
inside one CTE, reproducing the four `executeAction` metadata keys column for column — that is
what keeps `isPresenceRowSql` and `presenceDirectionLabel` working on them. Any change to the
shape written here must be mirrored there. See `modules/presence.md` → "Emptying the facility".

⚠️ Two naming conventions coexist: `executeAction` writes **snake_case**, the scan pipeline **camelCase**. Pre-existing; `scanLogId` follows the scan side. Nothing normalises existing rows.

**`metadataExtra`** is how a caller annotates a log row without `executeAction` learning anything caller-specific — it stays a pure read → compute → write → log primitive (ADR `2026-07-09`). Merged **before** the override flags, so a caller can annotate but never rewrite `operator_override`. The scan pipeline is its only current user.

**`invitationSettlement`** (`full_spent | purchase_spent | half_spent | half_refunded | none`) is the first **strategy-owned** metadata key: written by `InvitationActionStrategy` on every guest entry/exit and read back by it to cap refunds. It is the settlement record of record — for that tenant `before_value` / `after_value` are NOT sufficient, because three of the five settlements leave the target field unchanged. `purchase_spent` and `full_spent` differ *only* in refundability: R2 counts the latter, never the former, which is what keeps an R4 entry unrefundable even after the flag is cleared. `invitationMode` (`purchase | slot`) rides alongside as a diagnostic — an R4 exit settles as `none`, otherwise indistinguishable in the log from a slot exit that hit its cap. Neither is declared in `metadata-keys.ts`: only the strategy reads them. ADRs `2026-08-27-invitation-accounting.md`, `2026-08-29-invitation-purchase-mode.md`.

**`scanLogId`** correlates an auto-action with the scan that caused it. Present on every action a scan executes, **including a resumed override run** (the id round-trips through the client — see `modules/cards.md`). Absent on manual actions, and that absence is the definition. Absent on every row written before 2026-08-25; there is no backfill, so historical rows never group. ADR `2026-08-25-feed-grouping-and-scan-correlation.md`.

## Main flows

### `executeAction` (single action, user-triggered)

1. Read current `field_value` for the target field.
2. Resolve the tenant's strategy (`tenants.scan_strategy`) and delegate the value computation to it. `standard` → `computeNewValue(action_type, current, config.amount)`. A custom strategy may also write auxiliary fields and return extra log metadata.
3. Write new value.
4. `captureCardSnapshot` — freeze the POST-action card state, read **fresh from the database**.
5. Insert row in `action_logs` with `log_type='action'`, before/after metadata, `executed_at`, `executed_by`, `card_snapshot_id` and `snapshot_created`.

⚠️ **The inserted row is returned in full** (`ActionExecutionResult.log` is an `ActionLog`), so `log.id`, `log.cardSnapshotId` and `log.snapshotCreated` have always crossed to the client — a caller needing a per-action log id does not need a contract change. What A2 added at the Server Action boundary is the payload itself: `executeActionAction` returns `ActionExecutionResultWithSnapshots`, i.e. the result plus `snapshots` (snapshotId → payload, photo object keys stripped by `loadClientSnapshots`). Resolved at the boundary, not in the DAL, so the sanitisation sits next to the wire crossing.

⚠️ **Step 4 is a fresh read, not a patch of the pre-action payload.** With no interactive transactions, patching would assert a state nobody verified — and it would silently omit a custom strategy's auxiliary `setFieldValue` writes, which happen in step 2, outside the main upsert. Snapshotting lives here precisely because it is generic: it knows nothing about action types or callers, like the rest of this primitive (ADR `2026-07-09`). `metadata.before_value` / `after_value` are untouched and remain the only detail for pre-2026-08-28 rows.

**Atomicity note:** Neon HTTP driver does not support interactive transactions. The sequence is read → write → log using separate DB calls. A crash between steps could leave partial state. A custom strategy's auxiliary `setFieldValue` writes are equally unwrapped **and unlogged**. This is a known limitation tracked for migration to a transaction-capable driver. The `executeAction` docblock claimed a surrounding transaction until 2026-08-27; there has never been one.

### Invitation accounting — `scan_strategy = 'invitation'`

The only live custom strategy. `GUEST_ENTRY` spends a `HALF_INVITATION` credit if one exists (not refundable), otherwise an `INVITATIONS` unit (refundable). `GUEST_EXIT` returns one half-credit while `refunded < spent` within the same local day **and** half-day slot (`MORNING` < 15:00 ≤ `AFTERNOON`, `Europe/Madrid`), which caps refunds at one per full invitation consumed. Both counts come from `invitationSettlement` markers on prior `log_type='action'` rows — there is no entry↔exit pairing key.

**R4 · purchase mode** opts a single card out of all of the above. When its `compra_invitaciones` boolean (`df83af19-…`, the fifth `INVITATION_CONFIG` id) reads `true`, `GUEST_ENTRY` keeps R1's half-credit-first preference but marks a full-invitation entry `purchase_spent` instead of `full_spent`, and `GUEST_EXIT` returns **before reading any history** and refunds nothing. So the entry arithmetic is unchanged and the whole delta is on exit. The distinct marker is not cosmetic: R2 counts only `full_spent`, so an R4 entry stays unrefundable even if someone clears the flag later the same day — gating on the flag alone would over-refund there. Numbered R4 because R3 already names the pending insufficient-balance gate. ADR `2026-08-29-invitation-purchase-mode.md`.

Four things a reader trips over: both actions **target** `invitations` but three of the five settlements do not **change** it (they move `HALF_INVITATION` via `setFieldValue`, or nothing); matching is by UUID only, so the strategy is inert until `INVITATION_CONFIG` is correct — and R4 is inert three times over, since `toFlag` accepts only boolean `true`, `readField` returns null for both an unset field and an unresolvable id, and `decideEntry`'s flag defaults to `false`; a repointed target falls through to standard behaviour with a `console.warn` rather than throwing — a misconfiguration must not leave someone stuck at the door; and `decideExit`'s second parameter is `SlotCounters | null`, where `null` means R4, not zeroed counters. Until R3 lands, an entry at zero balance drives `INVITATIONS` negative in **both** models. ADR `2026-08-27-invitation-accounting.md`.

### Operational scan — `executeScanWithAutoActionsAction(code)`

Full sequence (implemented in `src/lib/actions/cards.ts`, primary home in this module):

1. Fetch card by code. Run initial scan validations (`validateScan`).
2. Log the scan entry (`logScanEntry` → `log_type='scan'`). `logScanEntry` captures the card snapshot itself, so the row records the state the operator's scan **observed** — this is why it must stay before the auto-action loop, and why the capture is inside the function rather than at the call site.
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
- **New per-tenant behaviour** → a strategy file in `src/lib/action-strategies/`, an entry in `resolve-strategy.ts`, a key in `ScanStrategyKey`, and the tenant's `scan_strategy` value. A strategy may own metadata keys (see `invitationSettlement`); keep the decision logic in exported pure functions with the DB reads at the edges so it is testable without a database.

## Module interactions

- Reads from: `fields` (target field values + definitions).
- Writes to: `field_values` (via execution), `action_logs`.
- Triggered by: `dashboard` (operational scan via `DashboardSearchBar` / `DashboardView`), `cards` (manual execution on detail page), external API. Note: `scanning` describes the input surface but delegates to `dashboard` for the operational pipeline.
- Feeds: `dashboard` (activity feed).

## Open TODOs

- [ ] Atomicity — revisit when/if a transaction-capable driver replaces Neon HTTP, or add a compensating-write strategy.
- [ ] **R3 — insufficient-balance validation for the invitation tenant.** Scan-time `warning` + a real block at `GUEST_ENTRY` riding `allow_override_on_error`, `GUEST_EXIT` never gated. Must gate purchase-mode (R4) cards too — neither model has a floor. Not implementable inside the strategy: the seam sits below where scan results are assembled, and `ActionStrategyContext` carries neither `operatorOverride` nor `allowOverrideOnError`. The gate belongs inside `executeAction`, not per-caller (the external route bypasses caller-level gates). Must **not** use `scan_validations` — that model is a conjunction, the real condition is a sum. See ADR `2026-08-27-invitation-accounting.md`.
- [ ] **Invitation audit trail is incomplete** — `half_spent` / `half_refunded` / `none` log `before_value === after_value`; the real mutation is an unlogged `setFieldValue`. See the same TODO in `history` / `dashboard`.
- [ ] **Possible unlogged writes on the invitation tenant** — the pre-2026-08-27 stub was live code (a name-matched `accesos` branch with a floating `.then()`), not the safe no-op ADR `2026-07-09` claimed.

## Future considerations

- Plugin/handler registry for `executeAction` extensibility (no code tag; design not started).

## Recent changes

- 2026-08-29 — **Invitation purchase mode (R4).** A per-card boolean, `compra_invitaciones`, opts a card out of half-day slot accounting: `GUEST_ENTRY` still spends an owned half-credit first but marks a full-invitation entry `purchase_spent`, and `GUEST_EXIT` refunds nothing and never reads the history. The entry arithmetic is unchanged — the whole delta is on exit. The new marker exists so R2's refundable count excludes those entries permanently, surviving a flag cleared mid-day; `decideExit` took `SlotCounters | null` rather than fabricated zero counters. New `invitationMode` diagnostic key. No schema change, no migration, no context change; one production file. 33 → 49 unit tests. ADR `2026-08-29-invitation-purchase-mode.md`.
- 2026-08-28 — **Log ids and snapshot payloads in the return values (A2).** `executeActionAction` now returns `ActionExecutionResultWithSnapshots` — the same result plus `snapshots` — and `ScanWithAutoActionsResult` gained `scanSnapshotId` + `snapshots`. Per-action log ids needed nothing: `ActionExecutionResult.log` was already the full inserted row. This exists so the client feed builder projects the SAME frozen state the server will serve on the next Refrescar; without it a scan row built from the post-auto-action card would show 9 where the server shows 10. Payloads are sanitised at the boundary (photo object keys never cross). Nothing in `executeAction` or `logScanEntry` changed. ADR `2026-08-28-card-snapshots-read-path.md`.
- 2026-08-28 — **Card snapshots reach the log writers.** `executeAction` gained a step between the value write and the log insert: `captureCardSnapshot` freezes the post-action state (fresh read, never a patch of the pre-action payload), and the row is stamped with `card_snapshot_id` + `snapshot_created`. `logScanEntry` does the same, capturing INSIDE the function so "every scan row carries a snapshot" is a property rather than a convention a caller can forget — and before auto-actions run, so the row reports what the scan observed. `log_type` gained `card_edit`, written by `updateCard` and `updateCardCode`, not by anything here. No metadata keys changed. ADR `2026-08-28-card-snapshots-write-path.md`.
- 2026-08-27 — `InvitationActionStrategy` implemented; it had shipped as a stub. Half-day guest accounting: `GUEST_ENTRY` spends a half-credit then a full invitation, `GUEST_EXIT` refunds one half-credit per full invitation consumed in the same `Europe/Madrid` day + slot. No schema change and no context change — the settlement is recorded as an `invitationSettlement` marker in `action_logs.metadata`, a channel `executeAction` already merged, and read back through `getCardActionHistory`. Matching is by UUID only (names are tenant-editable); a repointed target degrades to standard behaviour with a warning rather than throwing. 33 unit tests. Two doc corrections fell out: the `executeAction` docblock claimed a transaction that never existed, and ADR `2026-07-09` described the stub as a safe no-op when it contained a live unlogged write (correction note appended there). ADR `2026-08-27-invitation-accounting.md`.
- 2026-08-25 — `ExecuteActionInput` gained `metadataExtra?: Record<string, unknown>`, merged into the log row's metadata before the override flags. It exists so the scan pipeline can stamp `scanLogId` without `executeAction` knowing what a scan is; a caller can annotate but not overwrite `operator_override`. Well-known metadata keys and their readers now live in `src/lib/dal/metadata-keys.ts`. ADR `2026-08-25-feed-grouping-and-scan-correlation.md`.
_Pruned to the 5-entry cap: the initial 2026-04-19 extraction note is dropped, the phase-2 lifecycle gate (2026-07-17) is described in `2026-07-17-card-lifecycle-scan-behaviour.md`, and the 2026-08-24 `toggle` / `is_operator_visible` entry in `2026-08-24-presence-control.md`._

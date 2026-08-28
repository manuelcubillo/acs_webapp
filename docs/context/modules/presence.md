# Module: presence

**Last updated**: 2026-08-27 · **Last feature**: manual bulk close ("Vaciar recinto") — one CTE marks everyone out and logs one exit per occupant

## Responsibility

Answering *"who is inside the facility right now?"* — the `/presence` page
("Recinto"), the state it reads, and the server-side provisioning that creates
that state when a master ticks one checkbox.

Does **not** own action execution (see `actions`), the wizard (see `card-types`),
or field storage (see `fields`). It designates one existing field and rides the
existing action pipeline.

⚠️ Presence is **state, not events**. `action_logs` cannot answer the question:
a scan row carries no direction, because the deployment has one attended reader
per access point and no reader identity anywhere in the model. Direction comes
from toggle semantics — each operational scan flips a boolean on the card. See
ADR `2026-08-24-presence-control.md`.

## Key files

- `src/app/(dashboard)/presence/page.tsx` — Route (OPERATOR+). Guards on `tenantHasPresenceEnabled` itself; the sidebar hiding the link is not the gate.
- `src/app/(dashboard)/presence/PresenceClient.tsx` — Occupancy view: total, per-card-type groups, client-side search, per-row exit switch, Refrescar + "Actualizado HH:MM", and the "Vaciar recinto" button (neutral `secondary`, confirmed with the shared `ConfirmDialog`, disabled at zero occupants).
- `src/lib/dal/presence.ts` — `getPresenceOccupants(tenantId)`, `tenantHasPresenceEnabled(tenantId)`.
- `src/lib/actions/presence.ts` — `getPresenceOccupantsAction` + `closePresenceAction` (both OPERATOR+). Single-card flipping goes through `executeActionAction`; the bulk close does not.
- `src/lib/server/presence/close.ts` — `closeAllPresence({ tenantId, executedBy })`. One data-modifying CTE: flips every `value_boolean = true` to false and logs one exit per row the UPDATE actually returned. The ONLY presence code that writes `field_values` directly.
- `src/lib/server/presence/provisioning.ts` — `enablePresenceControl` / `disablePresenceControl`. One data-modifying CTE each, idempotent in both directions.
- `src/lib/server/presence/constants.ts` — `PRESENCE_FIELD_NAME` (`__presence`), `PRESENCE_FIELD_LABEL` (`Dentro`), `PRESENCE_ACTION_NAME` (`Presencia`). Matched on by provisioning, so they are persisted data, not labels.
- `src/lib/fields/system.ts` — `excludeSystemFields` / `excludeSystemActions`. Not presence-specific; see constraint #27.
- `src/lib/fields/toggle-state.ts` — `buildToggleStates(actions, fields)`: `actionId → current boolean`, so a toggle control can show the value it would flip.
- `src/lib/presence/labels.ts` — `presenceDirectionLabel(afterValue)` + `PRESENCE_FILTER_LABEL`. The ONLY derivation of "Entrada" / "Salida"; four surfaces consume it. Dependency-free.
- `src/components/presence/PresenceControl.tsx` — Two-segment button group replacing the phase-1 `Switch`, in `default` and `compact` sizes.
- `src/lib/dal/presence.ts` → `isPresenceRowSql` — the shared SQL predicate flagging a log row as presence; `getPresenceActionIdsByCardType(tenantId)` — `cardTypeId → presence action id`, shipped to the dashboard client.
- `src/lib/db/constants.ts` — `SYSTEM_USER_ID` / `SYSTEM_USER_NAME` (`Sistema`). Seeded by migration 0021, referenced by nothing yet — the manual close is attributed to the operator, so the scheduled auto-close is still its first consumer.
- `src/components/layout/PresenceNavContext.tsx` — Publishes "this tenant uses presence" from `(dashboard)/layout.tsx` to `DashboardShell`, whose `NAV_ITEMS` is a static list in a client component mounted independently by 17 pages.
- `src/components/card-types/steps/BasicInfoStep.tsx` — The **entire** user-facing surface: one "Control de presencia" checkbox.
- `src/lib/actions/card-types.ts` — `setPresenceControlAction(cardTypeId, enabled)` (MASTER).

## Data model (relevant subset)

- `card_types.presence_field_definition_id` — nullable FK → `field_definitions(id)`, `ON DELETE SET NULL`. **The designation IS the state**: NULL means this card type does not participate. `SET NULL` so the purge cascade cannot be blocked by it. Deliberately circular with `field_definitions.card_type_id`; rows are created in order within one statement.
- `field_definitions.is_system`, `action_definitions.is_system` — server-provisioned, never user-editable. General mechanism (constraint #27).
- `action_definitions.is_operator_visible` — whether the action renders as a control. **Independent of `is_auto_execute`**, which now means only "runs on operational scan". Backfilled to `NOT is_auto_execute` in migration 0021.
- `field_values.updated_at` — trigger-maintained (`field_values_touch`, migration 0021). Supplies `inside_since` without touching `action_logs`.
- `field_values_presence_idx` — partial index on `field_definition_id WHERE value_boolean = true`. Carries only the rows of people currently inside, which is exactly the presence query's working set.
- `action_type` gained `toggle` (migration 0020, alone in its file).

The presence field itself is an ordinary `boolean` field definition
(`name = '__presence'`, `label = 'Dentro'`, `is_required = false`,
`is_system = true`). The `__` prefix is collision avoidance only — `is_system` is
the mechanism.

## Main flows

### Enabling (master, from the wizard)

1. `BasicInfoStep` checkbox sets `basicInfo.presenceEnabled`.
2. The wizard's submit pipeline calls `setPresenceControlAction(cardTypeId, desired)` **last** and **unconditionally** — provisioning is idempotent in both directions, so it needs no knowledge of which transition it is.
3. `enablePresenceControl` runs one CTE: find-or-reactivate-or-create the `__presence` field (positioned last), find-or-reactivate-or-create the `Presencia` toggle action (`is_auto_execute` + `is_operator_visible` + `is_system`), then set the designation.
4. Edit mode seeds the checkbox from `cardType.presenceFieldDefinitionId !== null`.

### Disabling

`disablePresenceControl` clears the designation and sets `is_active = false` on
both system rows — in one CTE. **`field_values` are NOT deleted**: hard-deleting
a field definition is forbidden (constraint #6) and the values are
audit-relevant. They become unreachable because `getPresenceOccupants` joins
through the now-null designation. Re-enabling reuses the same rows (same UUIDs),
so the card comes back inside exactly as it was.

### A scan flips presence

No new code path. The toggle is an `is_auto_execute` action, so
`executeScanWithAutoActionsAction` picks it up via `getAutoExecuteActions`
(which is deliberately **not** system-filtered) and runs it through
`executeAction` like any other. `computeNewValue("toggle", …)` returns
`!(current ?? false)` — **NULL counts as false, so the first toggle yields
true**, which matters because a card has no `field_values` row for a field it was
never given a value for, and the presence field is excluded from the card form.

The result is an ordinary `log_type='action'` row with
`before_value` / `after_value`, so the activity feed, `/history` and CSV export
all render it with no changes. `feed-entries.ts` is action-type agnostic —
verified, not assumed.

### Manual correction

The presence action renders as **`PresenceControl`** — two segments, "Entrada"
and "Salida" — on all three surfaces: `ActiveCardZone` (under the state label),
`CardActions` (card detail), and `/presence` (`compact`, one per row). It
executes through the existing `executeActionAction` path, disables while
pending, and does **not** update optimistically.

⚠️ **The renderer branches on `isPresence` / the presence action id, NEVER on
`action_type === "toggle"`.** A tenant's own boolean toggle — "Ha desayunado",
"Material devuelto" — keeps rendering as a plain `Switch` with its own name.
Labelling an arbitrary boolean "Entrada / Salida" would be nonsense.

**Salida active is neutral (`--state-info`), deliberately not red.** The control
sits beneath the green "Acceso correcto" banner, and the denial banner on that
same surface is red — a red pill there reads as a failed access, and
`--state-denied` is reserved for outcomes (constraint #18). The active segment
is inert but keeps `aria-pressed` and stays focusable rather than being
`disabled`, so keyboard traversal is not broken.

`ActiveCardZone`'s `ResultPanel` had to be restructured for this: it was a
single `<Link>` wrapping the whole panel, and a button inside an anchor is
invalid HTML whose clicks would navigate. The state surface is now a `<div>`
with the `<Link>` covering only the navigable region.

A **successful** presence toggle is hidden from `AutoActionFeedback` — it is
already represented by its own control. A **failed** one stays visible: per
constraint #11 a failure stops the remaining sequence and may open the override
modal, so hiding the cause would leave the operator staring at an unexplained
interruption.

In the feed a manual toggle reads **exactly like the automatic one** — the same
"Entrada" / "Salida" badge. It is the same fact; only the trigger differs. The
row carries no `scanLogId`, so it renders standalone or as part of a "×N" run
rather than inside a scan group, but `ActivityFeed.badgeLabel` resolves its label
through `presenceDirectionLabel` all the same. Two rows of opposite direction
never merge into a "×N" (`repeatKey` includes the direction), which in practice
means presence rows never merge at all: `PresenceControl`'s active segment does
not fire, so consecutive toggles always alternate.

⚠️ The card detail page is an *informational* surface (ADR
`2026-03-20-operational-vs-informational.md`), yet its switch **does** mutate
presence. Deliberate exception: it is how a concierge corrects a wrong state. The
page still logs no scan and still fires no auto-actions.

### Emptying the facility

"Vaciar recinto" (`/presence` header, OPERATOR+) marks **every** card currently
flagged as inside as out, in one shot. `closePresenceAction` guards, reads the
tenant from the session and delegates to `closeAllPresence`, which is **one
data-modifying CTE**: resolve the participating card types → collect every
`value_boolean = true` row → `UPDATE … RETURNING` → `INSERT INTO action_logs`
driven by that `RETURNING`. One statement, one implicit transaction, so the whole
close is atomic on a driver with no interactive transactions. ADR
`2026-08-27-presence-bulk-close.md`.

Three things it does deliberately differently from everything around it:

- **It writes `field_values` directly** — the single exception to "presence never
  writes `field_values` directly" (see `Module interactions`).
- **No `status` filter, unlike the read path.** `getPresenceOccupants` filters to
  `status = 'active'`, but a card that expired or was archived while inside keeps
  `value_boolean = true` invisibly and would come back flagged as inside on
  reactivation. The close reaches those ghosts; the designation is its only
  filter.
- **Never through a NULL designation.** A card type with presence disabled keeps
  its stored values on purpose (see *Disabling*), so the close cannot touch them.

The log rows are byte-compatible with what `executeAction` writes for a toggle —
`log_type='action'`, the card type's presence `action_definition_id`, metadata
`{ action_type, target_field, before_value: true, after_value: false }`. That is
load-bearing and silent if broken: it is what makes `isPresenceRowSql` classify
them and `presenceDirectionLabel` render them as **"Salida"** in the feed,
`/history`, the CSV export and the history filter.

`executedBy` is the **operator**, not `SYSTEM_USER_ID` — the concierge closing up
is a manual act. The sentinel belongs to the scheduled auto-close.

Idempotent: a second run finds nothing, writes nothing, returns `{ closed: 0 }`.
The UI confirms through the shared light `ConfirmDialog` (not the typed-phrase
one — a wrong close is corrected by registering an entry again), styles the
button **neutrally, never red** (constraint #18: on an access-control surface red
means denied access), and on success re-reads through the same path Refrescar
uses rather than patching the list locally.

### Reading the recinto

`getPresenceOccupants(tenantId)` joins `cards → card_types → field_values`
through `presence_field_definition_id`, filtered to `status = 'active'` and
`value_boolean = true`, then enriches with the tenant's configured summary fields
(reusing `getFeedSummaryFieldConfig`) and a photo presence flag. Photos are
addressed by the **stable route** `/api/photos/cards/[code]` — this page stays
open, so an embedded signed URL would expire in place.

Lifecycle falls out for free: `status = 'active'` excludes inactive, expired and
archived cards, and archiving a card TYPE cascades its live cards to archived, so
it empties that group too. Both are covered by
`src/lib/dal/__tests__/presence.integration.test.ts`.

**No polling.** Refrescar + "Actualizado HH:MM", per ADR
`2026-07-17-dashboard-feed-no-polling.md`. Search is client-side; the list is
bounded by the domain, so there is no server-side pagination.

## Extension points

- **Another feature needing server-owned rows** → set `is_system = true` and filter at each consumer with `excludeSystemFields` / `excludeSystemActions`. Do not add the filter to a DAL read (constraint #27).
- **A new configuration surface listing fields or actions** → it MUST apply the exclusion helper. This is the known sharp edge: forgetting it leaks the presence field into a picker, and nothing fails loudly.
- **Multiple simultaneous areas per card** → this is the condition that invalidates the whole design. One boolean per card type cannot express "inside the pool AND inside the gym"; that needs a real `presence_state` table keyed by (card, area). See the ADR.
- **Scheduled auto-close** → the follow-up task. It writes with `SYSTEM_USER_ID` and needs `tenants.timezone` + a closing-time setting, neither of which exists yet.

## Module interactions

- Reads from: `cards` (status), `card-types` (the designation), `fields` (`field_values`, `updated_at`), `dashboard` (`getFeedSummaryFieldConfig` for the summary strip).
- Writes through: `actions` (`executeAction`) for every single-card flip — scan-driven or manual.
  ⚠️ **One deliberate exception**: the bulk close (`closeAllPresence`) writes `field_values` and
  `action_logs` itself. Per-row execution is not atomic above one card and ~5 round trips × N
  occupants does not fit the function timeout budget, so the close is one CTE that reproduces
  `executeAction`'s log shape by hand. ADR `2026-08-27-presence-bulk-close.md`.
- Feeds: `dashboard` (a toggle appears in the activity feed like any action), `history` (same rows, same filters).
- Provisioned by: `card-types` (the wizard checkbox → `setPresenceControlAction`).

## Open TODOs

- [ ] Presence drifts when a passage happens without a scan (tailgating, doors held open). The mitigation is the scheduled auto-close in the follow-up task, not something this phase solves.
- [ ] A bulk close emits one **ungrouped** feed entry per occupant. With
      `feedRawBudget(n) = min(n*3, 100)` and the display limit counting groups, a close
      of 30 clears everything else off the dashboard feed. Correlating them under a
      `bulkCloseId` (the mechanism `metadata.scanLogId` already uses) is the fix if it
      becomes a problem; deliberately not built.
- [ ] `getPresenceOccupants` orders by `inside_since` ascending (longest inside first) and the page renders that order within each card-type group. No control exposes a different sort; add one only if operators ask.

## Recent changes

- 2026-08-27 — Manual bulk close ("Vaciar recinto"). New `closeAllPresence` (`src/lib/server/presence/close.ts`): one data-modifying CTE marks every card flagged inside as out and writes one exit `action_logs` row per row the UPDATE returned, reproducing `executeAction`'s metadata shape so `isPresenceRowSql` and `presenceDirectionLabel` classify them without changes anywhere downstream. It reaches **ghosts** (inactive/expired/archived cards still flagged inside, which the read path hides) and never reaches through a NULL designation. New `closePresenceAction` (OPERATOR+, attributed to the operator, not the sentinel) and a neutral "Vaciar recinto" button on `/presence` behind the shared `ConfirmDialog`. This is the first and only place presence writes `field_values` directly. ADR `2026-08-27-presence-bulk-close.md`.
- 2026-08-25 — Fixed: the direction label stopped at the scan group. A manual Entrada/Salida — the concierge's correction — showed the system action's name ("Presencia") in the feed, because `presenceDirectionLabel` was only reached via the badges a scan absorbs. `ActivityFeed` now resolves the label for standalone action rows too; `ActivityFeedEntryRow` takes it as `actionLabel` and stays presence-agnostic. Also: `executeAndRefresh` hands its synthetic `AutoActionResult` the execution result, so the locally-appended row knows `newValue` and reads the direction before any Refrescar; and `repeatKey` gained the direction, so an entry and an exit inside the 10s window are no longer collapsed under the newer one's label. Dashboard-side fix — no change to `labels.ts`, the DAL predicate or provisioning.
- 2026-08-25 — Presence became legible to the operator. `PresenceControl` (two named segments) replaces the phase-1 `Switch` on all three surfaces; a successful presence toggle is dropped from the auto-action summary while a failed one stays. Rows read as **Entrada / Salida** in the feed badge, the history table, the CSV export and the filter dropdown — all four through the single `presenceDirectionLabel`, with `isPresence` derived in SQL at read time (`isPresenceRowSql`). The history scan toggle now defaults off for presence tenants. ADR `2026-08-25-feed-grouping-and-scan-correlation.md`.
- 2026-08-24 — Presence control, phase 1 (manual, end to end). New `toggle` action type (general-purpose, any boolean field), `is_system` on field/action definitions with consumer-side exclusion, `is_operator_visible` split out of `is_auto_execute` (backfilled to preserve behaviour byte-for-byte), `card_types.presence_field_definition_id`, a trigger on `field_values.updated_at`, a partial presence index, and the seeded `SYSTEM_USER_ID` sentinel. Toggles render as switches on both operator surfaces. Migrations `0020_action_type_toggle` + `0021_presence_control`. ADR `2026-08-24-presence-control.md`.

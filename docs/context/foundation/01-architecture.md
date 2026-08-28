# 01 · Architecture

**Last updated**: 2026-08-28 · **Last sync**: the snapshot READ path — `/history` and the feed render frozen state, `card_edit` and `lifecycle` rows are surfaced in `/history`; before that the new `card_snapshots` table + the pointer columns on `cards` / `action_logs`, and `log_type` gained `card_edit` (migration 0022); previously `action_logs.metadata` gained a documented correlation contract (`scanLogId`), and before that presence control — `action_type` gained `toggle`, `field_definitions`/`action_definitions` gained `is_system`, `action_definitions` gained `is_operator_visible`, `card_types` gained `presence_field_definition_id`, and `field_values.updated_at` became trigger-maintained (migrations 0020–0021)

## 1. Data model — hybrid SQL + dynamic fields

Fixed columns for system fields (`id`, `tenant_id`, `status`, timestamps) plus dynamic fields via the **FieldDefinition / FieldValue** pattern (EAV variant with type-specific columns).

### Tables

| Table                         | Purpose                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `tenants`                     | Organizations. Holds `scan_mode`, `archive_retention_days` (default 30, master-editable). (`allow_override_on_error` lives in `dashboard_settings`.) |
| `tenant_members`              | User ↔ tenant join, carries `role` and `is_active`. `removed_at` = soft-remove (hidden from all default queries). |
| `member_invitations`          | Pending email invitations. `token` unique; `expires_at` = 7 days. Status: pending / accepted / revoked / expired. |
| `card_types`                  | Badge templates per tenant. Name, description, `status` (`lifecycle_status`) + trash metadata, `presence_field_definition_id` (nullable FK → `field_definitions`, `SET NULL`) designating the presence boolean. |
| `field_definitions`           | Fields attached to a card type. `field_type`, `is_required`, `position`, `validation_rules` jsonb, `is_system`. |
| `cards`                       | Card instances. `code` is client-facing, unique per `(tenant_id, code)`. `status` (`lifecycle_status`) + trash metadata incl. `archived_via_type_id`. `current_snapshot_id` names the frozen state in force (nullable, `SET NULL`). |
| `field_values`                | Values per card. Type-specific columns: `value_text`, `_number`, `_boolean`, `_date`, `_json`. `updated_at` is maintained by the `field_values_touch` **trigger**, not by application code. |
| `card_snapshots`              | **Immutable** frozen copy of one card's complete field state, deduplicated by `content_hash`. `payload` jsonb, `previous_snapshot_id` chains them per card. `card_id` `NOT NULL` + `CASCADE` — purging a card takes its snapshots. See §9c. |
| `action_definitions`          | Actions declared per card type. `action_type`, `target_field_definition_id`, `config` jsonb, `is_auto_execute`, `is_operator_visible`, `is_system`. |
| `action_logs`                 | Unified log of scans, actions, card lifecycle transitions **and** manual card edits. `log_type: 'scan' \| 'action' \| 'lifecycle' \| 'card_edit'`. `tenant_id` denormalized. `card_snapshot_id` (`SET NULL`) + `snapshot_created` say which frozen state the row observed and whether it produced it. |
| `scan_validations`            | Rules evaluated at scan time. Per-field, with severity (`error` \| `warning`).                      |
| `dashboard_settings`          | Per-tenant dashboard configuration: feed limits, entry visibility, `allow_override_on_error`.       |
| `card_type_summary_fields`    | Per card type: which fields surface in the **activity feed** row. Photo fields excluded at read time. |
| `card_type_active_zone_fields`| Per card type: the **`ActiveCardZone` panel** 3×3 grid — `position` 0–8 + `row_span` 1\|2 (photo only). Deliberately separate from the feed's config. ADR `2026-08-04-active-card-summary-grid.md`. |
| `card_designs`                | Visual layout templates per tenant. `kind` (`card \| passbook`), dimensions + `unit`, `layout` jsonb (`CardDesignLayout` V1). Soft delete via `is_active`. |
| `card_type_designs`           | Links a card type to a design, one per kind (`UNIQUE(card_type_id, kind)`). **Hard-deleted on unlink** — the only join table without soft delete. |
| `departure_feedback`          | Anonymous deletion feedback. `name`, `email`, `tenant_name` captured before deletion; `reason`/`comment` updated post-redirect via `?fid` token. No FK constraints. |
| Better Auth tables            | `user`, `session`, `account`, `verification`.                                                       |

### Key enums

- `field_type`: `text | number | boolean | date | photo | select`
- `action_type`: `increment | decrement | check | uncheck | toggle` — `toggle` targets a `boolean` field and computes `!(current ?? false)`, so a card with no value row reads as off and its first toggle turns it on.
- `lifecycle_status`: `active | inactive | archived | expired` — shared by `cards` and `card_types`. Replaced `card_status` and `card_types.is_active` (migration 0017).
- `tenant_role`: `operator | admin | master`
- `scan_mode`: `camera | external_reader | both`
- `log_type`: `scan | action | lifecycle | card_edit`
  - `lifecycle` — audit-only, filtered out of the feed and of tenant action strategies. ⚠️ **Not** filtered out of `/history` today, despite what `filter-params.ts` claims — see `modules/history.md` → Open TODOs.
  - `card_edit` — an administrator saved the card edit form AND it changed a value. `action_definition_id` is null; the change is carried by `card_snapshot_id`, not by metadata. Excluded from the feed **permanently** and from `/history` **temporarily** (until the A2 read-path change).

## 1b. Card / CardType lifecycle

Both `cards` and `card_types` carry a `status` column of the shared `lifecycle_status` enum:

| Status     | Meaning                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| `active`   | Operational.                                                            |
| `inactive` | Switched off operationally. Kept forever, never in the trash.            |
| `archived` | In the trash. `archived_at` starts the countdown; the phase-5 purge job hard-deletes it after `tenants.archive_retention_days`. Excluded from management lists. |
| `expired`  | **Cards only** (`card_types` has a CHECK forbidding it). Reserved for a future automatic expiry mechanism — nothing sets it. Treated exactly like `inactive`. |

Transitions live in `src/lib/server/lifecycle/` and never happen via a plain DAL update. Each is a single data-modifying CTE (one statement = one implicit transaction — the Neon HTTP driver has no interactive transactions). Roles: cards → `requireAdmin`, card types → `requireMaster`.

Archiving a card type cascades to its live cards, tagging each with `archived_via_type_id` so restoring the type revives exactly those and leaves individually-archived cards in the trash. Restoring a card whose type is still archived is refused.

Exclusion from lists uses the opt-in `notArchived` scope (`src/lib/dal/scopes.ts`) — **never** applied to `getCardByCode`, which the scan path, card detail and external API share. See ADR `2026-07-17-card-lifecycle-archiving.md`.

## 2. Dual validation engines

Two separate engines, both pure TypeScript, both in `src/lib/validation/`:

1. **Form validation** — validates field inputs when creating/editing Cards. Interprets `validation_rules` jsonb from field definitions. Shared frontend ↔ backend.
2. **Scan validation** — evaluates Card state at scan time. Returns `ScanValidationResult { passed, results[] }` with per-rule severity. Informs but **never blocks** actions. Re-evaluated client-side after action execution.

## 3. Scanning — three modes, two entry paths

Modes configured by `master` in tenant settings:

- `camera` — `html5-qrcode`, QR + barcodes (Code128, Code39, EAN13).
- `external_reader` — USB/Bluetooth HID. Detection by keystroke timing (<50ms between chars → reader, >50ms → human typing).
- `both` — camera button visible **and** external reader detection active simultaneously.

There are **two distinct scan paths** (see section 4):

- **Operational** — `DashboardSearchBar` manual input or `useExternalScanner` in `DashboardView`. Calls `executeScanWithAutoActionsAction(code)` → result displayed in `ActiveCardZone`. Logs to `action_logs`, fires auto-actions.
- **Informational** — `/cards/scan` camera/reader page → `router.push(/cards/[code])`. Navigates to the card detail page, which is always informational (never logs, never fires auto-actions).

## 4. Operational scan vs informational consultation (hard separation)

This distinction is a **core invariant** and must be preserved in all new flows:

| Aspect                  | Operational scan                                     | Informational consultation            |
| ----------------------- | ---------------------------------------------------- | ------------------------------------- |
| Entry point             | Scan page / external reader                          | Direct card lookup, list navigation   |
| Logged to `action_logs` | Yes (`log_type='scan'`)                              | No                                    |
| Auto-actions triggered  | Yes                                                  | No                                    |
| Scan validations shown  | Yes                                                  | Yes (read-only)                       |
| Feed visibility         | Yes                                                  | No                                    |

Never blur these paths — they are distinct user intents.

## 5. Role system

Three roles enforced at every entry point:

- `operator` — scan, read, execute actions.
- `admin` — everything operator does + Card CRUD, member management.
- `master` — everything admin does + CardType definition, dashboard settings, tenant scan mode.

Guards: `requireOperator()`, `requireAdmin()`, `requireMaster()` (throw on failure). Role order: `operator=1 < admin=2 < master=3`.

At least one `master` per tenant always — enforced at DAL level.

## 6. API surface

- **Server Actions** — primary pattern for all frontend-facing operations. Wrapped by `actionHandler<T>` which converts DAL errors to `{ success, data?, error?, code?, fieldErrors? }`.
- **API Routes, header-authed** — external device access (physical readers, terminals). Tenant comes from the `x-tenant-id` header:
  - `GET /api/cards/[code]` — external systems (**TODO: API_AUTH**).
  - `POST /api/cards/[code]/actions/[actionDefinitionId]/execute` — physical readers.
- **API Routes, session-authed** — the browser, only where a Server Action cannot serve (an `<img>`/`<a>` needs a real URL). Tenant comes from the session, exactly as on a page:
  - `GET /api/photos/cards/[code]` — card photo; 302 → signed storage URL minted per request. ADR `2026-07-17-stable-photo-routes.md`.

The two trees are kept separate on purpose: one route tree, one auth model.

Auth is page-level via guards, not middleware (`src/middleware.ts` does not exist).

## 7. Action execution

`executeAction` is sequential: read current value → compute new value → write → log with before/after. Neon HTTP driver does not support interactive transactions, so this is **not** a true atomic transaction. Known risk documented in `modules/actions.md`.

Whether an action **runs on scan** (`is_auto_execute`) and whether it **renders as
an operator control** (`is_operator_visible`) are independent columns as of
2026-08-24. They used to be the same flag's job (the surfaces tested
`!is_auto_execute`); presence needs an action that does both. Migration 0021
backfilled `is_operator_visible = NOT is_auto_execute`, preserving prior
behaviour exactly.

Auto-actions attached to a scan execute **sequentially, stopping on first failure**. If a failure occurs and the tenant has `allow_override_on_error = true`, the UI opens a confirmation modal and the operator can explicitly continue.

## 8. Rendering — component maps

Dynamic field rendering uses two maps, keyed by `field_type`:

```ts
const FIELD_RENDERERS = { text, number, boolean, date, photo, select };
const FIELD_INPUTS    = { text, number, boolean, date, photo, select };
```

Adding a new field type = create renderer + input + register in both maps + extend `field_type` enum + update validator. No engine changes needed.

## 9. Shared DAL helpers

`getCommonFieldDefinitions(cardTypeIds: string[])` returns fields common across multiple card types (same `name + fieldType` in ALL given card types) — used for cross-card-type filtering, column selection, and summary fields. Located in `src/lib/dal/common-fields.ts`. Photo fields are excluded (not searchable).

## 9b. `action_logs.metadata` — the correlation contract

`metadata` is untyped jsonb with several producers. Keys read by more than one
layer are declared in `src/lib/dal/metadata-keys.ts` and never spelled inline —
a mistyped literal fails silently, as a row that simply never matches.

⚠️ **Two naming conventions coexist.** `executeAction` writes snake_case
(`action_type`, `target_field`, `before_value`, `after_value`,
`operator_override`, `override_validation_errors`); the scan pipeline writes
camelCase (`method`, `cardCode`, `scanLogId`). Pre-existing and not normalised.

**`scanLogId`** is the correlation key between a scan and the auto-actions it
caused. The scan pipeline captures the id of the scan row it inserts and passes
it to `executeAction` as `metadataExtra`, which merges it into the log row —
**before** the override flags, so a caller may annotate but never rewrite the
audit verdict. `executeAction` itself stays a generic read → compute → write →
log primitive and does not know what the key means (ADR `2026-07-09`).

`resumeAutoActionsAction` stamps the **same** id, which is why both Server
Action signatures carry it: an override pause waits on a human, so no time
window could reunite a resumed run with its scan.

Absence of the key means "not caused by a scan" — that is how a manual action is
identified, and it is also true of every row written before 2026-08-25. There is
no backfill. `groupFeedRows` consumes it at render. See ADR
`2026-08-25-feed-grouping-and-scan-correlation.md`.

## 9c. Card snapshots — why an audit row stops mutating

`action_logs` rows resolved their card's field values by joining `field_values`
at read time, so `/history` and the feed displayed **today's** values — and
today's labels, card type name and card code — for an event from March. An audit
log whose content changes retroactively is not one, and this system governs
physical doors.

A **`card_snapshots`** row is an immutable, complete copy of one card's field
state. `cards.current_snapshot_id` names the state in force;
`action_logs.card_snapshot_id` names the state a row observed.

**Deduplicated by content.** `ensureCardSnapshot` (`src/lib/snapshots/`, one
data-modifying CTE, same pattern as `src/lib/server/lifecycle/`) inserts only
when the card's `content_hash` differs from the one currently in force —
otherwise the log row points at the existing snapshot. A card scanned 500 times
and edited twice holds **3** snapshots, not 502. `snapshot_created` records
which of the two happened, so a reader can tell "this row changed something"
from "this row merely observed".

The comparison is against the CURRENT snapshot only, never the whole history: a
card returning to an earlier state gets a new row, because `previous_snapshot_id`
has to describe what actually preceded this state.

**The payload** (`src/lib/snapshots/payload.ts`, pure and unit-tested) carries
the code, card type id + name, and EVERY field definition of the card type —
system and soft-deleted ones included — each with its `name`, `label`, type and
value frozen as they stood. A field with no value row appears with `value: null`,
never omitted, so "emptied" stays distinguishable from "never set". Fields are
sorted by `fieldDefinitionId` and keys emitted in a fixed order: the sha256 over
that JSON is the deduplication key, so both are contract, not formatting. Photos
freeze the storage **object key**, never a URL.

**Five write paths, one loader.** `createCard` (V0 at birth, no log row),
`updateCard`, `updateCardCode` (the code is in the payload, so a rename versions
the card), `executeAction` (fresh read AFTER the value write) and `logScanEntry`
(BEFORE auto-actions run, so the snapshot is what the operator's scan observed)
all go through `captureCardSnapshot`. No backfill: `card_snapshot_id IS NULL`
means "written before migration 0022", and a pre-existing card bootstraps lazily
on its first scan or edit.

**Reading a snapshot.** Two functions, shared by every surface that renders a log
row:

- `loadSnapshotsForLogRows(tenantId, rows)` — ONE query per page, keyed on the
  page's DISTINCT `card_snapshot_id`s, each joined to its predecessor for the
  diff. Never a JOIN into the log query: a payload is the card's whole field
  state and would repeat once per row, so 500 scans of one card would carry 500
  identical copies through a 10,000-row export.
- `projectSnapshotFields(payload, config)` — the CURRENT configuration decides
  which fields a surface shows; the payload supplies the values and the labels.
  A summary field added today therefore populates for a row from last year.

Pure, so it is importable from a client component — which matters because the
activity feed is built twice, on the server and in the browser, and both call it.
`diffSnapshots(previous, current)` produces the `/history` Detail column;
`previous === null` yields nothing, because a V0 is a state rather than a
transition.

Every surface falls back to the live `field_values` join for a row with no
snapshot. **That path must not be deleted** — it is the only thing serving rows
written before migration 0022, and there is no backfill.

ADRs `2026-08-28-card-snapshots-write-path.md` (write) and
`2026-08-28-card-snapshots-read-path.md` (read).

## 10. History / audit log

`/history` is a full audit view of `action_logs` for the tenant — **all four log
types**, including manual edits and lifecycle transitions. It supports
date-range, log-type, card-type, action-definition, user, card-code, and
field-level filters (14 operators). Results are paginated (page size 50) and
exportable as CSV (capped at 10,000 rows). Accessible to OPERATOR+.

Each row reports the values, labels, card code and card type name **of its own
event**, from the snapshot it points at. ⚠️ The field-level **filters** remain
scoped to CURRENT values, permanently: a row can match `saldo = 0` and display
`saldo: 3`. This is settled — no GIN index on the payload, no snapshot-based
filtering, no toggle — and the filter panel states it in one line so the row does
not read as a bug.

The dashboard FEED, by contrast, shows only `scan` and `action`. It is an
operational surface; an administrator correcting a phone number is not a door
event. See `modules/history.md` and `modules/dashboard.md`.

## 10b. Presence — a state read, not a log query

`/presence` ("Recinto") answers *"who is inside right now?"*. It cannot be
answered from `action_logs`: a scan row carries no direction, because the
deployment has one attended reader per access point and no reader identity in the
model. Direction comes from **toggle semantics** instead — each operational scan
flips a designated boolean on the card.

A presence LOG row is recognised the same way, at read time, by
`isPresenceRowSql` — comparing the action's target field to the designation —
which is what lets the feed, the history table, the CSV export and the filter
dropdown all label it by direction. Never stamped at write time, for the same
reason `executeAction` stays generic.

The read path is `cards → card_types → field_values`, joined through
`card_types.presence_field_definition_id` and filtered to `status = 'active'` +
`value_boolean = true`, backed by the partial index `field_values_presence_idx`.
"Dentro desde" comes from the trigger-maintained `field_values.updated_at`, so no
`action_logs` lookup is involved.

The supporting field and toggle action are provisioned by
`src/lib/server/presence/provisioning.ts` (one data-modifying CTE each,
idempotent both ways), flagged `is_system = true`, and excluded from every
configuration surface — see constraint #27. See `modules/presence.md` and ADR
`2026-08-24-presence-control.md`.

## 11. Persistence details

- Lazy DB proxy in `src/lib/db/index.ts` — avoids build-time DB calls. First use triggers `drizzle(neon(DATABASE_URL))`.
- All dashboard pages: `export const dynamic = "force-dynamic"`. No ISR.
- Soft delete is the default everywhere. DAL functions filter `isActive = true` by default.
- Field value storage: dispatched to typed columns via `mapValueToColumn` / `extractValue`.

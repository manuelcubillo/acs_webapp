# 01 · Architecture

**Last updated**: 2026-08-25 · **Last sync**: `action_logs.metadata` gained a documented correlation contract (`scanLogId`); previously presence control — `action_type` gained `toggle`, `field_definitions`/`action_definitions` gained `is_system`, `action_definitions` gained `is_operator_visible`, `card_types` gained `presence_field_definition_id`, and `field_values.updated_at` became trigger-maintained (migrations 0020–0021)

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
| `cards`                       | Card instances. `code` is client-facing, unique per `(tenant_id, code)`. `status` (`lifecycle_status`) + trash metadata incl. `archived_via_type_id`. |
| `field_values`                | Values per card. Type-specific columns: `value_text`, `_number`, `_boolean`, `_date`, `_json`. `updated_at` is maintained by the `field_values_touch` **trigger**, not by application code. |
| `action_definitions`          | Actions declared per card type. `action_type`, `target_field_definition_id`, `config` jsonb, `is_auto_execute`, `is_operator_visible`, `is_system`. |
| `action_logs`                 | Unified log of scans, actions **and** card lifecycle transitions. `log_type: 'scan' \| 'action' \| 'lifecycle'`. `tenant_id` denormalized. |
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
- `log_type`: `scan | action | lifecycle` — `lifecycle` rows are audit-only and are filtered out of the feed, `/history` and tenant action strategies.

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

## 10. History / audit log

`/history` is a full audit view of `action_logs` for the tenant. It supports date-range, log-type, card-type, action-definition, user, card-code, and field-level filters (14 operators). Results are paginated (page size 50) and exportable as CSV (capped at 10,000 rows). Accessible to OPERATOR+. See `modules/history.md`.

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

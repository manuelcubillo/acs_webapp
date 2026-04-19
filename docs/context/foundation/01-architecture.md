# 01 · Architecture

**Last updated**: 2026-04-19 · **Last sync**: documentation sync against source code

## 1. Data model — hybrid SQL + dynamic fields

Fixed columns for system fields (`id`, `tenant_id`, `status`, timestamps) plus dynamic fields via the **FieldDefinition / FieldValue** pattern (EAV variant with type-specific columns).

### Tables

| Table                         | Purpose                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `tenants`                     | Organizations. Holds `scan_mode`. (`allow_override_on_error` lives in `dashboard_settings`.)        |
| `tenant_members`              | User ↔ tenant join, carries `role` (`operator` \| `admin` \| `master`).                             |
| `card_types`                  | Badge templates per tenant. Name, description, `is_active`.                                         |
| `field_definitions`           | Fields attached to a card type. `field_type`, `is_required`, `position`, `validation_rules` jsonb.  |
| `cards`                       | Card instances. `code` is client-facing, unique per `(tenant_id, code)`. `status` enum.             |
| `field_values`                | Values per card. Type-specific columns: `value_text`, `_number`, `_boolean`, `_date`, `_json`.      |
| `action_definitions`          | Actions declared per card type. `action_type`, `target_field_definition_id`, `config` jsonb.        |
| `action_logs`                 | Unified log of scans **and** actions. `log_type: 'scan' \| 'action'`. `tenant_id` denormalized.     |
| `scan_validations`            | Rules evaluated at scan time. Per-field, with severity (`error` \| `warning`).                      |
| `dashboard_settings`          | Per-tenant dashboard configuration: feed limits, entry visibility, `allow_override_on_error`.       |
| `card_type_summary_fields`    | Per card type: which fields surface in the activity feed and summaries.                             |
| Better Auth tables            | `user`, `session`, `account`, `verification`.                                                       |

### Key enums

- `field_type`: `text | number | boolean | date | photo | select`
- `action_type`: `increment | decrement | check | uncheck`
- `card_status`: `active | inactive | suspended | expired`
- `tenant_role`: `operator | admin | master`
- `scan_mode`: `camera | external_reader | both`
- `log_type`: `scan | action`

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
- **API Routes** — only for external device access (physical readers, terminals):
  - `GET /api/cards/[code]` — external systems (currently uses `x-tenant-id` header; **TODO: API_AUTH**).
  - `POST /api/cards/[code]/actions/[actionDefinitionId]/execute` — physical readers.
  - `POST /api/upload` — photo field uploads.

Auth is page-level via guards, not middleware (`src/middleware.ts` does not exist).

## 7. Action execution

`executeAction` is sequential: read current value → compute new value → write → log with before/after. Neon HTTP driver does not support interactive transactions, so this is **not** a true atomic transaction. Known risk documented in `modules/actions.md`.

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

## 10. History / audit log

`/history` is a full audit view of `action_logs` for the tenant. It supports date-range, log-type, card-type, action-definition, user, card-code, and field-level filters (14 operators). Results are paginated (page size 50) and exportable as CSV (capped at 10,000 rows). Accessible to OPERATOR+. See `modules/history.md`.

## 11. Persistence details

- Lazy DB proxy in `src/lib/db/index.ts` — avoids build-time DB calls. First use triggers `drizzle(neon(DATABASE_URL))`.
- All dashboard pages: `export const dynamic = "force-dynamic"`. No ISR.
- Soft delete is the default everywhere. DAL functions filter `isActive = true` by default.
- Field value storage: dispatched to typed columns via `mapValueToColumn` / `extractValue`.

# 03 · Glossary

**Last updated**: 2026-04-19

Domain-specific terminology used consistently across code, docs, and UI.

## Entities

**Tenant** — An organization (typically a residential community) that owns its own card types, cards, members, and configuration. Tenants are isolated at the data layer by `tenant_id`.

**Member** — A user associated with a tenant, carrying a `role` (`operator`, `admin`, `master`). Users can belong to multiple tenants via `tenant_members`.

**CardType** — A template that defines the shape of a family of cards: its fields, actions, scan validations, and summary configuration. Created via the 5-step wizard. Always belongs to one tenant.

**Card** — An instance of a CardType. Has a client-facing `code` (unique per tenant), a `status`, and a set of `FieldValue` rows keyed to the CardType's `FieldDefinition` rows.

**FieldDefinition** — A field declaration on a CardType: name, label, type (`text | number | boolean | date | photo | select`), required flag, position, and validation rules. Never hard-deleted. Field type cannot change once values exist.

**FieldValue** — A single field on a single Card. Stored with a type-specific column (`value_text`, `value_number`, etc.).

**ActionDefinition** — A named action attached to a CardType. Has `action_type` (`increment | decrement | check | uncheck`) and a `target_field_definition_id` pointing to the field it mutates. `config` jsonb holds per-type params (e.g. `{ amount }` for increment).

**ActionLog** — A single row in the unified `action_logs` table. `log_type` is `scan` or `action`. Scans log the raw scan event; action rows log an execution with `before_value` / `after_value` in metadata.

**ScanValidation** — A rule attached to a CardType, evaluated against a Card's current state at scan time. Per-field, typed, with severity (`error` | `warning`). **Never blocks** action execution — informational only.

## Flows and concepts

**Operational scan** — A scan that is logged, triggers auto-actions, and appears in the activity feed. Entry points: scan page, external reader keystroke on a scan-enabled page.

**Informational consultation** — A read-only card lookup. Not logged, does not trigger auto-actions, does not appear in the feed. Entry points: direct navigation, card list click, search bar.

**Auto-action** — An action attached to a CardType flagged to run automatically on every operational scan. Auto-actions execute **sequentially, stopping on first failure**.

**Override flow** — When an auto-action fails during an operational scan, if the tenant has `allow_override_on_error = true` a modal appears and the operator can explicitly continue the action despite the error. Controlled per-tenant in settings.

**Override confirmation** — The explicit operator acknowledgement inside the override flow. Logged distinctly so audits can identify overridden executions.

**Summary field** — A field flagged (per card type, via `card_type_summary_fields`) to be shown in compact representations: activity feed rows, card list tables, table column defaults.

**Activity feed** — The unified, time-ordered view of operational scans and action executions for a tenant. Backed by `getActivityFeed` with `tenant_id` denormalized on `action_logs` for single-table reads.

**Scan mode** — Tenant-level setting controlling input methods: `camera`, `external_reader`, or `both`. Affects the `/cards/scan` page and operator dashboards.

**Common field definitions** — Fields shared across multiple card types by name+type. Computed by `getCommonFieldDefinitions(tenantId, cardTypeIds[])`. Used for cross-card-type filtering and column selection.

## Roles

**Operator** — Day-to-day user. Can scan, view cards, execute actions.

**Admin** — Operator + Card CRUD + member management.

**Master** — Admin + CardType definition + tenant settings (scan mode, dashboard settings, override policy).

## Technical terms

**Server Action** — Next.js server-side function called from a client component. All mutations in this project go through Server Actions, wrapped by `actionHandler`.

**DAL** — Data Access Layer. All DB reads/writes live in `src/lib/dal/<domain>.ts`. DAL functions accept `tenantId` explicitly and throw typed errors.

**actionHandler** — Wrapper in `src/lib/api/response.ts` that catches DAL errors and produces a uniform `{ success, data?, error?, code?, fieldErrors? }` shape for Server Actions.

**Lazy DB Proxy** — The object exported from `src/lib/db/index.ts`. Proxies property access to a real Drizzle instance created on first use. Prevents build-time database connections.

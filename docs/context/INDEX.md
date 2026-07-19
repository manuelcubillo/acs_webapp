# Context Index

Router for tasks. Read `foundation/` once per session. Then read only the modules matching the task.

**Card archiving feature: COMPLETE (5/5).** Phase 1 data model + lifecycle service, phase 2 scan/action behaviour, phase 3 edit controls + status filter, phase 4 trash view + manual hard-delete, phase 5 retention settings UI + daily purge job. ADRs dated `2026-07-17-*` (phases 1–4) and `2026-07-18-card-lifecycle-purge-job.md` (phase 5).

## Task routing

| Task keyword / intent                                | Modules to read                                 |
| ---------------------------------------------------- | ----------------------------------------------- |
| Card design, design editor, layout, Konva, PNG export, passbook | `card-designs`, `card-types`, `fields` |
| Action definition, auto-action, execute action       | `actions`, `fields`, `card-types`               |
| Action override flow, `allow_override_on_error`      | `actions`, `dashboard` (setting lives in `dashboard_settings`) |
| Scan, scanner, reader, QR, external reader           | `scanning`, `actions`, `dashboard`              |
| Operational vs informational consultation            | `scanning`, `actions`, `cards`                  |
| Field type, field definition, renderer, input        | `fields`, `validations`                         |
| Field validation rule, validation engine             | `validations`, `fields`                         |
| Card CRUD, card list, card search, card profile      | `cards`, `fields`                               |
| Archive, trash, restore, lifecycle, retention, purge | `cards`, `card-types`, `decisions/2026-07-17-card-lifecycle-archiving.md` |
| Retention settings UI, edit `archive_retention_days` | `auth-tenants`, `decisions/2026-07-18-card-lifecycle-purge-job.md` |
| Purge job, cron endpoint, scheduled job, Vercel Cron, deploy cron | `infrastructure`, `decisions/2026-07-18-card-lifecycle-purge-job.md` |
| Scan/action behaviour by card status, lifecycle gate, deny archived, override inactive | `cards`, `actions`, `scanning`, `decisions/2026-07-17-card-lifecycle-scan-behaviour.md` |
| Status controls in edit, activate/deactivate/archive card or type, filter cards by status | `cards`, `card-types`, `decisions/2026-07-17-card-lifecycle-edit-controls.md` |
| Trash view, archived list, restore from trash, permanent/hard delete, empty trash | `cards`, `card-types`, `auth-tenants`, `decisions/2026-07-17-card-lifecycle-trash-view.md` |
| CardType wizard, card type definition                | `card-types`, `fields`, `actions`, `validations`|
| Activity feed, summary fields, dashboard settings    | `dashboard`, `cards`                            |
| History, audit log, export, filter logs              | `history`, `dashboard` (shared table), `actions` (log producers) |
| Role, permission, member, tenant, guard              | `auth-tenants`, `<affected module>`             |
| DB migration, schema change, Drizzle                 | `infrastructure`, `<affected module>`           |
| Deploy, env vars, build, Node version                | `infrastructure`                                |
| Shared components, cross-card-type field filtering   | `fields`, `cards`                               |
| Design system, tokens, theming, brand swap, dark mode | `decisions/2026-06-06-design-system-tokens.md`, `decisions/2026-06-06-adopt-shadcn-ui.md` |
| shadcn primitive, button, dialog, badge, card variants | `decisions/2026-06-06-adopt-shadcn-ui.md`       |

## If the task doesn't match any row above

1. Re-read the task statement and extract the affected DB tables.
2. Each table maps to a module (see `foundation/01-architecture.md`).
3. Read those modules. If still unclear, ask the user before coding.

## After finishing a task

Follow `UPDATE-PROTOCOL.md`. Do not skip it.

# Context Index

Router for tasks. Read `foundation/` once per session. Then read only the modules matching the task.

## Task routing

| Task keyword / intent                                | Modules to read                                 |
| ---------------------------------------------------- | ----------------------------------------------- |
| Action definition, auto-action, execute action       | `actions`, `fields`, `card-types`               |
| Action override flow, `allow_override_on_error`      | `actions`, `dashboard` (setting lives in `dashboard_settings`) |
| Scan, scanner, reader, QR, external reader           | `scanning`, `actions`, `dashboard`              |
| Operational vs informational consultation            | `scanning`, `actions`, `cards`                  |
| Field type, field definition, renderer, input        | `fields`, `validations`                         |
| Field validation rule, validation engine             | `validations`, `fields`                         |
| Card CRUD, card list, card search, card profile      | `cards`, `fields`                               |
| CardType wizard, card type definition                | `card-types`, `fields`, `actions`, `validations`|
| Activity feed, summary fields, dashboard settings    | `dashboard`, `cards`                            |
| History, audit log, export, filter logs              | `history`, `dashboard` (shared table), `actions` (log producers) |
| Role, permission, member, tenant, guard              | `auth-tenants`, `<affected module>`             |
| DB migration, schema change, Drizzle                 | `infrastructure`, `<affected module>`           |
| Deploy, env vars, build, Node version                | `infrastructure`                                |
| Shared components, cross-card-type field filtering   | `fields`, `cards`                               |

## If the task doesn't match any row above

1. Re-read the task statement and extract the affected DB tables.
2. Each table maps to a module (see `foundation/01-architecture.md`).
3. Read those modules. If still unclear, ask the user before coding.

## After finishing a task

Follow `UPDATE-PROTOCOL.md`. Do not skip it.

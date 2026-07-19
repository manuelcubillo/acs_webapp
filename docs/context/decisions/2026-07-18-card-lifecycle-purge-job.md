# ADR: Retention settings + purge job (card lifecycle phase 5)

**Date**: 2026-07-18
**Status**: accepted
**Modules affected**: infrastructure, auth-tenants, cards, card-types

## Context

Phase 1 established the trash data model, including `tenants.archive_retention_days`
(NOT NULL, default 30, range 1–365, master-editable) and the retention helpers
(`getEffectiveRetentionDays`, `computePurgeDueAt`, `daysUntilPurge`). Phase 4 added
the trash view and the per-record hard-delete primitive
(`src/lib/server/lifecycle/purge.ts`: `hardDeleteArchivedCard` /
`hardDeleteArchivedCardType` / `hardDeleteAllArchived`). What remained: a UI to
edit the retention window, and the automatic deletion of archived rows once their
retention has elapsed. This is the fifth and final phase (5/5) of the archiving
feature.

The app deploys both to Vercel and to Docker / self-hosted. Two constraints shape
the design: the Neon HTTP driver has no interactive transactions (so any
multi-row delete that must be atomic has to be a single statement), and there is
no super-admin — `master` is a per-tenant role, so retention is per tenant and
the purge must judge each row against its owner tenant's window.

## Decision

**One mechanism: a single HTTP endpoint invoked once a day.** No in-process
scheduler (no `node-cron`, no `instrumentation.ts`), because Vercel is stateless
between invocations and an in-process timer would not survive there. The endpoint
is `GET /api/cron/purge-archived`, wrapped in `routeHandler`, authenticated by a
shared `CRON_SECRET` via `Authorization: Bearer <secret>` (compared in constant
time; **fail closed** when the secret is unset). It carries no session and lives
in its own `/api/cron/*` tree — deliberately **not** under `/api/cards/*`, which
is header-authed per device; mixing auth models in one tree invites cross-tenant
mistakes.

- **Vercel:** `vercel.json` → `crons: [{ path: "/api/cron/purge-archived",
  schedule: "0 3 * * *" }]` (daily, 03:00 UTC). Vercel injects the
  `Authorization: Bearer <CRON_SECRET>` header automatically when `CRON_SECRET`
  is set in the project environment.
- **Docker / self-hosted:** an external host/container cron sends the same
  request once a day (`curl -H "Authorization: Bearer $CRON_SECRET" …`). See
  `modules/infrastructure.md`.

**Mass sweep via DELETE-with-join, not per-row iteration.** The new
`purgeExpiredArchivedRecords()` (same file as the phase-4 primitive) runs two
deletes joined to `tenants` so each row is judged against its own
`archive_retention_days`: expired archived **card types** first (cascading to
their cards), then the remaining expired archived **cards**
(`card_type_id NOT IN (del_types)`). Both are one data-modifying CTE — a single
statement, one implicit Postgres transaction — so the sweep is atomic on Neon
HTTP without an interactive transaction, exactly like the phase-4 primitives. The
phase-4 per-record functions are unchanged and remain for the manual trash
actions.

**Retention UI** at `/settings/retention` — a master-gated sub-page (its own nav
entry, `requireMaster()` on the page) with a numeric field (1–365) validated on
the client and, authoritatively, on the server. The phase-1 write path already
existed end-to-end (`UpdateTenantSettingsSchema` / `updateTenantSettings` /
`updateTenantSettingsAction`), so this phase is purely the surface.

## Consequences

- **Positive:** the trash countdown shown in phase 4 now actually resolves —
  rows are deleted on the day the UI counted down to. One mechanism works
  identically on Vercel and self-hosted. The sweep is atomic and idempotent
  (a second run deletes nothing).
- **Time semantics:** eligibility is `archived_at < (now() AT TIME ZONE 'UTC') -
  make_interval(days => archive_retention_days)`. `archived_at` is a `timestamp
  without time zone` holding a UTC wall clock, so the cutoff is computed in UTC
  to avoid any dependence on the DB session timezone, mirroring the pure-UTC
  `computePurgeDueAt` used by the trash UI. Strict `<` (not `<=`) — a row is
  purged only once its window has fully elapsed.
- **Counting:** the per-tenant summary is pre-counted before the delete, because
  a card cascaded away by deleting its type never appears in a `RETURNING` clause
  (same reason `hardDeleteAllArchived` pre-counts). The set "archived cards past
  retention" equals exactly what the two deletes remove — a cascaded card shares
  its expired type's `archived_at`, so it is itself past retention. Counts are for
  observability only, never a correctness gate.
- **No per-record audit survives a purge** (phase-1 decision, unchanged):
  `action_logs.card_id` is `NOT NULL + CASCADE`, so a card's logs are deleted
  with it. The job instead logs a run summary (counts per tenant) to the server
  for operability.
- **Negative / trade-offs:** the endpoint is only as safe as `CRON_SECRET`
  secrecy. It fails closed if the secret is unset, but a leaked secret lets a
  caller trigger the (idempotent, retention-respecting) purge — it can never
  delete a live or in-window row, so the blast radius is "delete things already
  due for deletion, a few hours early".

## Alternatives considered

- **In-process scheduler (`node-cron` / `instrumentation.ts`).** Rejected:
  Vercel is stateless between invocations, so an in-process timer would not run
  reliably there, and it would fragment the "one mechanism" goal across platforms.
- **Iterate the phase-4 primitive row by row.** Rejected for the mass sweep:
  N statements instead of two, slower, and no atomicity benefit. The primitive is
  kept for manual single-record deletes where per-tenant session scoping applies.
- **Endpoint under `/api/cards/*`.** Rejected: that tree is header-authed per
  device; the purge is cross-tenant and secret-authed. Separate trees keep the
  auth models from mixing.
- **`<=` at the retention boundary.** Rejected in favour of strict `<` so a row
  is never purged before its window has fully elapsed; the daily cadence makes
  the at-most-one-day difference immaterial.

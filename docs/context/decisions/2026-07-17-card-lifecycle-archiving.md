# ADR: Card / CardType lifecycle and archiving (trash)

**Date**: 2026-07-17
**Status**: accepted
**Modules affected**: cards, card-types, infrastructure, history, auth-tenants

## Context

Cards and card types had no coherent lifecycle. `cards.status` was a `card_status` enum (`active | inactive | suspended | expired`) that **nothing in the codebase read** — its only writer was `deleteCard`, whose action had no UI caller, and `suspended`/`expired` appeared nowhere outside the enum definition. `card_types` used a separate `is_active` boolean that `listCardTypes` did filter on. So the two tables modelled "off" in two different ways, card soft-delete silently did nothing (no list filtered by status), and there was no way to put a record in a recoverable trash.

This is phase 1 of a five-phase archiving feature (2: scan behaviour, 3: edit controls + search filter, 4: archived view, 5: retention settings + purge job). It must establish the data model and server logic that the later phases need, without shipping UI, scan changes, or the purge job.

Two blockers surfaced during discovery and were verified empirically against Postgres 15: `DELETE FROM card_types` **aborts today** because `action_logs.action_definition_id` and `field_values.field_definition_id` are `RESTRICT` (Postgres checks RESTRICT immediately, so a cascade in the same statement cannot satisfy it); and the Neon HTTP driver has no interactive transactions, so a cascading archive could half-apply.

## Decision

Adopt a shared `lifecycle_status` enum (`active | inactive | archived | expired`) on both tables, replacing `card_status` and `card_types.is_active`. Archived rows carry trash metadata (`archived_at`, `archived_by`, `status_before_archive`, plus `archived_via_type_id` on cards) and are excluded from management lists via an opt-in `notArchived` scope. All transitions go through `src/lib/server/lifecycle/`, which expresses each one as a **single data-modifying CTE** — one statement is one implicit Postgres transaction, giving real atomicity without changing driver. The dependent FK chain flips from `RESTRICT` to `CASCADE` so the phase-5 purge is a single `DELETE`.

## Consequences

- **Positive:** archiving is recoverable and auditable; the purge in phase 5 is one atomic statement with no transaction needed; `expired` is reserved without being wired to behaviour; card soft-delete actually hides things now.
- **Negative / trade-offs:**
  - **The invariant "never hard-delete `field_definitions`" lost its database-level safety net.** It was enforced by the `RESTRICT` FKs; now only the DAL enforces it. A stray hard delete silently takes its `field_values` with it. `04-constraints.md` #6 still holds — it is just no longer backstopped by Postgres.
  - Audit rows do **not** survive the purge. This is intentional (the user reversed the original requirement): purging leaves no trace, so `action_logs.card_id` stays `NOT NULL` + `CASCADE`.
  - Card types are **not** audited — a transition only bumps `updated_at`. Only cards get `log_type = 'lifecycle'` rows.
  - `listCardTypes` behaviour changed: previously `is_active = false` types were hidden; `inactive` types are now visible, per the three-state model.
  - The shared enum lets `card_types` express `expired`, which is meaningless there — guarded by a CHECK constraint rather than a second enum.
  - Archiving a card type with N cards writes N audit rows in one statement.
- **Follow-ups:** phase 2 must deny archived cards at scan time **explicitly** — the `notArchived` scope is deliberately kept out of `getCardByCode`, which the scan path, the card detail page and the external device API all share. Filtering there would turn "denied" into "not found".

## Alternatives considered

- **Keep `card_status` and add `archived`; separate enum for card types.** Rejected: leaves two divergent enums and two dead values (`suspended`, `expired`) contradicting the agreed model. `suspended` was dropped instead (migrated to `inactive`); `expired` was kept at the user's request and behaves as `inactive` everywhere.
- **Platform-wide global retention setting.** Rejected: there is no super-admin — `master` is a per-tenant role, so any tenant's master could change every tenant's behaviour, violating tenant isolation. Retention lives on `tenants.archive_retention_days` (NOT NULL, default 30, range 1–365, master-editable).
- **Keep `RESTRICT` and purge with an ordered multi-statement delete.** Rejected: without interactive transactions a mid-sequence failure leaves a half-purged card type. `NO ACTION` (deferred to end of statement) was also considered and would have preserved the safety net, but `CASCADE` was chosen for explicitness.
- **`admin` may archive card types (assumption A1/A2).** Rejected: every card type mutation is master-only project-wide, and archiving one cascades to all its cards — the largest blast radius in the system. Cards = `requireAdmin`, card types = `requireMaster`.
- **Best-effort sequential writes** (precedent: `2026-04-25-tenant-bootstrap-best-effort.md`). Rejected for the cascade: the single-CTE approach gives true atomicity at no extra cost.

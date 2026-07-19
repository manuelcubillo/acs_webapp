# ADR: Trash view, hard-delete primitive, and empty-trash

**Date**: 2026-07-17
**Status**: accepted
**Modules affected**: cards, card-types, auth-tenants

## Context

Phase 4 of 5 of the card lifecycle feature adds the "Archived" (trash) view:
admin + master list archived card types and cards, restore them, or delete them
now instead of waiting out the retention window. This introduces the project's
**first physical hard-delete** (the sole exception to the soft-delete rule, set
up in phase 1 when the dependent FK chain was flipped to CASCADE). Three choices
had no obvious answer: where the view lives and how it is gated (A1); whether to
offer a bulk "empty trash" (A2); and who may restore a card **type**, since the
spec said "admin + master" but the reused `restoreCardTypeAction` is master-only
and "every card type mutation is master-only" is a standing project rule (A3).

## Decision

1. **Route + gating (A1):** a top-level `/(dashboard)/archived` page with two
   tabs (types / cards), guarded by `requireAdmin()` (operator is redirected).
   A nav item "Archivados" is added to `DashboardShell` with `minRole: "admin"`,
   so operators never see it.
2. **Hard-delete primitive:** `src/lib/server/lifecycle/purge.ts` —
   `hardDeleteArchivedCard`, `hardDeleteArchivedCardType`, `hardDeleteAllArchived`.
   Each is a **single** `DELETE` scoped to `tenant_id = <session>` AND
   `status = 'archived'`, relying on the migration-0017 CASCADE chain to remove
   the whole subtree atomically on the Neon HTTP driver. No audit row is written:
   the card's `action_logs` cascade away with it (a phase-1 decision — the purge
   leaves no trace). Phase 5's retention job will reuse these functions verbatim.
3. **Empty trash (A2 = yes):** a master-only "Vaciar papelera" action deletes
   every archived type (cascade) and every remaining individually-archived card
   in one CTE; the two deletes are made disjoint with
   `card_type_id NOT IN (SELECT id FROM del_types)` so no row is touched twice.
4. **Restore is asymmetric (A3):** restoring a **card** is admin + master
   (`restoreCardAction`); restoring a **type** is master-only
   (`restoreCardTypeAction`), matching the "card type mutations are master-only"
   rule. A card dragged into the trash by its type (`archivedViaType`) cannot be
   restored on its own — the service blocks it — so its restore button is
   disabled and points the user at the type.
5. **Confirmations:** no new primitive. Restore reuses the phase-3
   `ConfirmDialog` (light confirm); every irreversible hard-delete (per-card,
   per-type, empty-trash) uses a new shared `ConfirmPhraseDialog` generalized
   from `settings/account/DeleteTenantAccountModal` (typed-phrase gate on the
   `Dialog` primitive).

## Consequences

- **Positive:** phase 5 (retention purge job) reuses the exact hard-delete
  primitive; no new dependency or UI primitive; the CASCADE chain from phase 1
  is now exercised by real tests; permanent deletion always requires typing a
  phrase.
- **Negative / trade-offs:** hard-delete is irreversible and the only break in
  the soft-delete rule, so the WHERE guard (`status = 'archived'` + tenant) is
  the sole safety net now that the DB FKs cascade instead of restrict. Restore
  role asymmetry means an admin can rescue a card but not a whole type.
- **Follow-ups:** phase 5 adds the automatic purge job and the retention-window
  settings UI (`archive_retention_days` already exists, per
  `2026-07-17-card-lifecycle-archiving.md`). Neither is built here.

## Alternatives considered

- **Nesting the view under `/settings`** — rejected: the trash is a routine
  management surface for admins, so it earns a first-class nav entry.
- **No "empty trash"** — rejected on the user's call (A2); the bulk action is
  guarded by a stronger typed phrase to offset the risk.
- **Admin may restore types too** — rejected: it would require relaxing the
  master-only guard and contradicts a standing rule; card restore already covers
  the admin's day-to-day need.
- **shadcn `alert-dialog` for confirmations** — rejected: the existing `Dialog`
  (via `ConfirmDialog` / `ConfirmPhraseDialog`) already serves, per
  `2026-07-17-card-lifecycle-edit-controls.md`.

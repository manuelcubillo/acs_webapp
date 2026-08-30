# ADR: Invitation refund by visit duration — a 5-hour window replaces the half-day slot

**Date**: 2026-08-30
**Status**: accepted
**Modules affected**: actions, history, dashboard

Supersedes the **R2 refund rule** of ADR `2026-08-27-invitation-accounting.md`. Everything else
in that ADR still stands: R1 entry accounting, the settlement-marker channel, UUID-only matching,
the repointed-target degradation, and the R3 follow-up. ADR `2026-08-29-invitation-purchase-mode.md`
(R4) is unaffected in substance — only its `invitationMode` value is renamed, see below.

## Context

The tenant on `scan_strategy = 'invitation'` bills a guest visit at half an invitation when it is
short and a full one when it is long. Since 2026-08-27 "short" was approximated by a **half-day
slot**: a `GUEST_EXIT` refunded a half-credit only when it fell in the same `Europe/Madrid`
half-day as its entry (`MORNING` before 15:00, `AFTERNOON` from 15:00).

The proxy is wrong at both ends, and visibly so at the gate. A guest arriving at 14:30 and leaving
at 15:30 stayed one hour and was billed a full invitation, because 15:00 fell between them. A
guest arriving at 09:00 and leaving at 14:59 stayed nearly six hours and was billed half, because
15:00 did not. The tenant charges for time occupied, not for which half of the clock the visit
landed in.

Three properties of the existing implementation had to survive the change: the rules read from
`action_logs` alone with no pairing key and no new state; several guests can be on one card at
once (a member walks three guests in, so `GUEST_ENTRY` runs three times before any exit); and
under-refunding must stay the failure direction, since over-refunding hands out credits nobody
sold.

## Decision

Refund on **elapsed time**: a `GUEST_EXIT` grants one `HALF_INVITATION` when a refundable entry
happened **at most 5 hours ago** (inclusive, compared in milliseconds off the two `executed_at`
instants) **and on the same `Europe/Madrid` calendar day**. The half-day slot is deleted —
`resolveSlot`, `InvitationSlot`, `AFTERNOON_START_HOUR`, `LocalMoment` and the `invitationSlot`
metadata key are all gone, and `resolveLocalMoment` becomes `resolveLocalDate`.

The **counter model is kept**, not replaced by entry↔exit pairing. `buildRefundCounters` counts
`spent` = `full_spent` entries on today's local date with `executedAt >= now − 5h`, and
`refunded` = `half_refunded` exits on that date with `executedAt >= ` **the oldest counted entry**;
`decideExit` still refunds while `refunded < spent`. No schema change, no migration, no change to
`ActionStrategyContext`.

## Consequences

- **Positive:**
  - **The rule now measures what the tenant charges for.** One threshold, one comparison, no
    clock-position special cases. The 14:30→15:30 visit refunds; the 09:00→14:59 visit does not.
  - **Order-independence survives, which is what makes multi-guest correct.** With entries at
    `N−6h` and `N−1h` and two exits at `N`, exactly one refund is granted. The log cannot say
    which guest is at the gate — there is no pairing key and adding one would mean a table — but
    the aggregate is right, and it is right regardless of the order the rows are read in.
  - **`refunded` counts from the oldest counted entry, not from the same cutoff.** A refund
    granted before that entry existed cannot have been granted against any entry still being
    counted, so charging it against one of them would silently deny a fresh guest their credit —
    the concrete case being a long visit refunded hours ago followed by a short visit now. This
    asymmetry is the one non-obvious line in the rule and is pinned by its own test.
  - **The under-refund bias is preserved.** An entry that has aged out, fell on the previous local
    day, was paid with a half credit, was settled under R4, or predates the marker all count 0
    toward `spent`. Every one of those fails toward refunding less, never more.
  - **The timezone surface shrank.** Elapsed time is a difference between two instants and needs
    no conversion; only "same local day" does. `localFormatter` no longer requests an hour, so the
    `hourCycle: "h23"` hazard from ADR `2026-08-27` (midnight rendered as hour "24" pushing an
    execution into `AFTERNOON`) no longer has anything to break.
  - **No backfill and no cutover step.** `full_spent` and `half_refunded` mean exactly what they
    meant before, so entries settled under the slot rule earlier the same day are counted
    correctly by the first exit that runs on the new code.
- **Negative / trade-offs:**
  - **The same-day gate is kept deliberately, and it contradicts the threshold at midnight.** A
    23:00→00:30 visit is 90 minutes and still costs a full invitation. This was the explicit
    product choice: a day is the tenant's billing unit and a visit is not allowed to span two of
    them. It is the one place where "≤ 5 hours" is not the whole rule, so it carries a named test.
  - **`invitationMode` gained a third value.** The live strategy now writes `duration` where it
    wrote `slot`; `slot` remains in the union for rows written before this change and for the
    rows `scripts/legacyDBMigration/resync.ts` reconstructs from the legacy system, which were
    never settled by either rule. Relabelling those `duration` would have been a lie about the
    audit trail; keeping the value is what makes pre-change rows identifiable.
  - **The window is a hardcoded constant**, like the 15:00 boundary it replaces. Making it
    tenant-configurable means schema, settings UI and a context change; it is isolated behind
    `REFUND_WINDOW_HOURS` so that stays a small change rather than a refactor.
  - **Sub-second clock skew is inherited, not fixed.** An entry's `executed_at` is the DB's
    `now()`; the exit measures against the strategy's `new Date()`. Against a five-hour threshold
    this is immaterial, and closing it would still mean a strategy-supplied `executed_at`.
  - Same-day history is still read by paging `getCardActionHistory` (100 rows/page, 5 pages max),
    stopping at the first row from an earlier local day — two extra reads per `GUEST_EXIT`. The
    day is the coarse filter and the 5-hour window is applied in memory by a pure function, which
    keeps the paging loop's stop condition a string comparison.
- **Follow-ups:** unchanged from ADR `2026-08-27`. **R3** (insufficient-balance validation) is
  still unbuilt, so an entry at zero balance still drives `INVITATIONS` negative in both models.
  The **incomplete audit trail** for this tenant is also unchanged: three of the five settlements
  log `before_value === after_value` and no surface reads `invitationSettlement`. Removing
  `invitationSlot` neither helps nor worsens it.

## Alternatives considered

- **Pair each exit to its entry (LIFO over the day's open entries, or a `visits` table)** —
  rejected. Duration *looks* like it demands a pairing key, but plain LIFO over the day is wrong:
  a refund granted at 09:30 cannot belong to an entry made at 12:00, and honouring that causality
  requires replaying the day's entries and exits in order against an open-entry stack. That is
  strictly more machinery than the counter comparison, and in every realistic sequence it produces
  the same answer. A `visits` table was already rejected in ADR `2026-08-27` and the constraint —
  implement from `action_logs` alone — has not changed.
- **Count `refunded` over the same 5-hour window as `spent`** — rejected as the tempting
  simplification. It is one line shorter and wrong: a refund whose own entry has aged past the
  window stays inside it and consumes a fresh entry's refund. Always in the safe direction, but a
  guest who stayed thirty minutes would be billed a full invitation for it.
- **Drop the same-day gate and let elapsed time be the only criterion** — rejected by the tenant.
  It would make a 23:00→00:30 visit refund, which is defensible on duration and wrong on billing.
- **Keep `invitationSlot` as a diagnostic** — rejected. Nothing reads it, and a key naming a
  concept the rules no longer contain is worse than absent: the next reader would take it for
  input. The refund window is derivable as `executed_at − 5h`, so no key replaces it.
- **Make the threshold tenant-configurable now** — rejected as premature, exactly as the timezone
  was in ADR `2026-08-27`, and for the same reason: one constant behind one name.

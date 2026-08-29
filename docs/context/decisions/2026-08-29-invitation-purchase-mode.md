# ADR: Invitation purchase mode — a per-card boolean that disables slot accounting

**Date**: 2026-08-29
**Status**: accepted
**Modules affected**: actions

## Context

The invitation tenant's half-day accounting (ADR `2026-08-27-invitation-accounting.md`) assumes every guest card draws on a slot-based allotment: an entry paid with a full `INVITATIONS` unit earns a half-credit back if the guest leaves within the same `Europe/Madrid` slot. Some holders do not work that way — they **buy** their invitations outright, and nothing is ever returned to them. The tenant already marks those cards with a boolean field, `compra_invitaciones` (`df83af19-…`), live on the `Carnet Invitación` card type and referenced nowhere in code. The question was where a second accounting model belongs given the existing seam, and how to keep it from corrupting the first.

Two answers shaped the design. First, purchase mode does **not** change what an entry spends: a half-credit the holder already owns is still theirs, so R1's preference survives and only the full-invitation branch differs. The entire behavioural delta is therefore on the exit path. Second, "no time logic" had to mean the slot arithmetic is genuinely not performed, not that its result is computed and discarded.

## Decision

Add **R4 · PURCHASE_MODE** inside `src/lib/action-strategies/invitation-strategy.ts`, gated on a fifth id in `INVITATION_CONFIG`. When the card's flag reads boolean `true`: `GUEST_ENTRY` keeps R1's half-credit-first preference but stamps a **new, distinct settlement marker `purchase_spent`** when it consumes a full invitation; `GUEST_EXIT` returns before reading any history and refunds nothing. A diagnostic `invitationMode` (`purchase | slot`) key is written on every handled execution. No schema change, no migration, no change to `ActionStrategyContext`.

## Consequences

- **Positive:**
  - **The distinct marker is what makes the rule survive a toggle.** R2 counts only `full_spent` as refundable, so an entry settled under purchase mode is structurally unrefundable *for good*. Reusing `full_spent` and gating solely on the flag at exit time would have been correct only while the flag never changed: clearing it mid-day would let an afternoon exit refund against a morning purchase entry, handing out a credit that was never sold. The marker moves the guarantee from "the flag is stable" to "the log says what happened".
  - **The exit fast-path is the feature, not an optimisation.** Reading the flag in its own wave and returning before `collectSameDayExecutions` means a purchase-mode card never pays for the two same-day history reads — net *less* DB work than today (2 page reads traded for 1 field read). A unit test asserts `getCardActionHistory` was never called, pinning the requirement rather than only its outcome.
  - **`decideExit(balances, counters: SlotCounters | null)` keeps one rule function.** `null` states "slot accounting does not apply to this card"; passing a fabricated `{ spent: 0, refunded: 0 }` would assert a history read that never happened. The decision logic stays in the pure layer with I/O at the edges, matching the file's existing structure.
  - **Inert until set, by three independent defaults.** `toFlag` accepts only boolean `true`; `readField` returns null both for a card with no `field_values` row and for an id matching no field definition; and `decideEntry`'s `purchaseMode` parameter defaults to `false`. A missing, cleared or misconfigured flag reproduces R1/R2 exactly — verified against the local DB, where all 507 existing cards read `false`.
  - Numbered **R4, not R3**: `R3` was already claimed by the pending insufficient-balance gate in ADR `2026-08-27`, in this file's own comments and in `modules/actions.md`. Reusing it would have made the standing "R3 not yet authorised" note ambiguous.
- **Negative / trade-offs:**
  - **A second accounting model now lives in one strategy file.** Every future rule must state which model it belongs to, and the settlement union grew to five members — two of which (`full_spent`, `purchase_spent`) differ only in refundability. A third model would be the point to reconsider the single-file shape.
  - **`GUEST_EXIT` costs one extra round trip in slot mode.** The flag read must complete before the history reads can be skipped, so slot-mode exits now do two waves where they did one. Traded deliberately for the purchase-mode saving; folding the flag into the first `Promise.all` would have made the fast path unreachable.
  - **The entry path's arithmetic is unchanged**, so the feature is invisible in `before_value` / `after_value` on entries that spend a half credit. Only `metadata.invitationMode` distinguishes them — and, as with `invitationSettlement`, no surface reads it. Inherits the incomplete-audit-trail follow-up from ADR `2026-08-27` rather than worsening it: `purchase_spent` *does* move the target field.
  - Inherits every non-atomicity and race property of the execution path unchanged.
- **Follow-ups:**
  1. R3 (insufficient-balance validation) is untouched and still owed. A purchase-mode entry at zero balance drives `INVITATIONS` negative exactly like a slot-mode one; when R3 lands it must gate both models, since neither has a floor.
  2. No UI work was needed or done — the flag is an ordinary boolean field, edited through the generic card form. If purchase mode ever needs to be visible as a *state* rather than a field value, that is a `cards` concern, not a strategy one.

## Alternatives considered

- **Reuse `full_spent` and branch only on the flag at exit time** — rejected: correct only while the flag never changes. See the marker rationale above; the failure mode is silently over-refunding.
- **Always decrement `INVITATIONS`, ignoring `HALF_INVITATION` even when positive** — the literal first reading of the request, and rejected on the tenant's own answer: a half-credit the holder already owns is still theirs to spend, and burning a full invitation while a half sits unused would overcharge them. One line in `decideEntry` if that judgement ever reverses.
- **Fetch balances, flag and history in a single `Promise.all` and discard the history when the flag is on** — rejected: simpler code, identical latency, but it performs the slot arithmetic's reads for cards the whole point is to exempt from them.
- **A per-tenant or per-card-type setting instead of a per-card field** — rejected: the tenant already models this per card, and the same card type mixes both kinds of holder. A coarser switch could not express the actual population.
- **A separate `TenantActionStrategy` for purchase cards** — rejected: strategies are resolved from `tenants.scan_strategy`, one per tenant. The distinction here is per card, one layer below what the seam selects on.

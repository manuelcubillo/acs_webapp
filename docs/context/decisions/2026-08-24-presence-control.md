# ADR: Presence control — a designated boolean field, flipped by a toggle action

**Date**: 2026-08-24
**Status**: accepted
**Modules affected**: presence, actions, card-types, fields, cards, dashboard, history, infrastructure

## Context

The client needs to answer, at any moment, *"who is currently inside the facility?"*

The physical deployment is one **single reader per access point**, attended by a
concierge. There is no separate entry reader and no separate exit reader, and the
data model has no notion of reader identity anywhere. Direction therefore cannot
be derived from hardware.

Filtering `action_logs` cannot answer the question either. A `log_type='scan'`
row records *that* a card was presented; it carries no direction, and no
`action_type` on it distinguishes an arrival from a departure. Reconstructing
direction by counting a card's scans and taking the parity is wrong the first
time a scan is missed, a card is scanned twice by accident, or a log row is
purged by retention — and it silently stays wrong afterwards, because nothing
ever re-anchors it.

Presence is a **state** question, not an event query. State needs somewhere to
live and a designated place to read it from.

Two hard requirements came from the client and shaped the rest: enabling the
feature must be **one checkbox** with nothing else to configure, and the manual
correction must be a **switch**, not an "Entrada" / "Salida" button pair.

## Decision

Presence is a **designated boolean field per card type**, flipped by a new
general-purpose `toggle` action type that runs as an auto-action on every
operational scan.

- `card_types.presence_field_definition_id` (nullable FK, `ON DELETE SET NULL`)
  designates the field. NULL — the default and the majority case — means the card
  type does not participate.
- The field and the toggle action are **provisioned by the server**
  (`src/lib/server/presence/provisioning.ts`), flagged `is_system = true`, and
  excluded from every configuration surface. The wizard checkbox is the entire
  user-facing surface of the feature.
- A new page at `/presence`, labelled **"Recinto"**, reads that state.

## Consequences

### Why toggle rather than directional readers

There is one attended reader and no reader identity in the model, so toggle
semantics are the only mechanism available. Name the drift honestly: **the flag
is wrong whenever a physical passage happens without a scan** — tailgating, a door
held open for two people, someone leaving through a fire exit. Nothing in this
phase detects that. The mitigation is the **scheduled auto-close** in the
follow-up task (close the facility at a configured time, marking everyone out
with the sentinel user as the actor), which bounds the error to one day rather
than letting it accumulate forever. This phase does not solve it and does not
pretend to.

### Why a designated field, not a `presence_state` projection table

A dedicated table would need its own writes in the scan pipeline, its own audit
trail, its own mirror in `feed-entries.ts`, and its own history surface. The
designated-field approach reuses **fields, actions, `executeAction`,
`action_logs`, `/history`, the activity feed and card search wholesale** — a
presence flip is an ordinary action row, and every existing surface already
renders it correctly (verified: `feed-entries.ts` builds rows from
`{actionDefinitionId, actionName, success}` with no action-type branching).

It also avoids an extra write in a pipeline that has **no interactive
transactions**: a projection table would mean two writes per scan that could
diverge, on a driver where they cannot be made atomic.

**The condition that flips this decision:** needing multiple simultaneous areas
per card ("inside the pool AND inside the gym"). One boolean per card type
cannot express that, and at that point a real `presence_state` table keyed by
(card, area) becomes the right shape.

### Why `is_operator_visible` is separate from `is_auto_execute`

Before this change the two were the same flag's job: `CardActions` and
`DashboardView` both hid actions by testing `!isAutoExecute`, on the assumption
that anything running on scan should not also be a button.

Presence breaks that assumption — it must **both** fire on every scan **and** be
correctable by hand, because a concierge who scans the wrong card needs to undo
it. So `is_auto_execute` goes back to meaning only *"runs on operational scan"*,
and a new `is_operator_visible` alone governs whether an action renders as a
control. All four combinations are now expressible and meaningful.

Migration 0021 backfills `is_operator_visible = NOT is_auto_execute`, which
reproduces the previous behaviour byte-for-byte on existing data — the column
default (`true`) is what applies to everything created afterwards.

### Why `field_values.updated_at` is trigger-maintained

The column already existed (migration 0002) and every write path set it by hand
in its `ON CONFLICT` branch. That was correct but by convention: a new write path
could forget, and nothing would fail — `inside_since` would just quietly go
stale. A `BEFORE UPDATE` trigger makes it an invariant of the table instead, and
moves the clock from the application to the database.

Accepted imprecision: an `UPDATE` writing an unchanged value still bumps it. That
is harmless here because a toggle always changes the value, and because the
presence field is excluded from the card form — but it is precisely why the card
edit page had to be changed to scope `initialValues` to the fields it renders.
`useCardForm` submits its seed map wholesale, so leaving the presence value in it
would re-write it on every unrelated card edit and reset "Dentro desde".

### Why not a `cards.presence_since` column

It would push presence-specific logic into `executeAction`, the generic hot path
every action of every tenant runs through — a branch on "is this the presence
action?" in code that is deliberately agnostic to what an action means.
`field_values.updated_at` gives the same answer for free, for every field.

### The deliberate exception: the informational page mutates presence

The card detail page is an **informational** surface (ADR
`2026-03-20-operational-vs-informational.md`): it does not log a scan and does
not fire auto-actions. But manual actions have always executed from it, and the
presence toggle now renders there as a switch — so **flipping it from the card
detail page does change presence, and does write an `action_logs` row.**

This is intended: it is how the concierge corrects a wrong state without
physically re-scanning. It is nonetheless a real exception to the
informational/operational model and is stated here rather than left to be
discovered. The invariant that survives intact is the one that matters: the
detail page still logs no **scan** and still fires no **auto-actions**. Only an
explicit, operator-initiated action mutates anything, which was already true.

### Atomicity strategy: single data-modifying CTE

Both `enablePresenceControl` and `disablePresenceControl` are **one statement**,
following the lifecycle precedent (ADR `2026-07-17-card-lifecycle-archiving.md`)
rather than the best-effort sequential fallback (ADR
`2026-04-25-tenant-bootstrap-best-effort.md`). One statement is one implicit
Postgres transaction, so real atomicity without changing driver.

The find-or-reactivate-or-create shape fits in one statement because every CTE
reads the same snapshot: `existing_field` is evaluated once, the INSERT branch is
guarded by `WHERE NOT EXISTS` against it, and the repair UPDATE keys off it — so
exactly one branch produces a row. The circular FK
(`card_types.presence_field_definition_id` → `field_definitions.id`, whose own
`card_type_id` points back) is satisfied because FK triggers fire at the end of
the statement, by which point the field row exists.

Both directions are idempotent, which is what lets the wizard call
`setPresenceControlAction(id, desired)` unconditionally on every submit without
tracking which transition it is.

### Why disable soft-deletes instead of cleaning up

`field_values` are **not** deleted on disable. Hard-deleting a field definition is
forbidden (constraint #6) and the stored values are audit-relevant. They become
unreachable because the presence query joins through the now-null designation —
which is the correct outcome, and is what makes disable → re-enable restore the
same rows (verified: same UUIDs, same stored values).

### Other consequences

- **Positive:** presence costs no new write path, no new log type, no feed
  mirror, and no new history surface. `toggle` is a general action type any
  tenant can use on any boolean field, not a presence back door.
- **Negative:** `getCardTypeWithFullSchema` and friends now return rows that most
  callers must filter. The filter is at the consumer by design (see below), which
  means **a new configuration surface that forgets `excludeSystemFields` will
  leak the presence field into a picker.** Constraint #27 and the grep-ability of
  the two helper names are the mitigation.
- **Negative:** `/presence` does not poll, so an occupant who left via another
  post appears until Refrescar. Same trade, and same honesty mechanism
  ("Actualizado HH:MM"), as ADR `2026-07-17-dashboard-feed-no-polling.md`.
- **Follow-ups:** the scheduled auto-close, `tenants.timezone`,
  `presence_auto_close_at`, the master settings screen for closing time, the bulk
  "close facility" button, occupancy limits (*aforo*), reader identity,
  areas/zones, directional anti-passback, and presence-specific scan validations
  are all explicitly **out of scope here** and belong to the follow-up task. The
  sentinel user (`SYSTEM_USER_ID`) is seeded now, unused, because it is schema
  work and because discovering a Better Auth incompatibility was cheaper here.

## Alternatives considered

- **Derive presence from `action_logs`.** Rejected: scan rows carry no direction,
  and parity-counting is unrecoverable once it desyncs. This is the core reason
  the feature exists as state rather than as a query.
- **Two action definitions ("Entrada" / "Exit") the operator picks between.**
  Rejected: with one attended reader, the concierge would have to choose the
  direction on every scan, which is exactly the error the toggle removes. The
  client asked for a switch, not a button pair.
- **A dedicated `presence_state` table.** Rejected for now — see above. Revisit
  when multiple simultaneous areas per card are needed.
- **Filtering system rows inside the DAL reads.** Rejected: the same read feeds
  the wizard (must hide) and the scan pipeline (must run the system toggle). A
  DAL that silently drops rows makes the second requirement inexpressible, and
  its failure mode is invisible — a scan that quietly stops toggling. Consumers
  declare intent instead.
- **A `presence` boolean column on `cards`.** Rejected: it would make presence a
  property of every card in every tenant, need its own write in `executeAction`,
  and still need a timestamp column beside it. The designated-field approach
  keeps tenants that do not use presence completely untouched.
- **Reusing `check` / `uncheck` with client-side alternation.** Rejected: the
  client would have to know the current value to pick which action to fire, so a
  stale read would flip the wrong way. `toggle` computes from the value the
  server just read, inside the same execution.
- **Making the presence field a normal (non-system) field.** Rejected: it would
  appear in the card form, the wizard, filter builders and design bindings, and a
  master could rename it, retype it or delete it out from under the feature.

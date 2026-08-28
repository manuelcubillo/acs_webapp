# ADR: Card snapshots — immutable frozen state behind the audit log (write path)

**Date**: 2026-08-28
**Status**: accepted
**Modules affected**: cards, actions, history, dashboard, fields, infrastructure

## Context

`/history` and the dashboard activity feed resolve a log row's card values by
joining `field_values` at read time. They therefore display **today's** values,
not the values the card held when the row was written — and the same is true of
the field labels, the card type name and the card code. An audit log whose
content mutates retroactively is not an audit log, and this system governs
physical doors.

The gap was wider than display. Manual card edits (`updateCard`) wrote to
`field_values` with **no audit row at all**: there was no record anywhere of who
changed a card field, or when. `action_logs` recorded scans, action executions
and lifecycle transitions, and was silent about the one mutation an
administrator performs by hand.

This ADR covers the **write path only**. Nothing here changes what a user sees:
the feed and `/history` still render current values, and the new `card_edit`
rows are excluded from both. The read paths change in a follow-up (A2).

## Decision

Add a `card_snapshots` table holding an immutable, complete copy of one card's
field state, **deduplicated by content hash**. `cards.current_snapshot_id` names
the state in force; `action_logs.card_snapshot_id` names the state a log row
observed; `action_logs.snapshot_created` says whether that row is what produced
it. A new `log_type = 'card_edit'` records a manual edit — and only when the
edit actually changed something.

All snapshot writes go through one primitive, `ensureCardSnapshot`
(`src/lib/snapshots/`), expressed as a single data-modifying CTE, following the
pattern `src/lib/server/lifecycle/` established for atomicity without
interactive transactions.

## Consequences

### Why content-hash deduplication, not one snapshot per log row

A snapshot per log row is the obvious design and it does not survive contact
with the traffic. This is a door system: the dominant event by two orders of
magnitude is a scan that reads a card and changes nothing. A card scanned 500
times and edited twice would accumulate 502 near-identical payloads; with the
hash it holds **3**. On a scan-heavy tenant that is roughly a hundredfold
difference in rows and in jsonb bytes, for state that is by definition
identical.

The cost is one sha256 per write and one comparison in SQL. `snapshot_created`
recovers the only thing the per-row design gave for free — knowing whether *this*
row changed anything.

### Why deduplication compares against the current snapshot only

The comparison is against `cards.current_snapshot_id`, never the card's whole
history. A card returning to a state it held before therefore gets a **new**
snapshot rather than a pointer back to the old one.

That looks wasteful and is not negotiable: `previous_snapshot_id` forms the
chain A2's diff walks, and it has to describe what *actually* preceded a state.
Reusing an older row would give that row two successors and make the chain a
graph — and a diff walking backwards from "saldo: 3" would arrive at whichever
branch it happened to follow. Searching history for a matching hash would also
turn every write into a scan of the card's entire past, which is precisely the
cost the deduplication exists to avoid.

### Why `snapshot_created` is a column, not a read-time derivation

It is tempting to infer it: the row that created a snapshot is the oldest row
pointing at it. That derivation is a window function over `action_logs`
partitioned by snapshot — expensive on the largest table in the schema, and
**wrong** whenever two rows share a timestamp, which the scan path produces
routinely (a scan and its auto-actions land within the same millisecond).

It is also not always recoverable at all: `createCard` takes a snapshot and
writes no log row, so that snapshot has no creating row to find. One boolean,
written once by the code that already knows the answer, replaces a query that is
both slower and less correct.

### Why the manual edit had to be snapshotted **and** logged in the same phase

A snapshot model in which edits do not version is worse than no snapshots at
all, because it looks trustworthy and is not. If `updateCard` wrote values
without snapshotting, the next scan would silently absorb the edit into its own
snapshot, and the audit log would show a *scan* as the moment the value changed
— attributing an administrator's change to whichever operator next presented the
card at the door. That is a worse failure than today's honest "we join current
values".

So the edit path snapshots, and writes a `card_edit` row naming who did it.

**The row is gated on the content hash, not on "an UPDATE ran".** `useCardForm`
seeds its state from the rendered fields and submits that map wholesale, so an
ordinary save re-writes every value including the untouched ones, and every one
of those upserts reports a row affected. Gating on that would fill the history
with empty edit rows on every visit to the edit form. A save that changed no
value is a non-event and writes nothing — not a snapshot, not a log row.

### Why full-field payloads, not just the configured summary fields

Snapshotting only the fields `card_type_summary_fields` currently names would
make the whole history blank for any field added to that config later: every
row written before the change would have no frozen value for it, permanently.
The config is a display preference a master edits at will; the snapshot is a
record. Tying the second to the first would let a UI setting silently destroy
audit coverage.

For the same reason the payload includes **every** field definition of the card
type — system fields and soft-deleted (`is_active = false`) ones included — and
a field with no value row appears with `value: null` rather than being omitted.
Otherwise "this field was emptied" and "this field did not exist / was never
set" are indistinguishable, and the A2 diff cannot tell them apart.

### Why the label is frozen alongside the value

Renaming a field is a configuration change. If labels resolved at read time, it
would retroactively relabel every historical row — a March entry would claim it
recorded "Saldo disponible" when the field was called "Puntos" at the time.
Freezing the label keeps a row's rendering as stable as its value.

⚠️ **Both `name` and `label` are frozen.** This schema carries two strings per
field: `name` (internal identifier, what `action_logs.metadata.target_field`
records) and `label` (what every read surface actually displays). Freezing only
one would leave A2 rendering a string it has to re-resolve from current
configuration, reintroducing exactly the problem this solves. Both are in the
payload at `v: 1`.

### Why a snapshot costs one extra query on the scan path

The payload contract cannot be satisfied from what the write paths already hold.
The scan pipeline's `CardWithFields.fields` comes from `enrichFieldValues`,
which maps over `field_values` **rows** — so a field with no value is simply
absent — and its definitions come from `getFieldDefinitionsByCardType`, which
filters `is_active = true`. Neither carries the card type name.
`executeAction` holds one field's value, its own target.

Building the payload from those would collapse "emptied" and "never set", which
is the one distinction the diff needs. So `loadCardSnapshotSource` is a single
indexed query, anchored on `cards` with LEFT JOINs outward, shared by all four
write paths — one loader rather than four hand-rolled projections that could
disagree about what a snapshot means. The scan path goes from roughly six
queries to seven.

`executeAction` reads its payload **fresh, after the write**, rather than
patching the pre-action payload with `newValue`. Without interactive
transactions a patched payload would assert a state nobody verified, and it
would silently omit a custom strategy's auxiliary `setFieldValue` writes, which
happen outside the main upsert.

### Why temporal versioning of `field_values` (SCD type 2) was rejected

The textbook alternative is to make `field_values` history-tracked — `valid_from`
/ `valid_to` per row — and reconstruct a card's past state by querying as-of a
timestamp. Rejected on three counts:

1. **Write amplification on the hottest path.** Every action execution becomes
   close-the-old-row + insert-the-new-row, doubling the writes on the path every
   scan runs through, and doing it inside a table that already carries the
   `field_values_touch` trigger and the presence partial index.
2. **Unbounded growth with no deduplication available.** Deduplicating by
   content is natural for a whole-card payload and meaningless per value row: a
   counter that increments on every scan produces a new version every time
   regardless. The row count grows with traffic, forever, and it grows in the
   table every read path joins.
3. **Retention and purge become ambiguous.** Purging a card must leave no trace
   (ADR `2026-07-17-card-lifecycle-archiving.md`). With one `card_snapshots`
   row per state that is a `CASCADE` and nothing more. With temporal
   `field_values`, retention has to reason about which *versions* of which rows
   an archived card owns, and the "leaves no trace" guarantee stops being a
   property of a foreign key.

A snapshot is also simply the right grain for the question being asked. The read
paths want "what did this card look like when this happened", which is one
lookup by primary key — not a per-field as-of reconstruction joined six ways.

### History filters stay scoped to CURRENT values — and the divergence that creates

This is settled, not deferred. `/history`'s field-level filters (14 operators)
continue to evaluate against `field_values` as they stand today. There is no
GIN index on `payload`, no snapshot-based filtering, and none is planned.

**Once A2 lands this produces a visible divergence: a row matching a filter for
"saldo = 0" may display "saldo: 3".** The filter looks at *today*; the column
shows *then*. That reads as a bug and is not one.

The alternative — filtering on frozen values — is worse in the way that matters
operationally. An operator filtering history is almost always asking "show me
the log for the cards that are in state X **now**" (which cards are currently at
zero balance, who is currently inside). Filtering on historical values answers a
different question they did not ask, and it would need a GIN index on a jsonb
column that grows with every state change, to serve a query nobody has
requested. Documented in `modules/history.md` rather than papered over.

### Other consequences

- **No backfill, and none wanted.** `action_logs.card_snapshot_id IS NULL` means
  "written before 2026-08-28"; A2 falls back to the current join for those rows.
  Same precedent as `metadata.scanLogId`, which has no backfill either. A
  pre-existing card bootstraps its V0 lazily on its first scan or edit, because
  `NULL IS DISTINCT FROM $hash` is true — so there is no migration job to run
  and no window in which some cards are snapshotted and others are not.
- **Snapshots are inside the existing GDPR posture, deliberately.**
  `card_snapshots.card_id` is `NOT NULL` + `CASCADE`, so purging a card takes
  its frozen personal data with it. This is the same reversal recorded in ADR
  `2026-07-17-card-lifecycle-archiving.md`: purging leaves no trace. Do not
  relax it to `SET NULL` for the sake of preserving audit rows.
- **`action_logs.card_snapshot_id` is `SET NULL`, not `CASCADE`** — the opposite
  choice, for the opposite reason: an audit row must never be destroyed by a
  snapshot disappearing.
- **Photos are keys, never images.** A `photo` field freezes its storage object
  key verbatim. Snapshots do not resolve, sign, copy or retain images, so a
  replaced photo's key can point at an object that no longer exists. Serving
  historical photos is a separate decision with its own retention implications
  and is deliberately not taken here.
- **`updateCardCode` does not snapshot.** The card `code` is part of the payload,
  so renaming a card leaves the current snapshot describing the old code until
  the next scan or edit — at which point the change is folded into that event's
  snapshot rather than attributed to the rename. Small, known, and left for A2
  or later rather than widened into this change.
- **The migration is not split.** `modules/infrastructure.md` required
  `ALTER TYPE … ADD VALUE` to be alone in its file. The constraint it protects is
  that the new value may not be *used* in the transaction that adds it; nothing
  in `0022_card_snapshots.sql` references `'card_edit'`. Splitting would have
  meant hand-authoring a drizzle journal entry and snapshot to sit between two
  generated ones. The rule in `infrastructure.md` has been restated as what it
  actually protects, and the migration header warns against appending a use.
- **Found while wiring this, NOT fixed here:** `/history` does not exclude
  `lifecycle` rows. `buildWhere` applies a `log_type` predicate only when
  `filters.logTypes` is non-empty, and `toEffectiveFilters` deletes that key
  whenever the scan toggle is on — so with the toggle on, lifecycle rows are
  returned. `filter-params.ts` and `modules/history.md` both claimed otherwise.
  Fixing it would change what users see, which this change is not allowed to do.
  Recorded as an open TODO in `modules/history.md`.

## Alternatives considered

- **A snapshot per log row.** Rejected: ~100× the rows on a scan-heavy tenant,
  for state that is identical by construction. See above.
- **Temporal `field_values` (SCD type 2).** Rejected: write amplification on the
  hottest path, unbounded growth with no deduplication available, and retention
  /purge semantics that stop being expressible as a foreign key. See above.
- **Snapshot only the configured summary fields.** Rejected: adding a summary
  field later would leave the entire history blank for it, permanently — a
  display setting silently destroying audit coverage.
- **Derive `snapshot_created` at read time.** Rejected: a window function over
  the largest table, wrong for same-millisecond rows, and undefined for the
  snapshot `createCard` takes with no log row.
- **Reuse an identical earlier snapshot when a card returns to a prior state.**
  Rejected: forks `previous_snapshot_id` into a graph and makes the diff
  chain ambiguous, in exchange for saving one row per reversion.
- **Store the rendered display strings instead of typed values.** Rejected: it
  freezes formatting and locale alongside the data and makes a structural diff
  impossible — A2 needs to compare values, not compare sentences.
- **Snapshot inside `logScanEntry`'s caller rather than in the DAL.** Rejected:
  it would make "every scan row carries a snapshot" a convention a future caller
  can forget, instead of a property of the only function that writes scan rows.
- **Filter history on frozen values.** Rejected as a product decision, not a
  technical one — see "History filters stay scoped to CURRENT values".

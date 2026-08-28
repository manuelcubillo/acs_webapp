# ADR: Card snapshots — the read paths, multi-field detail and frozen feed values

**Date**: 2026-08-28
**Status**: accepted
**Modules affected**: history, dashboard, actions, cards

## Context

A1 (`2026-08-28-card-snapshots-write-path.md`) built `card_snapshots` and made
every `action_logs` row point at the state it observed. Nothing read any of it:
`/history` and the activity feed still joined `field_values` at read time, so an
old row still displayed today's values, today's field labels and today's card
type name. `card_edit` rows were being written and then hidden, because a row
that says "edited" and then shows current values is worse than no row at all.

This ADR covers the read side. It changes what a user sees, deliberately: values
on a historical row are now the values of that moment, `card_edit` rows appear
in `/history`, and the Detail column reports every field an event changed rather
than the single `metadata.target_field` an action happened to name.

The riskiest surface is the feed, which is built **twice** — once by
`getActivityFeed` on the server and once by `src/lib/dashboard/feed-entries.ts`
on the client, which appends rows locally after a scan instead of re-fetching.
The two have disagreed before (one produced "Presencia" where the other produced
"Entrada"), and A2 introduces a sharper version of the same hazard: the scan
action returns the card's state AFTER its auto-actions ran.

## Decision

One shared resolution (`loadSnapshotsForLogRows`) and one shared projection
(`projectSnapshotFields`), called by both read surfaces and by both feed
producers. `diffSnapshots` is a separate pure module producing the Detail
column. Server Actions return the payloads of the rows they just wrote, so the
client builds its feed rows from the same frozen state the server will serve on
the next refresh.

## Consequences

### Two steps, not a JOIN

Snapshots are fetched by a second query keyed on the page's DISTINCT snapshot
ids, never joined into the log query. A payload is the card's whole field state;
joined in, it would repeat once per row, so a card scanned 500 times would drag
500 copies of one identical payload through a 10,000-row CSV export.
`distinctSnapshotIds` collapses them first, and each snapshot's predecessor
comes along in the same query via a self-join — the diff needs it, and fetching
it separately would double the round trips.

The query is always scoped by `tenant_id` even though the ids come from
tenant-scoped rows. Defence in depth, per the DAL convention.

### A V0 snapshot produces no detail

`diffSnapshots(null, current)` returns an empty array. A V0 is the lazy
bootstrap of a card that predates migration 0022 — it describes a state, not a
transition. Without this rule the first scan of every existing card would render
as "12 fields changed" on the day this ships. The same holds for
`snapshot_created = false`: the event observed the card without touching it, so
there is nothing to report.

### Label renames are not changes

The diff compares VALUES only. Renaming a field definition does not create a
snapshot, so the rename folds into whatever event happens to version the card
next; attributing it to that event would be a lie about what that event did.
When two snapshots disagree about a label, the NEWER one is reported — it is
the one the operator recognises. A projected summary field, by contrast, shows
its own snapshot's label, because it is describing one moment rather than a
transition.

### System fields are filtered at render, not in the diff

`diffSnapshots` returns system-field changes and each surface drops them with
`excludeSystemFields`. This follows `src/lib/fields/system.ts`: a DAL-level read
that silently drops rows makes the other caller's requirement unexpressible.
The visible consequence is that a presence toggle shows an empty Detail — which
is correct, because the Entrada / Salida label in the Acción column already
carries the fact.

### The shared projection is the anti-drift measure

`projectSnapshotFields` is pure and lives in `src/lib/snapshots/project.ts`,
separate from the DB-backed `resolve.ts`, precisely so the client can import it.
`getActivityFeed` and `feed-entries.ts` call the same function on the same
payloads. The acceptance test is concrete: scan a card whose auto-action
decrements a balance from 10 to 9, and the feed's scan row must read **10**
immediately and still read 10 after pressing Refrescar. It reads 10 because the
scan row's snapshot was frozen before the auto-action ran, and because the
client is handed that snapshot rather than the returned card — which is the
final, post-action state and would have shown 9.

### Payloads are sanitised at the Server Action boundary

A payload holds `photo` values as storage OBJECT KEYS, which this codebase keeps
server-side (ADR `2026-08-02-card-list-photos-stable-route.md`).
`loadClientSnapshots` strips them before the payload crosses the wire; nothing
on the client needs them, since a photo projects to a presence flag and the feed
config contains no photo fields at all. A sanitised payload must never be
re-hashed.

### Filters stay on current values — and that divergence is now visible

Field filters continue to run `EXISTS` subqueries against live `field_values`.
No GIN indexes, no snapshot-based filtering, no toggle. A row can therefore
match `saldo = 0` and display `saldo: 3`, which reads as a bug unless it is
explained; the filter panel now carries one line of Spanish copy saying that
filters match current values while the table shows values as of each event.
This is the accepted cost of keeping filters fast on a jsonb-free path.

### Ordering the Detail column

`diffSnapshots` returns changes in the payload's field order, and the payload is
sorted by `fieldDefinitionId` because the content hash must be reproducible.
UUID order is deterministic but arbitrary to a reader, and it would decide WHICH
three changes appear before the "+N". `orderChangesForDisplay` therefore
reorders at the presentation boundary: identity first (a code change is what an
auditor looks for), then by label.

### Lifecycle rows are legitimised, not hidden

`buildWhere` applied a log-type predicate only when `filters.logTypes` was
non-empty, and `toEffectiveFilters` DELETED that key whenever the scan toggle was
on — so `lifecycle` rows have in fact been reaching the table since 2026-07-17.
The claim that they were excluded lived in a code comment
(`filter-params.ts`: "lifecycle rows are excluded by the DAL regardless") and in
`modules/history.md`; both were simply wrong, and no ADR ever asserted it, so
there is nothing here to supersede.

They are now surfaced deliberately: filterable, with their transition
(`Activo → Archivado`, read from `metadata.from`/`to` — they carry no snapshot)
in the Detail column, and included in the export. Hiding them now would be an
information regression dressed as a fix: they have been visible for over a month
and an administrator may already rely on seeing that a card was archived.

Note that the archiving feature is complete at five phases
(`2026-07-17-card-lifecycle-archiving.md`); surfacing these rows was not a
planned phase of it, it is a decision taken here.

`toEffectiveFilters` now always sends an EXPLICIT log-type list, and `buildWhere`
distinguishes three states: `undefined` is no constraint, a non-empty array is a
whitelist, and an EMPTY array matches nothing. Treating empty as "no constraint"
is what would show the whole table to an operator who deselected every type.

### Card identity: displayed frozen, addressed live

`ActionHistoryEntry` carries both. `cardCode` stays the live code because every
link and photo route is built from it — a card renamed after a row was written
must still navigate — while `cardCodeAtEvent` is what the cell prints, with the
current code in a `title` when they differ. The feed keeps live values for both:
it is a twenty-row operational window, and the code is what the operator reads
off the card in their hand.

### Trade-offs

- **Negative:** one extra query per history page, per feed load, and per scan /
  resume / action execution (the Server Action's `loadClientSnapshots`). Each is
  a single indexed lookup over a handful of distinct ids.
- **Negative:** `ActionHistoryEntry` grew five fields, and `ActionHistoryFilters`
  and `ActionHistoryEntry.logType` widened from `scan | action` to the whole
  enum. Every consumer had to acknowledge the wider type.
- **Positive:** pre-0022 rows keep working with no backfill. Every surface
  checks for a resolved snapshot and falls back to the live join it always used.
  That path must not be deleted; it is the only thing serving those rows.

## Alternatives considered

**Join the snapshot into the log query.** One query instead of two, at the cost
of repeating a whole payload per row. Rejected on the export: 10,000 rows over a
handful of distinct cards would be dominated by duplicated jsonb.

**Ship both payloads to the client and diff there.** Would have moved
`diffSnapshots` into the renderer and made the CSV re-implement it. Rejected:
the two would drift, and the payloads carry photo object keys.

**Filter system fields inside `diffSnapshots`.** Simpler call sites. Rejected
for the reason `src/lib/fields/system.ts` exists — a shared function that
silently drops rows cannot serve a caller that needs them.

**Hide `lifecycle` rows to match the documentation.** One `ne(logType,
'lifecycle')` and the code would agree with what three places claimed. Rejected:
they have been visible for over a month, an administrator may already rely on
seeing that a card was archived, and the documentation was simply wrong — the fix
belongs in the documentation.

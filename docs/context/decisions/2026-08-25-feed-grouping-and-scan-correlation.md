# ADR: Feed grouping at render, correlated by `metadata.scanLogId`

**Date**: 2026-08-25
**Status**: accepted
**Modules affected**: dashboard, history, actions, cards, presence

## Context

With presence control live, one operational scan writes a scan row plus one
action row per auto-action. A card type with presence and a visit counter emits
three rows for a single physical passage, and the activity feed reads as three
unrelated events. The operator wants one line: *this card was scanned, and here
is what that did.*

Grouping needs two things the codebase did not have: a way to know which action
rows a given scan caused, and a place to do the grouping.

Neither is obvious. `action_logs` had no correlation between a scan and the
actions it triggered — only `executed_at`, which is not enough (see below). And
the feed is built **twice**: server-side by `getActivityFeed`, client-side by
`feed-entries.ts`, a mirror that ADR `2026-07-17-dashboard-feed-no-polling`
already flags as duplicated knowledge that can drift.

## Decision

**Correlate with an explicit key, group at the presentation boundary.**

1. The scan pipeline captures the id of the scan row it just inserted and
   stamps it into every auto-action's `metadata.scanLogId`. `resumeAutoActionsAction`
   accepts that id back and stamps the same value, so a paused-then-resumed scan
   stays one group. Manual actions carry no `scanLogId`, and that absence is
   what identifies them.
2. **Neither builder groups.** `DashboardView` keeps holding raw rows,
   `prependEntries` is untouched, and `ActivityFeed` calls the pure
   `groupFeedRows` on whatever it was handed.

## Consequences

### Why a time window was rejected

The obvious cheap correlation is "action rows within N ms of a scan row". It
fails on the override path, which is not an edge case but a documented flow
(ADR `2026-03-15-allow-override-on-error`): the pipeline pauses, opens a modal,
and waits for a **human**. The resumed actions can land seconds or minutes after
the scan. Any window wide enough to catch them would also swallow unrelated
manual actions on the same card; any window narrow enough to be safe would split
every overridden scan. There is no correct N. Sequential auto-actions
(ADR `2026-03-09`) make it worse — the gap grows with the number of actions.

An explicit id has none of these failure modes and costs one jsonb key.

### Why the resume path had to change signature

This is the part that is easy to under-estimate. Correlating only the
non-paused path would have looked correct in every quick test and been wrong
exactly when an operator overrode something — the case where an audit surface
matters most. Making it right means the id survives a round trip through the
client: returned on `ScanWithAutoActionsResult`, held in `DashboardView` state
across the confirmation modal, and accepted back on `ResumeAutoActionsInput`.
Two Server Action signatures changed for one jsonb key, and that is the correct
trade.

### Why `executeAction` stayed generic

`executeAction` is the single chokepoint for **every** execution path — manual,
scan, resumed, external API — and per ADR `2026-07-09` it is deliberately a pure
read → compute → write → log primitive with a strategy seam. Teaching it what a
scan is would put caller-specific knowledge in the hot path every tenant runs
through.

Instead it gained `metadataExtra?: Record<string, unknown>`, merged into the log
row's metadata. It does not know what `scanLogId` means; the scan pipeline does.
The merge happens **before** the override flags, so a caller cannot overwrite
`operator_override` — a caller may annotate, never rewrite the audit verdict.

### Why grouping is at render, not in a builder

Implementing it in both builders would guarantee two divergent algorithms, and
the symptom would be nasty: a feed that silently regroups itself the moment the
operator presses Refrescar, because the server's rules and the client's had
drifted. One implementation at the presentation boundary is fed by both
producers and cannot disagree with itself.

**Accepted consequence: the tenant's configured feed limit counts RAW rows, so a
grouped feed can display fewer entries than the limit** — a scan with three
auto-actions consumes four of the budget and renders as one line. This is the
better behaviour (the limit bounds query work, not visual density) and is
recorded in `modules/dashboard.md`.

A second consequence: `buildScanEntries` now uses the real scan log id as the
client row's `id`, which removes half of the "client rows carry a throwaway
UUID" divergence that ADR `2026-07-17-dashboard-feed-no-polling` documented.
`executedAt` is still the client clock, so rows are still prepended, never
sorted.

### Why `isPresence` is derived at read time

The four surfaces that render "Entrada" / "Salida" — history table, CSV export,
feed badge, `PresenceControl` — need to know a row is a presence row. That is
computed in SQL by comparing the action's target field to
`card_types.presence_field_definition_id` (`isPresenceRowSql`), not stamped into
metadata at write time. Stamping would mean teaching the generic execution path
what presence is, which is exactly what `metadataExtra` exists to avoid.

**The degradation is real and accepted:** if a tenant later disables presence on
a card type, the designation goes NULL and that type's historical rows stop
being flagged, falling back to the action's name ("Presencia"). The rows remain
present and correct — they simply stop being labelled by direction. Honest
degradation, not data loss.

The label itself is derived in exactly one place (`presenceDirectionLabel`),
because four independent derivations of the same string reliably produce a table
and an export that disagree.

### Why manual grouping requires the same user

Two operators firing the same action on the same card are **two facts**. Merging
them into "×2" would erase who did what, which is the one thing an audit surface
must not do. The window is also a **chain** — each row measured against its
neighbour, not against the first row of the run — so a steady stream of clicks
keeps merging while a genuine pause splits the group.

### Why Salida is neutral, not red

`PresenceControl` sits directly beneath the "Acceso correcto" banner in
`ActiveCardZone`, which is green; the denial banner on that same surface is red.
A red "Salida" pill there reads as a **failed access** at a glance. Reusing
`--state-denied` for a legitimate exit would also load a reserved token with a
meaning it does not have, contrary to constraint #18. Salida active uses
`--state-info` (slate, the same "this happened, no verdict" token the feed's
scan icon uses, and for the same reason). Emphasis is carried by *which segment
is active*, not by alarm colour.

### Other consequences

- **No backfill, and none wanted.** Rows written before this change have no
  `scanLogId` and therefore never group; they render exactly as they do today.
  A backfill would have to guess correlation from timestamps — the very
  heuristic rejected above — and would write guesses into an audit log.
- `action_logs.metadata` now carries **two naming conventions**: `executeAction`
  writes snake_case (`action_type`, `after_value`, `operator_override`) while
  the scan pipeline writes camelCase (`method`, `cardCode`, and now `scanLogId`).
  Pre-existing; the new key follows the scan row's side. Well-known keys are
  declared in `src/lib/dal/metadata-keys.ts` so no layer spells one inline.
- `buildHistoryQuery` now **always** serializes `scans`, because with a
  tenant-dependent default, absence stopped having a single meaning. Five
  existing tests pinned the old "omit at default" contract and were updated.
- An auto-action whose scan has fallen past the feed limit renders standalone.
  It is never dropped — a grouping function that can lose rows is worse than no
  grouping.

## Alternatives considered

- **Time-window correlation.** Rejected — no correct window exists once the
  override flow can pause for a human. See above.
- **Group inside both builders.** Rejected: two algorithms over one contract,
  drifting silently, with "the feed rearranges itself on Refrescar" as the
  symptom.
- **Group only server-side and drop the client mirror.** That means a round trip
  per scan, undoing ADR `2026-07-17-dashboard-feed-no-polling` for a purely
  presentational gain.
- **A `scan_log_id` COLUMN on `action_logs`** rather than a metadata key.
  Cleaner to query and indexable, and worth revisiting if presence reporting
  ever needs to aggregate by scan. Rejected for now: it is a migration on the
  largest table in the schema to serve one render-time grouping, and the column
  would be NULL for every historical row anyway.
- **Stamp `isPresence` at write time.** Rejected — puts presence knowledge in
  the generic execution path, and would still be wrong for rows written before
  the feature existed.
- **Split the history presence filter into "Entrada" and "Salida".** Rejected as
  out of scope: it means filtering on jsonb plus a new filter dimension across
  the URL keys, the Zod schema, `buildWhere` and `sanitizeHistoryQuery`.
- **Keep the `Switch` and just relabel it.** Rejected: a switch has one label
  and an implied direction, so the operator must remember which way is "in". Two
  named segments state both.

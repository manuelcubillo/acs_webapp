# ADR: The feed limit counts groups, not raw rows

**Date**: 2026-08-25
**Status**: accepted
**Supersedes**: the "Accepted consequence" clause of
`2026-08-25-feed-grouping-and-scan-correlation.md` (that ADR's correlation key
and render-time grouping decisions stand unchanged)
**Modules affected**: dashboard

## Context

`2026-08-25-feed-grouping-and-scan-correlation.md` introduced grouping and
accepted a consequence: the tenant's `feedLimit` would keep counting **raw
rows**, so a grouped feed could show fewer entries than the number configured.
The stated justification was that "the limit bounds query work, not visual
density".

That justification does not survive contact with the setting it describes.
`FeedSettingsSection` labels the field:

```
LIMIT_LABEL: "Número de entradas a mostrar"
LIMIT_HINT:  "Entre 5 y 100. Las entradas más recientes aparecerán primero."
```

*Number of entries **to show***. Nothing in the UI presents it as a query
budget, and a tenant has no way to discover that it is one. Configuring 20 and
receiving 12 is not a documented trade — from the operator's side it is simply
wrong. A scan with three auto-actions spent four of the budget to render one
line; three repeated clicks spent three to render one "×3".

## Decision

**The limit counts what the operator sees, and is applied where the grouping
already happens.**

1. `feedLimit` is a **display** limit, in groups. `ActivityFeed` applies it:
   `groupFeedRows(entries).slice(0, feedLimit)`.
2. Producers no longer receive the display limit. They fetch a **raw-row
   budget** — `feedRawBudget(feedLimit)` — and hand `ActivityFeed` ungrouped
   rows as before. This covers both producers: `getActivityFeed`'s SQL `LIMIT`
   (via the dashboard page and `getActivityFeedAction`) and `prependEntries`'
   client-side trim.
3. `feedRawBudget(n) = min(n * 3, 100)`.

## Consequences

### Why the limit belongs at the render boundary

This is the previous ADR's own argument, carried one step further. It moved
grouping to the presentation boundary because the feed is built twice (server
DAL + client mirror) and two implementations would drift. Once grouping exists,
**the limit's meaning depends on grouping** — so a producer that has not grouped
yet is structurally incapable of applying it correctly. Neither builder knows
what a group is; only `ActivityFeed` does.

So the limit moves to sit beside the grouping, and the invariant "the limit
counts what is rendered" is enforced in one expression, in the one component
that renders. Nothing is duplicated: `groupFeedRows` is untouched and still has
exactly one implementation.

### Why over-fetching, and why 3×

Grouping compresses, so the number of raw rows needed to fill N groups is not
knowable before grouping. Three is the realistic worst case for one physical
passage: a scan, a presence toggle and a visit counter are three rows that
render as one line.

Over-fetching also disposes of a boundary artefact that would otherwise be
newly visible. Auto-actions execute **after** their scan and therefore carry a
later `executedAt`, so in newest-first order they sort **above** it — the scan
that anchors a group is the **oldest** row in it. Any cut through a group
orphans its auto-actions, which then render standalone (never dropped — see
`groupFeedRows`). The surplus rows push that artefact **below** the display cut,
where it is never seen.

### Why the cap is 100

`getActivityFeed` runs four queries off its row set, so the budget stays
bounded no matter what a tenant configures. 100 matches the existing maximum of
`ActivityFeedOptionsSchema.limit` and of the settings input, so no validation
changed.

The cap has a visible edge: at `feedLimit = 100` the budget **is** 100, giving
no headroom, and a heavily grouped feed can still show fewer than 100 entries.
That is the pre-existing behaviour, unchanged — this decision is never worse
than what it replaced, at any input, and is strictly better below ~33.

### Why not re-query until the groups fill

It is the only way to make the limit exact, and it is not worth it. Neon's HTTP
driver has no interactive transactions, so "fetch until N groups" is N
sequential round trips on a glanceable surface, with a pathological case (one
operator hammering one button) that never terminates early. A bounded
over-fetch that degrades honestly beats an unbounded loop that is exact.

### Other consequences

- `prependEntries`' third parameter is renamed `feedLimit` → `rawBudget`.
  Same type, different meaning; the rename is the point, since passing the
  display limit there is exactly the bug.
- `DEFAULT_FEED_LIMIT` now lives in `feed-grouping.ts` and is imported by
  `DashboardView`, `ActivityFeed` and the dashboard page, replacing three of the
  four hardcoded `20`s. The fourth is the DAL's own default in
  `dashboard-settings.ts`, left alone: it is the persistence-layer default, and
  a client module is the wrong place for the DB to read its fallback from.
- `ActivityFeed` needed no new prop — it already receives `settings`, which
  carries `feedLimit`.

## Alternatives considered

- **Group in the DAL and return `GroupedFeedEntry[]`.** Rejected: the client
  builds its own rows for scans it just performed, so it would have to merge
  locally-built rows *into* server-built groups — a fresh manual action may
  belong to the top group. Merging two grouped lists is strictly harder than
  grouping one raw list, and the previous ADR already rejected the variant that
  drops the client mirror (a round trip per scan).
- **Leave it and reword the setting** to say it counts events, not entries.
  Honest, but it makes the product worse to protect an implementation detail —
  and "how many entries do you want to see" is the question a tenant is actually
  asking.
- **A fixed raw budget** (say, always 100) rather than a multiple. Rejected:
  a tenant asking for 5 entries would pay a 100-row query for them.

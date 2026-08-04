# ADR: History view state lives in the URL, and card detail returns to it

**Date**: 2026-08-02
**Status**: accepted
**Modules affected**: history, cards

## Context

`/history` rows only linked their card code, and the filters, scan toggle and
page number lived exclusively in `ActionHistoryView`'s React state. Opening a
card therefore threw the query away: the operator came back — by the back link,
the browser's Back button, or the sidebar — to an unfiltered page 1 and had to
rebuild the filter set by hand, which for a field-level filter means picking the
card type, the field, an operator and a value again. `router.back()` would not
have helped: returning re-mounts the route, and with nothing in the URL the page
re-renders its default view. Card detail already had a back-link convention
(`?from=cards|archived`), but it only names a destination, not a state.

## Decision

`/history` puts its complete view state in the query string (`df`, `dt`, `ct`,
`act`, `user`, `code`, `ff`, `scans`, `page`), parsed server-side so the first
render is already the filtered result set and mirrored back with
`history.replaceState` as the operator works. A row navigates to
`/cards/[code]?from=history&hq=<that query>`, and the detail page's back link
rebuilds `/history` from `hq` after passing it through
`sanitizeHistoryQuery` — a parse-then-build round trip that emits only known
keys. Scroll offsets are deliberately NOT in the URL: they go to `sessionStorage`
keyed by the query they were taken under, written when a row navigates away and
consumed once on the way back.

## Consequences

- **Positive:** a filtered history is shareable, reloadable and survives the
  round trip through a card. Returning restores the filters, the page, the scan
  toggle and the scroll offset.
- **Positive:** the server renders the requested page directly — arriving with
  filters costs one query, not an unfiltered query plus a corrective refetch.
- **Positive:** the back link can only ever point at `/history` with validated
  parameters, whatever `hq` contains.
- **Negative / trade-offs:** the filter shape now has a second representation
  (query keys) alongside the Zod schema at the Server Action boundary. A new
  filter dimension must be added in both, or it silently stops surviving
  navigation. `parseHistoryParams` is the place that has to stay lenient — it
  reads a URL anyone can type, so it drops what it cannot validate instead of
  throwing.
- **Negative / trade-offs:** `replaceState` means the browser's Back button
  leaves `/history` entirely rather than stepping back through filter changes.
  Chosen over `pushState`, which would bury the previous page under one entry per
  tweak.
- **Follow-ups:** `/cards` already keeps `?status` in the URL by the same
  `replaceState` mechanism but keeps its card-type, search and field filters in
  state; it could adopt this module wholesale. Leaving card detail for its edit
  page still drops `hq`.

## Alternatives considered

- **Snapshot the view state in `sessionStorage`** and restore it on mount. Less
  serialization code, but not shareable or reloadable, awkward across tabs, and
  the server would still render an unfiltered page 1 first — a visible flash and
  a wasted query on every return.
- **`router.back()` from the card detail.** Cheapest possible change, but it
  restores nothing (the route re-mounts with default state), and on a card
  opened directly it navigates out of the app.
- **Spread the history filters as top-level params on the card detail URL.**
  Rejected: `code` there means the card, and the detail page would carry
  parameters that say nothing about it. One opaque `hq` blob keeps the two
  namespaces apart.
- **Put the scroll offset in the URL too.** Rejected: it is per-visit, changes on
  every wheel tick, and is meaningless in a shared link.

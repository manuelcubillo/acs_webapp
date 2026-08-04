# ADR: Card list view state lives in the URL, and the card detail (and its editor) return to it

**Date**: 2026-08-02
**Status**: accepted
**Modules affected**: cards, history

## Context

`/cards` kept only `?cardTypeId`, `?q` and `?status` in the URL, and only the
first two were ever read back — the card-type multi-select, the field filters,
the view mode and the page number lived exclusively in `CardList`'s React state.
Opening a card therefore threw the view away: the operator came back to an
unfiltered page 1, in table view, at the top, and had to rebuild a field filter
by picking the card type, the field, an operator and a value again. Going on to
the edit page made it worse — the editor redirected to a bare `/cards/[code]`,
so even the `?from=` origin was gone and the detail's back link pointed at the
dashboard.

`/history` had solved exactly this a day earlier
(`2026-08-02-history-url-state-and-return.md`), and that ADR listed both gaps as
follow-ups.

## Decision

Apply the same mechanism, and share its parts rather than copy them.

`/cards` puts its complete view state in the query string — `ct` (comma-separated
card types), `q`, `status`, `ff` (JSON field filters), `view`, `page` — parsed
server-side so the first render is already the requested result set, and
mirrored back with `history.replaceState` as the operator works. The legacy
`?cardTypeId=` deep link is still honoured when `ct` is absent.

The origin params moved into one module, `src/lib/cards/return-origin.ts`: the
lists build `cardDetailHref(code, origin, viewQuery)`, the detail and edit pages
read it back with `resolveCardOrigin`. The card detail forwards the origin to
its Edit link, and the editor returns to the detail with it intact on both save
and cancel, so a round trip through the editor no longer breaks the back link.
Archiving redirects to the operator's filtered list rather than to `/cards`.

Three pieces are now shared with `/history`:
`src/lib/navigation/query-codec.ts` (the defensive readers — one definition of
what a valid id, page or field filter looks like in a URL),
`src/lib/navigation/return-scroll.ts` (the one-shot query-keyed scroll memory),
and `cardDetailHref` / `resolveCardOrigin` for the params themselves.

Scroll restoration had to be reworked to be real. Two things were wrong: the
offset was read from `window.scrollY`, which is permanently 0 because
`DashboardShell` scrolls an inner `<main>` (now tagged
`data-slot="page-scroll"`); and a single assignment does not survive the App
Router's post-navigation scroll reset, nor a list whose rows are still arriving.
`restorePageScroll` applies the offset at once and then re-applies it each frame
until it has held for a few frames or a 2s timeout, cancelling on any real
scroll input.

## Consequences

- **Positive:** a filtered card list is shareable, reloadable, and survives the
  round trip through a card detail *and* its editor. Returning restores the card
  types, search, status, field filters, view mode, page and scroll offset.
- **Positive:** the server renders the requested page directly — arriving with
  filters costs one query, not an unfiltered query plus a corrective refetch.
- **Positive:** the card-type selection now survives a reload at all; before,
  only a single type could be expressed and only as a deep link.
- **Positive:** the history feature got the same two fixes for free — its page
  offset was being read from the window (always 0) and applied once.
- **Negative / trade-off:** as on `/history`, the filter shape now has a second
  representation (query keys) alongside `SearchCardsSchema`. A new filter
  dimension must be added in both or it silently stops surviving navigation.
- **Negative / trade-off:** `restorePageScroll` defends the offset for up to 2s.
  It cancels on wheel/touch/keydown, but a programmatic scroll from elsewhere
  during that window would be overridden.
- **Negative / trade-off:** `CardList` now holds its view as one state object.
  Every control must go through `commit`, which is what keeps the URL, the fetch
  and the row links in agreement — a stray `setState` would desynchronise them.
- **Follow-ups:** `/archived` links to card details without an origin, so a card
  opened from the trash returns to `/archived` but not to any state within it.

## Alternatives considered

- **Duplicate the history parsing helpers into a cards module.** Rejected: two
  copies of a sanitizer that guards what reaches a Server Action boundary is
  exactly the thing that drifts. The shared codec is imported by both.
- **Keep the individual `useState`s in `CardList` and add a `syncUrl` call to
  each handler.** Smaller diff, but seven handlers each had to remember to
  update the URL, refetch, and reset the page — the combination that was already
  being got wrong (the card-type toggle relied on a `hasMounted` effect to
  refetch). One state object plus one `commit` removes the whole class.
- **`scroll={false}` on the back link** so the router does not reset the scroll
  position. Rejected: it also removes the reset when there is *nothing* to
  restore, so a return to a re-filtered list would open at whatever offset the
  detail page happened to be at.
- **Store the scroll offset in the URL.** Rejected for the same reason as on
  `/history`: it is per-visit, changes on every wheel tick, and is meaningless
  in a shared link.

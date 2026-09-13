# ADR: Card photo URLs carry a card-level version token, and cache for days

**Date**: 2026-09-08
**Status**: accepted
**Modules affected**: infrastructure, cards, dashboard, history, presence, fields

## Context

`2026-07-17-stable-photo-routes.md` made `/api/photos/cards/[code]` stable per
card so the browser could cache thumbnails. Stability solved expiry but created
its mirror image: a URL that never changes cannot express that the photo behind
it changed. Replacing a card's photo writes a new object key to the database,
yet the `<img src>` string is identical, so a browser holding a fresh cached
`302` keeps painting the old image.

Two knobs bounded that staleness, and they were coupled: the redirect's
`max-age` (600s) had to stay below the signature TTL (900s), or a replayed
redirect would point at a dead signature and 403. So the worst-case delay
before an edited photo appeared was tied to how long we were willing to cache
— and the only way to cache longer was to accept staler photos.

Nothing set `Cache-Control` on the object bytes at all, so the image response
fell back to undefined heuristic caching on top of that.

## Decision

Callers append a version token to the route's URL — `?v=<epoch seconds>` built
from **`cards.updated_at`**, via a new `updatedAt` option on `cardPhotoRoute`.
An edit yields a new URL and therefore a guaranteed cache miss, which decouples
freshness from cache lifetime. With the two concerns independent, the route
(and only the route) signs with a 7-day TTL — the SigV4 ceiling — caches its
redirect for 6 days, and asks the object store for
`private, max-age=604800, immutable` on the bytes.

The token is card-level, not the photo field's own `field_values.updated_at`.

## Consequences

- **Positive:** an edited photo appears immediately, on any surface, with no
  hard refresh — and unchanged photos stop being re-fetched at all.
- **Positive:** the invalidation profile falls out of where `cards.updated_at`
  is written. Only `src/lib/dal/cards.ts` touches it (`updateCard`,
  `renameCard`, create); action execution writes `field_values` directly and
  never bumps it. So scans and presence toggles — the high-frequency
  operational traffic — never invalidate a photo, while an edit always does. A
  photo can only change through `updateCard`, so the token can never
  under-invalidate.
- **Positive:** every surface that renders a photo already holds the card
  (`Card = InferSelectModel<typeof cards>` carries `updatedAt`, and
  `CardWithFields extends Card`), and the three DAL queries that build photo
  URLs already join `cards`. Threading it cost one column and one argument per
  site, with no new query and no type change outside `ActionHistoryEntry`.
- **Negative / trade-offs:** over-invalidation. Editing any non-photo field
  changes the photo URL too, costing one re-fetch. Deliberate: the alternative
  risks under-invalidation, which is silent and wrong rather than merely
  wasteful.
- **Negative:** the "`max-age` must stay below the signature TTL" rule from
  `2026-07-17-stable-photo-routes.md` still holds and is now load-bearing at a
  much larger scale — both constants live in `route.ts` and must move together.
  The download path was already violating the spirit of it (it inherited the
  15-minute default while sharing the redirect's `Cache-Control`); it now takes
  the same explicit TTL.
- **Follow-ups:** the shared `DEFAULT_READ_TTL` / `DEFAULT_TTL_SECONDS` stay at
  15 minutes. Every other caller of `signPhotoForRead` hands the signed URL
  straight to a client as a bearer token; only this route keeps it behind a
  same-origin redirect, so only this route may hold one for a week.

## Alternatives considered

- **Version by `field_values.updated_at`** (the photo field's own timestamp).
  More precise — it would not invalidate on an unrelated field edit. Rejected:
  it forces "which photo field is the primary one" to be resolved in
  `presence.ts` and `activity-feed.ts`, duplicating the rule that lives in
  `route.ts`. When those drift, the wrong URL is busted and the failure is
  silent. Precision was not worth a second copy of a rule.
- **Deterministic signatures** (round `signingDate` to a bucket so the signed
  URL is byte-identical within a window, letting the redirect go uncached).
  Needs no version plumbing at all and busts correctly by construction, since
  the key *is* the version. Rejected: it re-downloads every image once per
  bucket period and costs a function invocation per image per page load, where
  the token costs neither.
- **Raise only the TTLs.** Rejected outright: it does not touch staleness, and
  makes it worse in exact proportion to the caching gained.

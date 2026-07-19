# ADR: Serve card photos through a stable app route, not a signed URL

**Date**: 2026-07-17
**Status**: accepted
**Modules affected**: infrastructure, dashboard

## Context

Since `2026-04-27-photo-storage-r2-minio.md`, photo object keys are resolved to
short-lived signed URLs "at render time". A signed URL embeds `X-Amz-Date` and a
signature over it, so signing the same object twice yields two different strings.

That has two consequences nobody had priced in. The browser caches on the full
URL, so a surface that re-renders re-downloads every thumbnail: the dashboard
feed re-signed 20 photos every 15s poll, ~1MB per poll per open dashboard, and
none of it cache-hit. And the URL dies with its 15-minute TTL, so any surface
that stops re-signing shows broken images — which blocked removing the feed's
polling (see `2026-07-17-dashboard-feed-no-polling.md`).

A signed URL is also a bearer token: whoever holds the string reads the object,
with no identity check. Its short TTL was the only thing limiting leakage.

## Decision

Card photos are served by `GET /api/photos/cards/[code]` — session-authenticated
(OPERATOR+), which signs per request and answers `302` to the signed storage URL.
The route's own URL is stable per card. The DB still stores object keys and the
storage layer still mints short-lived signatures; only the client-facing address
changes.

## Consequences

- **Positive:** thumbnails cannot expire client-side — the signature is minted
  per request. The `<img src>` is stable, so the browser caches the image
  instead of re-fetching it whenever a URL is re-signed.
- **Positive:** the URL is an identifier, not a capability. Leaking
  `/api/photos/cards/A-1042` leaks nothing without a session for the owning
  tenant, unlike a leaked signed URL. Confidentiality improves.
- **Positive:** bytes still travel bucket → browser directly. The route only
  signs and redirects; it never proxies the payload through the function.
- **Negative:** it is the first session-authenticated route under `/api`, which
  until now meant "external device access" only. It deliberately does not live
  under `/api/cards/[code]` (the `x-tenant-id` external API): two auth models in
  one route tree is how cross-tenant mistakes get made.
- **Negative:** one extra hop per uncached image, and correctness now depends on
  two headers. `Cache-Control: private` is load-bearing — a shared cache holding
  one tenant's redirect and serving it to another would be a cross-tenant leak.
  `max-age` must stay below the signature TTL so a reused redirect never points
  at a dead signature.
- **Follow-ups:** only the feed uses this. `ActiveCardZone`, card detail, card
  lists and the external API still embed signed URLs — correct for them today
  (short-lived surfaces, or non-browser callers), but any surface that grows a
  long-lived open tab will hit the same expiry wall and should move here.

## Alternatives considered

- **Raise the signature TTL to hours.** Fixes expiry, not caching, and weakens
  the property the short TTL exists to provide.
- **Proxy the bytes through the route.** Simpler caching story, but every
  thumbnail would burn function time and billed egress.
- **Put the object key in the route path.** Rejected: `storage/read.ts` states
  keys are never exposed to client components. The card `code` is already the
  sanctioned public identifier and is naturally tenant-scoped by the session.

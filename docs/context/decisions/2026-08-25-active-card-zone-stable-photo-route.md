# ADR: `ActiveCardZone` photo cell moves to the stable photo route

**Date**: 2026-08-25
**Status**: accepted
**Modules affected**: dashboard, cards

## Context

The last-scanned-card panel's photo cell (`ActiveCardZone` → `SummaryCell`)
rendered the photo field's raw value directly as an `<img src>`. That only
produces a real image when the value is a signed read URL, which
`executeScanWithAutoActionsAction` and `resumeAutoActionsAction` both arrange
via `signCardPhotos` before returning the card — but `getCardByCodeAction`,
which `DashboardView.executeAndRefresh` calls to refresh `activeCard` after a
manual action, does not sign photos. The panel kept the previous scan's fields
except for the photo, which silently reverted to a raw storage object key
`<img>` cannot load — so the photo disappeared the moment an operator
executed a manual action (e.g. "Entrada invitado") on the scanned card.

The ADR `2026-08-04-active-card-summary-grid.md` and `modules/dashboard.md`
both documented the embedded-signed-URL approach as deliberate ("correct
there — short-lived surface, refreshed by every scan"), on the assumption that
every mutation of `activeCard` was a scan. `executeAndRefresh` broke that
assumption without anyone touching the photo cell itself.

The rest of the app (card detail, activity feed, history, presence) already
solved the general version of this problem: `cardPhotoRoute(cardCode, {
fieldDefinitionId })` → `/api/photos/cards/[code]`, which 302s to a
freshly-signed URL per request (ADR `2026-07-17-stable-photo-routes.md`),
wrapped by the reusable `PhotoRenderer` component. `ActiveCardZone` was the one
surface still hand-rolling its own `<img>` instead of reusing it.

## Decision

`SummaryCell`'s photo branch now renders `PhotoRenderer` with `cardCode` +
`fieldDefinitionId` (stable-route mode) instead of an `<img src={value}>`.
`activeCard`'s photo field value is no longer read as a URL on this panel — it
is presence-only, same as everywhere else `PhotoRenderer` is used.

`PhotoRenderer` moved from `src/components/cards/renderers/` to
`src/components/shared/` (constraint #24: it is now consumed by both `cards`
and `dashboard`) and gained an optional `className` to override its default
thumbnail sizing, needed for the panel's two-row "tall" photo cell.

## Consequences

- **Positive:** the panel's photo now renders correctly regardless of which
  path last populated `activeCard` — scan, resume, or manual-action refresh —
  with no per-path signing to remember. Removes an entire class of "forgot to
  re-sign" bugs for any future refresh path.
- **Positive:** also fixes a latent second bug on the scan path itself — a
  signed URL has a 15-minute TTL, so a card left on screen without a further
  scan would eventually show a broken photo even before this fix.
- **Negative / trade-offs:** none functionally; `signCardPhotos` /
  `signScanResultPhotos` (`src/lib/actions/cards.ts`) are now redundant for
  this specific panel's rendering — left in place because the external API
  route and the card detail server page still consume them directly.
- **Follow-ups:** `modules/dashboard.md`'s "ActiveCardZone still renders signed
  URLs embedded in the scanned card... correct there" note is superseded by
  this ADR.

## Alternatives considered

- **Sign photos in `getCardByCodeAction` too**, matching the scan/resume paths.
  Rejected: keeps the "must remember to sign on every path that touches
  `activeCard`" footgun alive for the next refresh path someone adds, and
  still carries the 15-minute TTL staleness risk the stable route avoids.

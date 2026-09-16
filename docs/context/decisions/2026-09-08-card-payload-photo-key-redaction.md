# ADR: Every card payload crossing to a client component redacts photo keys

**Date**: 2026-09-08
**Status**: accepted
**Modules affected**: cards, dashboard, fields

## Context

`2026-07-17-stable-photo-routes.md` and `2026-08-02-card-list-photos-stable-route.md`
both state that a photo object key is never client-facing, and both rejected
putting keys in the route path for that reason. `stripCardListPhotoKeys`
enforced it — but only on the three card-**list** producers.

Single-card payloads were left to their own devices, and the three that exist
had drifted apart. `executeScanWithAutoActionsAction` and
`resumeAutoActionsAction` signed their photos via `signScanResultPhotos`, from
when `ActiveCardZone` read the value as an `<img src>`.
`getCardByCodeAction` — the manual-action refresh path added later — did
neither, and shipped the raw key to the browser.

`2026-08-25-active-card-zone-stable-photo-route.md` had already removed the
reason to sign: the panel moved to `cardPhotoRoute` and treats the value as
presence-only. It named the remaining `signScanResultPhotos` call redundant and
left it in place. That left three paths producing the same payload with three
different photo-value meanings — a signed URL, a raw key, or nothing — which is
precisely the footgun that ADR set out to remove.

## Decision

`stripCardPhotoKeys(card)` is the single redaction every action returning a
card to a client component applies; `stripCardListPhotoKeys` becomes a map over
it. All three single-card paths now use it, and `signScanResultPhotos` is gone.

`signCardPhotos` survives for the two consumers that genuinely need a URL and
are not client components: the card-design preview renderer
(`/cards/[code]/page.tsx`, which reads `f.value` as a signed URL) and the
external API (`/api/cards/[code]`, a non-browser caller).

## Consequences

- **Positive:** closes the key leak on `getCardByCodeAction`, and removes the
  bearer-token URLs the two scan paths were shipping to a client that stopped
  reading them.
- **Positive:** one rule replaces three per-path conventions. A photo value
  reaching a client component now means "there is a photo" everywhere, with no
  path-specific exception to remember.
- **Negative / trade-offs:** the photo value's type is now `boolean` on client
  payloads where it used to be a URL string. `feed-entries.ts` was reading it
  as `typeof f.value === "string"` and silently dropped every feed thumbnail
  under the new shape; it now tests truthiness. Any future reader of a photo
  value must do the same.
- **Follow-ups:** `signCardPhotos`'s two remaining callers are both server-side.
  If either ever moves to the stable route, the helper can go and photo keys
  will never leave the DAL at all.

## Alternatives considered

- **Sign in `getCardByCodeAction` too**, matching the scan paths. Rejected for
  the reason `2026-08-25` gave when it rejected the same option: it keeps alive
  the "remember to sign on every path" footgun, and hands the client a
  bearer-token URL it has no use for.
- **Redact inside the DAL** (`getCardByCode`) so no caller can forget.
  Rejected: the DAL is the unfiltered source of truth, and the photo route and
  the design renderer both need the real key from it. Same reasoning as
  constraint #27's "filter at each consumer, never inside the DAL read".

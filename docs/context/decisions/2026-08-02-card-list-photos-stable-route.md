# ADR: Card lists address photos by stable route and never receive object keys

**Date**: 2026-08-02
**Status**: accepted
**Modules affected**: cards, fields, infrastructure

## Context

`2026-07-17-stable-photo-routes.md` moved the dashboard feed to
`GET /api/photos/cards/[code]` and listed card lists as a follow-up that "should
move here". They never did, and the gap produced a bug.

`/cards/page.tsx` signed photo keys server-side via `signCardListPhotos`, but
`searchCardsAction` — which `CardList` calls on every card-type filter change,
code search, status filter, field filter, pagination and view toggle — returned
the DAL rows untouched. So the first render showed photos and every client-side
refetch replaced them with raw object keys. The browser resolved a key
(`<tenantId>/cards/<cardId>/<uuid>.webp`) as a relative URL, requested
`/cards/<tenantId>/cards/…`, and rendered a broken image; a reload restored it
by re-running the server component. The same surface also sat behind the expiry
wall the earlier ADR described: even correctly signed URLs die after 15 minutes.

## Decision

Card list surfaces (`CardTableView`, `CardProfileView`, through `PhotoRenderer`)
build the `<img src>` from the card `code` + `field_definition_id` via
`cardPhotoRoute`, instead of consuming a URL carried in the payload. Because the
address is derived rather than transported, list producers stop signing:
`stripCardListPhotoKeys` replaces each photo value — and its `raw.value_text` —
with a boolean presence flag at all three producers (`/cards/page.tsx`,
`searchCardsAction`, `listCardsAction`).

## Consequences

- **Positive:** thumbnails survive every client-side refetch and cannot expire
  in place. Nothing needs re-signing, because nothing transports a URL.
- **Positive:** the browser caches on a stable URL, so toggling filters reuses
  cached images instead of re-downloading them.
- **Positive:** object keys no longer reach the browser on list surfaces,
  restoring the rule stated in `src/lib/storage/read.ts`. Both `value` and
  `raw.value_text` are redacted — redacting only `value` leaves the key in the
  untouched `field_values` row that `raw` carries.
- **Positive:** drops roughly one signature per photo per list render.
- **Negative:** one extra hop per uncached image, and each hop runs
  `getCardByCode`. A 50-row page with 50 distinct photos costs 50 lookups on a
  cold cache, against one batched signing pass before. Browser per-origin
  connection limits throttle this in practice and `max-age=600` absorbs repeat
  views, but a much wider list would need a batch endpoint.
- **Negative:** `PhotoRenderer` now has two addressing modes, and `value` means
  "is there a photo" in one and "here is the URL" in the other.
- **Follow-ups:** `CardDetailClient` already passed `cardCode` +
  `fieldDefinitionId` (added for the download button), so card detail moved to
  the route with this change; its `signCardPhotos` call now only produces a
  presence signal and could be dropped. `ActiveCardZone` / scan results and the
  external API still embed signed URLs — correct for them today (short-lived
  surface, non-browser caller).

## Alternatives considered

- **Sign inside `searchCardsAction` / `listCardsAction`**, mirroring
  `signScanResultPhotos`. The smallest fix, and it would have stopped the broken
  images. Rejected: it keeps the 15-minute expiry, re-signs on every refetch,
  keeps busting the browser cache, and keeps handing the client a bearer-token
  URL.
- **Put the object key in the route path.** Rejected for the reason given in the
  2026-07-17 ADR: keys are not client-facing, and the card `code` is already the
  sanctioned public identifier.
- **Pass the merged column id as `?field=`.** Rejected: a display column can
  merge fields from several card types (`mergeFieldColumns`), so the column id is
  not the card's own `field_definition_id`. Every card outside the column's
  representative type would 404.

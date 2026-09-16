/**
 * Storage Layer — Stable in-app photo URLs
 *
 * Signed storage URLs embed a timestamp and signature, so signing the same
 * object twice yields two different strings. That makes them useless as an
 * `<img src>` on a surface that re-renders: the browser cache keys on the full
 * URL, so every render re-downloads the image, and the URL dies with its TTL.
 *
 * These routes are stable per card. The signature is minted server-side per
 * request and never reaches the client, so the browser caches the thumbnail and
 * it cannot expire in place.
 *
 * Stability cuts both ways, though: a URL that never changes cannot express
 * that the photo behind it did. That is what the `updatedAt` version token is
 * for — see `CardPhotoRouteOptions`.
 *
 * Deliberately dependency-free: imported from both the DAL and client
 * components, so it must not pull in anything `server-only`.
 */

export interface CardPhotoRouteOptions {
  /**
   * Target one specific photo field. Required on multi-photo cards and on any
   * list that merges columns across card types, where the same display column
   * maps to a different `field_definition_id` per card. Omit for the card's
   * primary photo (its lowest-position photo field holding a value).
   */
  fieldDefinitionId?: string;
  /** Serve the object as a named attachment instead of rendering it inline. */
  download?: boolean;
  /**
   * Cache-busting version token — pass the card's `updatedAt`.
   *
   * The route's URL is stable per card, which is what makes it cacheable and
   * is also why a replaced photo would otherwise stay invisible: the object
   * key changes in the database but the `<img src>` string does not, so a
   * browser holding a fresh cached redirect keeps painting the old image until
   * that entry ages out. Folding `updatedAt` into the URL makes an edit a new
   * URL, hence a guaranteed miss, which is what lets the redirect and the
   * bytes both be cached for days instead of minutes.
   *
   * Card-level on purpose, not the photo field's own timestamp: every surface
   * that renders a photo already holds the card, and resolving "which photo
   * field is the primary one" a second time outside the route is how the two
   * rules drift apart and silently bust the wrong URL. The cost is
   * over-invalidation — editing any field re-fetches the photo once — which is
   * far cheaper than the under-invalidation the other way round risks.
   *
   * Never the object key: keys are not client-facing (ADRs
   * `2026-07-17-stable-photo-routes.md`, `2026-08-02-card-list-photos-stable-route.md`).
   */
  updatedAt?: Date | string | number;
}

/**
 * Epoch seconds for the version token, or null when the input carries no
 * usable date. Seconds rather than millis: three characters shorter per URL,
 * and `updated_at` is never bumped twice within one second in a way a cache
 * could observe.
 *
 * Lenient by design — this runs on values that have crossed a server/client
 * serialization boundary, so a `Date`, an ISO string and an epoch number all
 * reach it. An unparseable value degrades to "no token", which is the old
 * behaviour, never a thrown render.
 */
function versionToken(value: Date | string | number): string | null {
  const ms =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : new Date(value).getTime();
  return Number.isFinite(ms) ? String(Math.floor(ms / 1000)) : null;
}

/**
 * Route serving a card's photo. Session-authenticated — see
 * `src/app/api/photos/cards/[code]/route.ts`.
 *
 * @param code - Public card code, unique per tenant.
 * @param options - Field selector, download flag and cache-busting version.
 */
export function cardPhotoRoute(
  code: string,
  options: CardPhotoRouteOptions = {},
): string {
  const params = new URLSearchParams();
  if (options.fieldDefinitionId) params.set("field", options.fieldDefinitionId);
  // Read by the browser's cache, never by the route — it always resolves the
  // live key from the database, whatever `v` says.
  if (options.updatedAt !== undefined) {
    const v = versionToken(options.updatedAt);
    if (v) params.set("v", v);
  }
  // Valueless flag on the route's side (`searchParams.has`), so an empty value
  // is enough — it serialises to `download=`.
  if (options.download) params.set("download", "");
  const query = params.toString();
  return `/api/photos/cards/${encodeURIComponent(code)}${query ? `?${query}` : ""}`;
}

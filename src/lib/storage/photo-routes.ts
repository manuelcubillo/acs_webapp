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
}

/**
 * Route serving a card's photo. Session-authenticated — see
 * `src/app/api/photos/cards/[code]/route.ts`.
 *
 * @param code - Public card code, unique per tenant.
 * @param options - Field selector and download flag.
 */
export function cardPhotoRoute(
  code: string,
  options: CardPhotoRouteOptions = {},
): string {
  const params = new URLSearchParams();
  if (options.fieldDefinitionId) params.set("field", options.fieldDefinitionId);
  // Valueless flag on the route's side (`searchParams.has`), so an empty value
  // is enough — it serialises to `download=`.
  if (options.download) params.set("download", "");
  const query = params.toString();
  return `/api/photos/cards/${encodeURIComponent(code)}${query ? `?${query}` : ""}`;
}

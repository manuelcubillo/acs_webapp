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

/**
 * Route serving a card's primary photo (its lowest-position active photo
 * field). Session-authenticated — see `src/app/api/photos/cards/[code]/route.ts`.
 *
 * @param code - Public card code, unique per tenant.
 */
export function cardPhotoRoute(code: string): string {
  return `/api/photos/cards/${encodeURIComponent(code)}`;
}

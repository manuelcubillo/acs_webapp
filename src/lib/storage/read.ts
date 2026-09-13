/**
 * Storage Layer — Read URL helpers
 *
 * Server-side only. Used by server components and DAL fetchers to convert
 * a stored object key into a short-lived signed URL right before rendering.
 *
 * Never expose raw keys to client components — always sign on the server.
 */

import { getPhotoStorage } from "./index";

/** 15 minutes — long enough for a page session, short enough to limit leakage. */
const DEFAULT_TTL_SECONDS = 900;

/**
 * @param opts.responseCacheControl - `Cache-Control` the store returns with the
 * bytes. Only worth setting for a caller whose signed URL is stable across
 * requests; a URL re-minted per render is a new cache key every time, so a
 * long directive on it buys nothing. Today that is the stable photo route
 * (`/api/photos/cards/[code]`), which mints a fresh signature per request but
 * keys it on an object that never changes in place.
 */
export async function signPhotoForRead(
  key: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
  opts?: { responseCacheControl?: string },
): Promise<string> {
  return getPhotoStorage().getReadUrl(key, {
    ttlSeconds,
    ...(opts?.responseCacheControl
      ? { responseCacheControl: opts.responseCacheControl }
      : {}),
  });
}

export async function signPhotoForReadOptional(
  key: string | null | undefined,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string | null> {
  if (!key) return null;
  return signPhotoForRead(key, ttlSeconds);
}

/**
 * Sign a key as an attachment download: the resulting URL forces the browser
 * to save the file under `filename` (via `Content-Disposition`) instead of
 * rendering it inline.
 */
export async function signPhotoForDownload(
  key: string,
  filename: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  return getPhotoStorage().getReadUrl(key, {
    ttlSeconds,
    downloadFilename: filename,
  });
}

/**
 * Sign many keys in parallel. De-duplicates by key so a single signature
 * is shared across multiple references (common when a list of cards has
 * repeated photo keys).
 */
export async function signPhotosForRead(
  keys: ReadonlyArray<string | null | undefined>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(keys.filter((k): k is string => typeof k === "string" && k.length > 0)),
  );
  const signed = await Promise.all(
    unique.map(async (k) => [k, await signPhotoForRead(k, ttlSeconds)] as const),
  );
  return new Map(signed);
}

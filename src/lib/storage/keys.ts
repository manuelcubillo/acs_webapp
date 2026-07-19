/**
 * Storage Layer — Object Key Builder
 *
 * Layout: `<tenantId>/<kindPath>/<ownerId>/<random>.<ext>`
 *
 * The tenant prefix is the security primitive. `validation.ts` refuses any
 * read/confirm whose key is outside the caller's tenant prefix.
 */

import { KIND_PATH, type PhotoKind, type AllowedOutputMime } from "./types";

const EXT_BY_MIME: Record<AllowedOutputMime, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function extensionForMime(mime: AllowedOutputMime): string {
  return EXT_BY_MIME[mime];
}

export interface BuildKeyArgs {
  kind: PhotoKind;
  tenantId: string;
  /** Owner UUID: cardId, designId, userId, or tenantId (logo). */
  ownerId: string;
  mime: AllowedOutputMime;
}

export function buildObjectKey({
  kind,
  tenantId,
  ownerId,
  mime,
}: BuildKeyArgs): string {
  const random = crypto.randomUUID();
  const ext = extensionForMime(mime);
  return `${tenantId}/${KIND_PATH[kind]}/${ownerId}/${random}.${ext}`;
}

/** Returns the prefix that must guard a tenant's reads. */
export function tenantPrefix(tenantId: string): string {
  return `${tenantId}/`;
}

/**
 * Slugify an arbitrary label (a card code or a field name) into a filename-safe
 * token: ASCII-fold accents, drop anything but `[a-z0-9]`, collapse to single
 * hyphens. Never empty — falls back to `foto`.
 */
function slugifyForFilename(input: string): string {
  const slug = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "foto";
}

/**
 * Human-readable download filename for a card photo:
 * `<code>_<fieldName>_<random>.<ext>`.
 *
 * The `<random>` and `<ext>` are lifted verbatim from the stored object key's
 * final segment so a downloaded file can be traced straight back to its object
 * in the bucket (the storage key itself keeps its random UUID). `<fieldName>`
 * disambiguates cards that carry more than one photo field.
 */
export function buildCardPhotoDownloadFilename(args: {
  code: string;
  fieldName: string;
  key: string;
}): string {
  const lastSegment = args.key.split("/").pop() ?? "";
  const dot = lastSegment.lastIndexOf(".");
  const random = dot > 0 ? lastSegment.slice(0, dot) : lastSegment;
  const ext = dot > 0 ? lastSegment.slice(dot + 1) : "webp";
  return `${slugifyForFilename(args.code)}_${slugifyForFilename(
    args.fieldName,
  )}_${random}.${ext}`;
}

/**
 * Returns true iff `key` is under the given tenant's prefix and matches
 * the kind's path segment.
 */
export function keyMatches(
  key: string,
  expected: { tenantId: string; kind: PhotoKind },
): boolean {
  const parts = key.split("/");
  if (parts.length < 4) return false;
  return parts[0] === expected.tenantId && parts[1] === KIND_PATH[expected.kind];
}

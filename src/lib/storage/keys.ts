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

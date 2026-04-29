/**
 * Storage Layer — Types
 *
 * Single interface for photo object storage. Implemented by `R2Storage`
 * (production) and `MinIOStorage` (self-hosted / local). The factory in
 * `index.ts` picks one at runtime via `STORAGE_DRIVER`.
 *
 * Object keys are tenant-prefixed; `validation.ts` enforces that any read
 * or confirm refers to a key under the caller's tenant.
 */

export const PHOTO_KINDS = [
  "card-photo",
  "card-design-image",
  "member-avatar",
  "tenant-logo",
] as const;

export type PhotoKind = (typeof PHOTO_KINDS)[number];

/** Maps a kind to the path segment used inside the tenant prefix. */
export const KIND_PATH: Record<PhotoKind, string> = {
  "card-photo": "cards",
  "card-design-image": "card-designs",
  "member-avatar": "members",
  "tenant-logo": "branding",
};

/** Allowed input MIME types accepted by the upload pipeline. */
export const ALLOWED_INPUT_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type AllowedInputMime = (typeof ALLOWED_INPUT_MIME)[number];

/** Output MIME types we ever store. Optimization always normalises to one of these. */
export const ALLOWED_OUTPUT_MIME = [
  "image/webp",
  "image/jpeg",
  "image/png",
] as const;

export type AllowedOutputMime = (typeof ALLOWED_OUTPUT_MIME)[number];

export interface UploadUrlRequest {
  /** Object key under which the upload will be persisted. */
  key: string;
  /** Content type the client will PUT. Must be in `ALLOWED_OUTPUT_MIME`. */
  contentType: AllowedOutputMime;
  /** Maximum bytes the upload may exceed (server uses to set conditions). */
  contentLength: number;
  /** Presigned URL TTL in seconds (default 60). */
  ttlSeconds?: number;
}

export interface UploadUrlResult {
  uploadUrl: string;
  key: string;
  expiresAt: string;
  /** Headers the client MUST include in the PUT request, exactly as named. */
  requiredHeaders: Record<string, string>;
}

export interface ReadUrlOptions {
  /** Presigned GET URL TTL in seconds (default 900 = 15 min). */
  ttlSeconds?: number;
}

export interface HeadResult {
  contentLength: number;
  contentType: string;
  etag: string;
}

/**
 * Object storage operations used by the photo pipeline.
 * Both R2 and MinIO implementations satisfy this contract.
 */
export interface CardPhotoStorage {
  /** Generate a short-lived presigned PUT URL. */
  getUploadUrl(req: UploadUrlRequest): Promise<UploadUrlResult>;
  /** Generate a short-lived presigned GET URL for a stored key. */
  getReadUrl(key: string, opts?: ReadUrlOptions): Promise<string>;
  /** HEAD an object — used to verify size and content type after upload. */
  head(key: string): Promise<HeadResult>;
  /** Delete a single object. No-op if it does not exist. */
  delete(key: string): Promise<void>;
  /** Delete all objects under a prefix (used for tenant teardown). */
  deletePrefix(prefix: string): Promise<void>;
}

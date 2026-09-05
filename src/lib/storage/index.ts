/**
 * Storage Layer — Factory + barrel
 *
 * `getPhotoStorage()` returns a singleton implementation chosen by the
 * `STORAGE_DRIVER` env var. The instance is built lazily so build-time
 * code paths do not need real credentials.
 */

import type { CardPhotoStorage } from "./types";
import { AwsS3Storage } from "./s3";
import { R2Storage } from "./r2";
import { MinIOStorage } from "./minio";

let _instance: CardPhotoStorage | null = null;

function readEnv(name: string, optional = false): string {
  const v = process.env[name];
  if (!v && !optional) {
    throw new Error(`Missing env var: ${name}`);
  }
  return v ?? "";
}

function buildStorage(): CardPhotoStorage {
  const driver = readEnv("STORAGE_DRIVER").toLowerCase();
  const bucket = readEnv("S3_BUCKET");
  const accessKeyId = readEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = readEnv("S3_SECRET_ACCESS_KEY");

  switch (driver) {
    case "s3":
      return new AwsS3Storage({
        // Required, with no default on purpose: AWS signs per region, so a
        // fallback would silently work for exactly one region's buckets and
        // 301 for every other.
        region: readEnv("S3_REGION"),
        bucket,
        accessKeyId,
        secretAccessKey,
        // Deliberately NOT `S3_ENDPOINT`. That variable is set to a provider
        // host in every lower-priority env file (`.env` points it at MinIO,
        // Vercel at R2), and env files merge per variable — so an `s3` config
        // that simply omits it would silently inherit the wrong host and sign
        // a valid AWS request against, say, `bucket.localhost:9000`. A VPC
        // endpoint or gateway is rare enough to deserve its own name, which
        // nothing else can hand down by accident.
        endpoint: readEnv("S3_ENDPOINT_OVERRIDE", true) || undefined,
      });
    case "r2":
      return new R2Storage({
        endpoint: readEnv("S3_ENDPOINT"),
        bucket,
        accessKeyId,
        secretAccessKey,
      });
    case "minio":
      return new MinIOStorage({
        endpoint: readEnv("S3_ENDPOINT"),
        region: readEnv("S3_REGION", true) || "us-east-1",
        bucket,
        accessKeyId,
        secretAccessKey,
      });
    default:
      throw new Error(
        `Invalid STORAGE_DRIVER "${driver}". Expected "s3", "r2" or "minio".`,
      );
  }
}

export function getPhotoStorage(): CardPhotoStorage {
  if (!_instance) _instance = buildStorage();
  return _instance;
}

/**
 * Test helper: replace the singleton with a custom implementation.
 * Call `resetPhotoStorage()` afterwards to restore the env-driven behavior.
 */
export function setPhotoStorage(impl: CardPhotoStorage): void {
  _instance = impl;
}

export function resetPhotoStorage(): void {
  _instance = null;
}

export * from "./types";
export * from "./keys";
export * from "./validation";
export * from "./read";
export { AwsS3Storage } from "./s3";
export { R2Storage } from "./r2";
export { MinIOStorage } from "./minio";

/**
 * Storage Layer — Factory + barrel
 *
 * `getPhotoStorage()` returns a singleton implementation chosen by the
 * `STORAGE_DRIVER` env var. The instance is built lazily so build-time
 * code paths do not need real credentials.
 */

import type { CardPhotoStorage } from "./types";
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
  const endpoint = readEnv("S3_ENDPOINT");
  const bucket = readEnv("S3_BUCKET");
  const accessKeyId = readEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = readEnv("S3_SECRET_ACCESS_KEY");

  switch (driver) {
    case "r2":
      return new R2Storage({ endpoint, bucket, accessKeyId, secretAccessKey });
    case "minio": {
      const region = readEnv("S3_REGION", true) || "us-east-1";
      return new MinIOStorage({
        endpoint,
        region,
        bucket,
        accessKeyId,
        secretAccessKey,
      });
    }
    default:
      throw new Error(
        `Invalid STORAGE_DRIVER "${driver}". Expected "r2" or "minio".`,
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
export { R2Storage } from "./r2";
export { MinIOStorage } from "./minio";

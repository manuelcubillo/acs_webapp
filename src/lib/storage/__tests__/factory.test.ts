import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { S3Client } from "@aws-sdk/client-s3";
import {
  AwsS3Storage,
  MinIOStorage,
  R2Storage,
  getPhotoStorage,
  resetPhotoStorage,
} from "../index";

/**
 * The factory is the seam between env vars and the bucket, and the values it
 * gets wrong are silent: a region that does not match the bucket answers 301
 * on every call, and an endpoint set for AWS defeats the SDK's own resolver.
 * These assertions read the client config back rather than trusting the
 * constructor arguments.
 */

const STORAGE_ENV = [
  "STORAGE_DRIVER",
  "S3_ENDPOINT",
  "S3_ENDPOINT_OVERRIDE",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

const saved = new Map<string, string | undefined>();

/** The SDK client is protected; tests read it to verify resolved config. */
function clientOf(storage: unknown): S3Client {
  return (storage as unknown as { client: S3Client }).client;
}

beforeEach(() => {
  for (const key of STORAGE_ENV) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.S3_BUCKET = "acs-photos";
  process.env.S3_ACCESS_KEY_ID = "key";
  process.env.S3_SECRET_ACCESS_KEY = "secret";
  resetPhotoStorage();
});

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetPhotoStorage();
});

describe("getPhotoStorage — driver selection", () => {
  it('builds an AWS S3 adapter with no endpoint under driver "s3"', async () => {
    process.env.STORAGE_DRIVER = "s3";
    process.env.S3_REGION = "eu-west-1";

    const storage = getPhotoStorage();
    expect(storage).toBeInstanceOf(AwsS3Storage);

    const client = clientOf(storage);
    expect(await client.config.region()).toBe("eu-west-1");
    expect(client.config.forcePathStyle).toBe(false);
    // Undefined endpoint is the point: it is what lets the SDK resolve
    // https://s3.<region>.amazonaws.com instead of using a hand-written host.
    expect(client.config.endpoint).toBeUndefined();
  });

  it('ignores S3_ENDPOINT under driver "s3"', () => {
    process.env.STORAGE_DRIVER = "s3";
    process.env.S3_REGION = "eu-west-1";
    // Inherited from a lower-priority env file (.env points it at MinIO).
    // Honouring it would sign a valid AWS request against the wrong host.
    process.env.S3_ENDPOINT = "http://localhost:9000";

    expect(clientOf(getPhotoStorage()).config.endpoint).toBeUndefined();
  });

  it('honours S3_ENDPOINT_OVERRIDE under driver "s3" (VPC / gateway)', () => {
    process.env.STORAGE_DRIVER = "s3";
    process.env.S3_REGION = "eu-west-1";
    process.env.S3_ENDPOINT_OVERRIDE =
      "https://bucket.vpce-abc.s3.eu-west-1.vpce.amazonaws.com";

    expect(clientOf(getPhotoStorage()).config.endpoint).toBeDefined();
  });

  it('refuses driver "s3" without a region', () => {
    process.env.STORAGE_DRIVER = "s3";

    expect(() => getPhotoStorage()).toThrow("Missing env var: S3_REGION");
  });

  it('builds R2 with region "auto" and virtual-host addressing', async () => {
    process.env.STORAGE_DRIVER = "r2";
    process.env.S3_ENDPOINT = "https://acct.r2.cloudflarestorage.com";

    const storage = getPhotoStorage();
    expect(storage).toBeInstanceOf(R2Storage);

    const client = clientOf(storage);
    expect(await client.config.region()).toBe("auto");
    expect(client.config.forcePathStyle).toBe(false);
  });

  it("builds MinIO with path-style addressing", () => {
    process.env.STORAGE_DRIVER = "minio";
    process.env.S3_ENDPOINT = "http://localhost:9000";

    const storage = getPhotoStorage();
    expect(storage).toBeInstanceOf(MinIOStorage);
    expect(clientOf(storage).config.forcePathStyle).toBe(true);
  });

  it("refuses a custom-endpoint driver without an endpoint", () => {
    process.env.STORAGE_DRIVER = "r2";

    expect(() => getPhotoStorage()).toThrow("Missing env var: S3_ENDPOINT");
  });

  it("names every supported driver when given an unknown one", () => {
    process.env.STORAGE_DRIVER = "gcs";

    expect(() => getPhotoStorage()).toThrow(
      'Invalid STORAGE_DRIVER "gcs". Expected "s3", "r2" or "minio".',
    );
  });

  it("caches the instance until reset", () => {
    process.env.STORAGE_DRIVER = "s3";
    process.env.S3_REGION = "eu-west-1";

    const first = getPhotoStorage();
    expect(getPhotoStorage()).toBe(first);

    resetPhotoStorage();
    expect(getPhotoStorage()).not.toBe(first);
  });
});

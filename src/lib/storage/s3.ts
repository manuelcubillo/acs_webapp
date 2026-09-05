/**
 * Storage Layer — AWS S3 adapter
 *
 * The one adapter that sets no endpoint: the SDK derives
 * `https://s3.<region>.amazonaws.com` from `region`, which is also the value
 * it signs with. R2 tolerates `"auto"` as a region; AWS does not — a bucket
 * reached with the wrong region answers `301 PermanentRedirect`, so the
 * factory demands `S3_REGION` explicitly rather than defaulting it.
 *
 * Virtual-host addressing is the default and the only style AWS supports for
 * buckets created since 2020.
 */

import { S3CompatibleStorage } from "./s3-base";

export class AwsS3Storage extends S3CompatibleStorage {
  constructor(config: {
    /** A real AWS region (`eu-west-1`, …). Never `"auto"`. */
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    /**
     * Escape hatch for a VPC interface endpoint or an S3-compatible gateway
     * sitting in front of the bucket. Omit for plain AWS S3.
     */
    endpoint?: string;
  }) {
    super({
      endpoint: config.endpoint,
      region: config.region,
      bucket: config.bucket,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      forcePathStyle: false,
    });
  }
}

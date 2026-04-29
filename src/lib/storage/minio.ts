/**
 * Storage Layer — MinIO adapter
 *
 * MinIO speaks the S3 API but requires path-style addressing
 * (`http://host/<bucket>/<key>` instead of `<bucket>.host/<key>`).
 * Used for local development and self-hosted deployments where photo
 * bytes must stay off third-party clouds.
 */

import { S3CompatibleStorage } from "./s3-base";

export class MinIOStorage extends S3CompatibleStorage {
  constructor(config: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
  }) {
    super({
      endpoint: config.endpoint,
      region: config.region,
      bucket: config.bucket,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      forcePathStyle: true,
    });
  }
}

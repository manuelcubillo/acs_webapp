/**
 * Storage Layer — Cloudflare R2 adapter
 *
 * R2 speaks the S3 API. Endpoint must be the account-scoped URL
 * `https://<account>.r2.cloudflarestorage.com`. Region must be `"auto"`.
 * Virtual-host addressing (the default) is the right choice for R2.
 */

import { S3CompatibleStorage } from "./s3-base";

export class R2Storage extends S3CompatibleStorage {
  constructor(config: {
    endpoint: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
  }) {
    super({
      endpoint: config.endpoint,
      region: "auto",
      bucket: config.bucket,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      forcePathStyle: false,
    });
  }
}

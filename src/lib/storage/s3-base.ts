/**
 * Storage Layer — Shared S3-compatible base
 *
 * R2 and MinIO both speak the S3 API. The only differences are endpoint,
 * region, and addressing style (path-style for MinIO, virtual-host for R2).
 * This module owns the SDK setup so the two adapters are thin shims.
 */

import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  CardPhotoStorage,
  HeadResult,
  ReadUrlOptions,
  UploadUrlRequest,
  UploadUrlResult,
} from "./types";

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** path-style addressing is required for MinIO; R2 uses virtual-host style. */
  forcePathStyle: boolean;
}

const DEFAULT_UPLOAD_TTL = 60;
const DEFAULT_READ_TTL = 900;

export class S3CompatibleStorage implements CardPhotoStorage {
  protected readonly client: S3Client;
  protected readonly bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
    });
  }

  async getUploadUrl(req: UploadUrlRequest): Promise<UploadUrlResult> {
    const ttl = req.ttlSeconds ?? DEFAULT_UPLOAD_TTL;
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: req.key,
      ContentType: req.contentType,
      ContentLength: req.contentLength,
    });
    const uploadUrl = await getSignedUrl(this.client, cmd, { expiresIn: ttl });
    return {
      uploadUrl,
      key: req.key,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      requiredHeaders: {
        "Content-Type": req.contentType,
      },
    };
  }

  async getReadUrl(key: string, opts?: ReadUrlOptions): Promise<string> {
    const ttl = opts?.ttlSeconds ?? DEFAULT_READ_TTL;
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      // A signed `response-content-disposition` turns the URL into a download
      // with a chosen filename. The value is part of the signature, so it
      // cannot be tampered with after the URL is minted.
      ...(opts?.downloadFilename
        ? {
            ResponseContentDisposition: `attachment; filename="${opts.downloadFilename}"`,
          }
        : {}),
    });
    return getSignedUrl(this.client, cmd, { expiresIn: ttl });
  }

  async head(key: string): Promise<HeadResult> {
    const out = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return {
      contentLength: out.ContentLength ?? 0,
      contentType: out.ContentType ?? "application/octet-stream",
      etag: out.ETag ?? "",
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async deletePrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;
    do {
      const list = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const keys = (list.Contents ?? [])
        .map((o) => o.Key)
        .filter((k): k is string => typeof k === "string");
      if (keys.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
          }),
        );
      }
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);
  }
}

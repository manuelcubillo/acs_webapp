# Photo storage — bucket configuration

This app reads and writes ID-card photos, member avatars, tenant logos, and
card-design images via the AWS S3 SDK against AWS S3, Cloudflare R2, or MinIO
(self-hosted / local). The shared interface lives in `src/lib/storage/`. See
ADRs `docs/context/decisions/2026-04-27-photo-storage-r2-minio.md` and
`docs/context/decisions/2026-09-05-aws-s3-storage-driver.md`.

The driver is `STORAGE_DRIVER`, one of `s3` / `r2` / `minio`. It decides the
addressing style (path-style for MinIO, virtual-host for S3 and R2) — there is
no env var for that, and any `S3_FORCE_PATH_STYLE` left over in an env file is
ignored.

Every deployment needs permissive CORS for the dashboard origin so the browser
can PUT directly to the bucket and so the canvas-based PNG export
(`renderDesignToDataURL`) can read images cross-origin without tainting.

## Local development (MinIO)

```sh
docker compose --profile storage up -d
```

Console at <http://localhost:9001> (`minioadmin` / `minioadmin`). The init
container creates the `acs-photos` bucket and sets public read access.
CORS is applied server-wide via `MINIO_API_CORS_ALLOW_ORIGIN` on the `minio`
service in `docker-compose.yml` — MinIO's community edition does not
implement the S3 `PutBucketCors` API (`mc cors set` fails with
`NotImplemented`), so per-bucket CORS files don't work here. To stop:

```sh
docker compose --profile storage down
```

To wipe local objects: add `-v` to the `down` command.

`.env.local`:

```
STORAGE_DRIVER=minio
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=acs-photos
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
```

## Production (AWS S3)

1. Create the bucket in the target region. **Leave Block Public Access fully
   on** — every read is a signed GET, nothing is served publicly.
2. Apply the CORS policy (edit `s3-cors.json` first to put your real
   production origin in `AllowedOrigins`):

   ```sh
   aws s3api put-bucket-cors \
     --bucket <bucket-name> \
     --cors-configuration file://infra/storage/s3-cors.json
   ```

3. Create an IAM user (or role) whose policy grants, on that bucket only:

   | Action             | Why                                    |
   | ------------------ | -------------------------------------- |
   | `s3:PutObject`     | presigned upload                       |
   | `s3:GetObject`     | presigned read + `head()`              |
   | `s3:DeleteObject`  | replace / tenant teardown              |
   | `s3:ListBucket`    | `deletePrefix()` enumerates before deleting |

   `s3:ListBucket` is granted on the bucket ARN; the other three on
   `<bucket-arn>/*`.

4. Set in the deploy environment:

   ```
   STORAGE_DRIVER=s3
   S3_REGION=<bucket-region>
   S3_BUCKET=<bucket-name>
   S3_ACCESS_KEY_ID=<access-key>
   S3_SECRET_ACCESS_KEY=<secret-key>
   ```

   **`S3_ENDPOINT` is ignored by this driver** — deliberately, and you do not
   have to unset it. The SDK derives `https://s3.<region>.amazonaws.com` from
   `S3_REGION`, which is also the value it signs with. Env files merge per
   variable, so a config that merely omitted `S3_ENDPOINT` would inherit
   whatever a lower-priority file left there (`.env` points it at MinIO) and
   sign a valid AWS request against `bucket.localhost:9000`. For a VPC
   interface endpoint or a gateway, use `S3_ENDPOINT_OVERRIDE`, which only
   this driver reads and nothing else can hand down.

   `S3_REGION` has no default: a region that does not match the bucket answers
   `301 PermanentRedirect` on every call.

Egress is billed per GB on S3 (unlike R2). Photo bytes travel bucket → browser
directly, so a CDN in front of the bucket is the lever if that bill grows —
see the ADR's "Follow-ups".

## Production (Cloudflare R2)

1. Create a bucket in the Cloudflare dashboard.
2. Generate an R2 API token with `Object Read & Write` scope on that bucket.
3. Apply the CORS policy:

   ```sh
   wrangler r2 bucket cors put <bucket-name> --rules infra/storage/r2-cors.json
   ```

   Edit `r2-cors.json` first to add your real production origin.

4. Set in the deploy environment:

   ```
   STORAGE_DRIVER=r2
   S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
   S3_BUCKET=<bucket-name>
   S3_ACCESS_KEY_ID=<r2-access-key>
   S3_SECRET_ACCESS_KEY=<r2-secret-key>
   ```

   The R2 adapter hardcodes region `auto`; `S3_REGION` is ignored.

## Object key layout

```
<tenantId>/cards/<cardId>/<random>.<ext>
<tenantId>/card-designs/<designId>/<random>.<ext>
<tenantId>/members/<userId>/<random>.<ext>
<tenantId>/branding/<tenantId>/<random>.<ext>
```

The tenant prefix is the security primitive — every read and confirm refuses
keys outside the caller's tenant. See `src/lib/storage/validation.ts`.

The layout is provider-independent, so moving between buckets is a byte-for-byte
object copy with no database rewrite: the DB stores keys, never URLs.

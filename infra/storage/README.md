# Photo storage — bucket configuration

This app reads and writes ID-card photos, member avatars, tenant logos, and
card-design images via the AWS S3 SDK against either Cloudflare R2 (production)
or MinIO (self-hosted / local). The shared interface lives in
`src/lib/storage/`. See ADR `docs/context/decisions/2026-04-27-photo-storage-r2-minio.md`.

Both deployments need permissive CORS for the dashboard origin so the browser
can PUT directly to the bucket and so the canvas-based PNG export
(`renderDesignToDataURL`) can read images cross-origin without tainting.

## Local development (MinIO)

```sh
docker compose -f docker-compose.minio.yml up -d
```

Console at <http://localhost:9001> (`minioadmin` / `minioadmin`). The init
container creates the `acs-photos` bucket and applies
`infra/storage/minio-cors.json`. To stop:

```sh
docker compose -f docker-compose.minio.yml down
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
S3_FORCE_PATH_STYLE=true
```

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
   S3_REGION=auto
   S3_BUCKET=<bucket-name>
   S3_ACCESS_KEY_ID=<r2-access-key>
   S3_SECRET_ACCESS_KEY=<r2-secret-key>
   S3_FORCE_PATH_STYLE=false
   ```

## Object key layout

```
<tenantId>/cards/<cardId>/<random>.<ext>
<tenantId>/card-designs/<designId>/<random>.<ext>
<tenantId>/members/<userId>/<random>.<ext>
<tenantId>/branding/<tenantId>/<random>.<ext>
```

The tenant prefix is the security primitive — every read and confirm refuses
keys outside the caller's tenant. See `src/lib/storage/validation.ts`.

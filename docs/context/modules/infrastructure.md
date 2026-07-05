# Module: infrastructure

**Last updated**: 2026-04-28 · **Last feature**: photo storage via R2 + MinIO behind `CardPhotoStorage`; image optimization module; presigned-PUT upload Server Actions

## Responsibility

Everything that keeps the app running: database connection, migrations, env vars, build/dev scripts, deploy configuration, and low-level helpers not owned by any business domain.

## Key files

- `src/lib/db/index.ts` — Lazy DB Proxy: `drizzle(neon(DATABASE_URL))` initialized on first property access.
- `src/lib/db/schema/index.ts` — Barrel export.
- `src/lib/db/schema/auth.ts` — Better Auth tables.
- `src/lib/db/schema/access-control.ts` — All app tables + enums.
- `src/lib/db/schema/relations.ts` — Drizzle relations.
- `drizzle/` — Generated migrations.
- `drizzle.config.ts` — Drizzle Kit config (`schema: "./src/lib/db/schema/index.ts"`, `out: "./drizzle"`, `dialect: "postgresql"`).
- `next.config.ts` — `allowedDevOrigins: ["127.0.0.1", "192.168.1.140"]`.
- `src/lib/api/errors.ts` — `AppError`, `AuthenticationError`, `AuthorizationError`, `UnprocessableError`, `ActionResult<T>`.
- `src/lib/api/response.ts` — `actionHandler`, `routeHandler`, `apiSuccess`, `apiError`.
- `src/lib/api/index.ts` — Barrel export.
- `src/lib/dal/types.ts` — All Drizzle-derived types + input/output shapes.
- `src/lib/dal/errors.ts` — `DalError`, `NotFoundError`, `ValidationError`, `ForbiddenOperationError`, `DuplicateCodeError`.
- `src/lib/dal/index.ts` — Barrel export.
- `src/lib/dal/photo-urls.ts` — Server-only helpers (`signCardPhotos`, `signCardListPhotos`, `buildPhotoReadUrlMap`) that turn photo object keys into signed read URLs before passing card data to client renderers.
- `src/lib/storage/types.ts` — `CardPhotoStorage` interface, `PhotoKind` union, key-layout constants.
- `src/lib/storage/keys.ts` — `buildObjectKey`, `keyMatches`, `tenantPrefix`.
- `src/lib/storage/s3-base.ts` — Shared S3-compatible class (presigned PUT/GET, head, delete, prefix delete).
- `src/lib/storage/r2.ts` / `minio.ts` — Adapter shims (virtual-host vs path-style addressing).
- `src/lib/storage/validation.ts` — `assertObjectMatchesKind`, `assertHeadOk` (server-side guards).
- `src/lib/storage/read.ts` — `signPhotoForRead`, `signPhotoForReadOptional`, `signPhotosForRead`.
- `src/lib/storage/index.ts` — Factory: `getPhotoStorage()`; barrel.
- `src/lib/images/profiles.ts` — `CARD_PHOTO_PROFILE`, `MEMBER_AVATAR_PROFILE`, `TENANT_LOGO_PROFILE`, `CARD_DESIGN_IMAGE_PROFILE`. Tweaks here re-tune storage for that kind.
- `src/lib/images/optimize.ts` — Browser-side resize + recompress pipeline (canvas, retry-on-too-large).
- `src/lib/actions/uploads.ts` — `requestPhotoUploadUrlAction`, `confirmPhotoUploadAction`.
- `src/components/shared/PhotoUploader.tsx` — Universal upload widget (optimize → presign → PUT → confirm).
- `infra/storage/` — `r2-cors.json`, `README.md`. MinIO CORS is server-wide via `MINIO_API_CORS_ALLOW_ORIGIN` (no per-bucket file — community edition doesn't implement `PutBucketCors`).
- `docker-compose.yml` (`storage`/`all` profiles) — Local MinIO + bucket-init container.
- Scripts in `package.json`: `pnpm dev | build | start | lint`, `pnpm db:generate | db:migrate | db:studio`, `pnpm db:seed`, `pnpm test | test:watch`.

## Environment variables

```
DATABASE_URL=postgresql://...          # Neon connection string
BETTER_AUTH_SECRET=...                 # openssl rand -hex 32
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000
RESEND_APIKEY=re_...                   # Resend API key (transactional email)
RESEND_FROM_EMAIL=noreply@yourdomain   # Must be a Resend-verified domain
STORAGE_DRIVER=r2|minio                # Photo storage driver (R2 in prod, MinIO local/self-hosted)
S3_ENDPOINT=...                        # R2 account-scoped URL, or http://localhost:9000 for MinIO
S3_REGION=auto                         # R2 → "auto"; MinIO → any string (e.g. us-east-1)
S3_BUCKET=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false              # true for MinIO (path-style), false for R2 (virtual-host)
```

## Runtime constraints

- **Node.js v20 only.** Node 22 (Homebrew default) is broken due to `icu4c` ABI mismatch (v74 ↔ v77). Use `/opt/homebrew/opt/node@20/bin/node` or `PATH="/opt/homebrew/opt/node@20/bin:$PATH" pnpm ...`.
- **Neon HTTP driver** — does not support interactive transactions. Any multi-step write that needs atomicity must document the limitation (see `modules/actions.md`).
- **No middleware** — `src/middleware.ts` does not exist. All auth is page-level via `requireX()` guards.

## Dependencies (key versions)

| Package                        | Version      | Purpose                                     |
| ------------------------------ | ------------ | ------------------------------------------- |
| next                           | 16.1.6       | Framework                                   |
| react / react-dom              | 19.2.3       | UI                                          |
| better-auth                    | 1.5.0        | Auth                                        |
| drizzle-orm                    | 0.45.1       | ORM                                         |
| @neondatabase/serverless       | 1.0.2        | Neon HTTP driver                            |
| zod                            | 4.3.6        | Server Action input validation              |
| html5-qrcode                   | 2.3.8        | Camera QR scanning                          |
| @dnd-kit/core + /sortable + /utilities | 6.3.1 / 10.0.0 / 3.2.2 | Field reordering                    |
| konva                          | 10.2.5       | Canvas editor (card-designs)                |
| react-konva                    | 19.2.3       | React bindings for Konva                    |
| qrcode                         | 1.5.4        | QR code rasterisation (editor + export)     |
| jsbarcode                      | 3.12.3       | Code 128 barcode rendering                  |
| resend                         | 6.12.2       | Transactional email (password reset)        |
| lucide-react                   | 0.577.0      | Icons                                       |
| date-fns                       | 4.1.0        | Date formatting                             |
| dotenv                         | 17.3.1       | Scripts                                     |
| drizzle-kit                    | 0.31.9       | Migrations                                  |
| vitest                         | 4.0.18       | Tests                                       |
| tsx                            | 4.21.0       | Scripts                                     |
| @aws-sdk/client-s3             | 3.1038.0     | Photo storage (R2 + MinIO)                  |
| @aws-sdk/s3-request-presigner  | 3.1038.0     | Presigned PUT/GET URLs for direct uploads   |

## Main flows

### Adding a migration

1. Modify schema files in `src/lib/db/schema/`.
2. `pnpm db:generate` → writes SQL to `drizzle/`.
3. Review generated SQL.
4. `pnpm db:migrate` to apply against `DATABASE_URL`.
5. Commit schema + generated migration together.

### Adding a new DAL error

1. Define in `src/lib/dal/errors.ts`.
2. Map in `src/lib/api/response.ts` `actionHandler` error switch.
3. Update the error-mapping table in `foundation/02-conventions.md`.
4. Update the typed `ActionResult<T>` if the new error affects client shape.

## Extension points

- **New API Route for external devices** → `src/app/api/<route>/route.ts`. Use `routeHandler` wrapper. Currently relies on `x-tenant-id` header (`TODO: API_AUTH`) until API key system lands.
- **Swap DB driver** (e.g. for full transactions) → replaces `src/lib/db/index.ts` lazy proxy. Every multi-step write should be re-audited for true atomicity gains. Requires ADR.

## Module interactions

- Consumed by: every module.
- Dependencies on other modules: none (this is foundation).

## Open TODOs

- [ ] `TODO: API_AUTH` — external API authentication (`src/lib/api/auth.ts`).
- [ ] Atomicity for `executeAction` (documented in `modules/actions.md`).

## Future considerations

- Janitor cron for orphaned photo objects (replacement uploads write a new key; the previous one is left for an out-of-band sweep).

## Recent changes

- 2026-04-28 — Photo storage migration: `CardPhotoStorage` (R2 + MinIO) + `src/lib/images/` optimization module + presigned-PUT Server Actions. `tenants.logo_object_key` added (migration 0015). `field_values.value_text` for `photo` fields now stores object keys (not URLs); server-side helpers in `src/lib/dal/photo-urls.ts` sign keys before render. Old `/api/upload` route removed. ADR `2026-04-27-photo-storage-r2-minio.md`.
- 2026-04-27 — Added `card_designs` + `card_type_designs` tables (migration 0014); added konva 10.2.5, react-konva 19.2.3, qrcode 1.5.4, jsbarcode 3.12.3 to dependencies.
- 2026-04-26 — Added `departure_feedback` table (migrations 0011, 0012). Note: snapshot files for 0008–0010 were missing; 0011 SQL was hand-trimmed to only the new table to avoid duplicate DDL errors.
- 2026-04-25 — Added Resend (v6.12.2) for transactional email; documented `RESEND_APIKEY` and `RESEND_FROM_EMAIL` env vars.
- 2026-04-19 — Initial extraction from technical handoff.

# Module: infrastructure

**Last updated**: 2026-08-06 · **Last feature**: `isUniqueViolation` — driver-level unique-constraint detection, so an insert can let the index arbitrate instead of pre-checking

## Responsibility

Everything that keeps the app running: database connection, migrations, env vars, build/dev scripts, deploy configuration, and low-level helpers not owned by any business domain.

## Key files

- `src/lib/db/index.ts` — Lazy DB Proxy: `drizzle(neon(DATABASE_URL))` initialized on first property access.
- `src/lib/db/schema/index.ts` — Barrel export.
- `src/lib/db/schema/auth.ts` — Better Auth tables.
- `src/lib/db/schema/access-control.ts` — All app tables + enums. Also exports `CARDS_TENANT_CODE_UNIQUE`, the `(tenant_id, code)` constraint name, which `unique()` itself consumes so the literal cannot drift from the code that matches on it.
- `src/lib/db/pg-errors.ts` — `isUniqueViolation(error, constraintName?)` + `PG_UNIQUE_VIOLATION`. See "Detecting a driver error".
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
- `src/lib/dal/photo-urls.ts` — Server-only helpers. `signCardPhotos` / `buildPhotoReadUrlMap` turn photo object keys into signed read URLs before passing card data to client renderers; `stripCardListPhotoKeys` does the opposite for route-addressed surfaces, replacing the key (in both `value` and `raw.value_text`) with a boolean presence flag.
- `src/lib/storage/types.ts` — `CardPhotoStorage` interface, `PhotoKind` union, key-layout constants.
- `src/lib/storage/keys.ts` — `buildObjectKey`, `keyMatches`, `tenantPrefix`, `buildCardPhotoDownloadFilename` (`<code>_<fieldName>_<random>.<ext>`, slugified).
- `src/lib/storage/s3-base.ts` — Shared S3-compatible class (presigned PUT/GET, head, delete, prefix delete). `getReadUrl` takes an optional `downloadFilename` → signed `ResponseContentDisposition`.
- `src/lib/storage/r2.ts` / `minio.ts` — Adapter shims (virtual-host vs path-style addressing).
- `src/lib/storage/validation.ts` — `assertObjectMatchesKind`, `assertHeadOk` (server-side guards).
- `src/lib/storage/read.ts` — `signPhotoForRead`, `signPhotoForReadOptional`, `signPhotosForRead`, `signPhotoForDownload` (attachment). 15-min TTL.
- `src/lib/storage/photo-routes.ts` — `cardPhotoRoute(code, { fieldDefinitionId?, download? })`, the single builder for the photo route's URL and query. Dependency-free on purpose: imported by both the DAL and client components (`PhotoRenderer` builds its `<img src>` and download href with it).
- `src/app/api/photos/cards/[code]/route.ts` — Session-authed (OPERATOR+) card photo: 302 → signed URL minted per request. Stable per card, so it neither expires client-side nor busts the browser cache. Optional `?field=<fieldDefinitionId>` picks a specific photo field; `?download` returns an attachment named `<code>_<fieldName>_<random>.<ext>` (default: primary photo, inline). ADR `2026-07-17-stable-photo-routes.md`, `2026-07-19-webcam-capture-and-crop.md`.
- `src/app/api/cron/purge-archived/route.ts` — Daily retention purge endpoint. No session; authed by `Authorization: Bearer <CRON_SECRET>` (constant-time compare, fails closed if `CRON_SECRET` unset). Runs `purgeExpiredArchivedRecords()` and returns the per-tenant summary. In its own `/api/cron/*` tree, NOT under `/api/cards/*` (that tree is device-header-authed). ADR `2026-07-18-card-lifecycle-purge-job.md`.
- `src/lib/server/lifecycle/purge.ts` — `hardDeleteArchivedCard` / `hardDeleteArchivedCardType` / `hardDeleteAllArchived` (phase-4 manual, per-tenant) and `purgeExpiredArchivedRecords` (phase-5 daily job, cross-tenant DELETE-with-join against each tenant's `archive_retention_days`).
- `vercel.json` — Vercel Cron entry: `GET /api/cron/purge-archived` at `0 3 * * *` (daily, 03:00 UTC). Vercel injects the `Authorization: Bearer <CRON_SECRET>` header when `CRON_SECRET` is set in the project env.
- `src/lib/storage/index.ts` — Factory: `getPhotoStorage()`; barrel.
- `src/lib/images/profiles.ts` — `CARD_PHOTO_PROFILE`, `MEMBER_AVATAR_PROFILE`, `TENANT_LOGO_PROFILE`, `CARD_DESIGN_IMAGE_PROFILE`. Tweaks here re-tune storage for that kind.
- `src/lib/images/optimize.ts` — Browser-side resize + recompress pipeline (canvas, retry-on-too-large). Optional source-pixel `cropRect` overrides the profile centre-crop — fed by the interactive cropper.
- `src/lib/actions/uploads.ts` — `requestPhotoUploadUrlAction`, `confirmPhotoUploadAction`.
- `src/components/shared/PhotoUploader.tsx` — Universal upload widget (optimize → presign → PUT → confirm). Opt-in `enableWebcam` / `enableCrop` add a camera source + crop step (card photos only; see `modules/fields.md`).
- `src/components/shared/WebcamCaptureDialog.tsx` + `src/hooks/useWebcamCapture.ts` — camera capture UI + getUserMedia lifecycle (rear-camera preference, multi-camera switch, guaranteed track release).
- `src/components/shared/ImageCropDialog.tsx` — `react-easy-crop` crop dialog (Free / 1:1 / 3:4 + zoom) → source-pixel `cropRect`.
- `src/components/ui/slider.tsx` — shadcn `Slider` primitive (unified `radix-ui` import), used by the crop zoom control.
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
CRON_SECRET=...                        # Shared secret for the daily purge endpoint. openssl rand -hex 32
```

`CRON_SECRET` protects `GET /api/cron/purge-archived`. On Vercel, Cron Jobs inject the `Authorization: Bearer <CRON_SECRET>` header automatically when it is set in the project env; on Docker / self-hosted the external cron sends it. If unset, the endpoint refuses every request (fail closed). Documented in `.env.example` and `.env.docker`.

## Runtime constraints

- **Node.js v24.** `package.json` `engines.node` is `">=24"`; the default `node` on this machine is v24. Older notes pinning Node 20 (and the Node 22 `icu4c` ABI workaround) are stale — see `CLAUDE.md`.
- **Neon HTTP driver** — does not support interactive transactions. Any multi-step write that needs atomicity must document the limitation (see `modules/actions.md`). The lifecycle transitions and the retention purge sidestep this by expressing each multi-row write as a single data-modifying CTE. A **uniqueness** check sidesteps it differently: do not SELECT-then-INSERT (racy, and the index has to be handled anyway) — attempt the insert and react to the violation with `isUniqueViolation`. Card code generation is the reference use (`modules/cards.md` → "Code assignment").
- **No middleware** — `src/middleware.ts` does not exist. All auth is page-level via `requireX()` guards. The one non-session `/api` route (`/api/cron/purge-archived`) authenticates by shared secret, not a guard.

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
| react-easy-crop                | 6.2.2        | Interactive image crop (photo fields)       |

## Main flows

### Adding a migration

1. Modify schema files in `src/lib/db/schema/`.
2. `pnpm db:generate` → writes SQL to `drizzle/`.
3. Review generated SQL.
4. `pnpm db:migrate` to apply against `DATABASE_URL`.
5. Commit schema + generated migration together.

**Data migrations**: drizzle-kit only diffs structure. If a column changes type or a
column's data must be transformed (e.g. `is_active` → `status`), its generated SQL will
be wrong or destructive — hand-write the file. Keep drizzle-kit's snapshot + journal
entry, which it produces even when you replace the SQL body. When the enum diff prompts
"created or renamed?", it needs a real TTY (`expect`); `generate --custom` scaffolds a
journal entry but clones the previous snapshot, so it is not a substitute.

**Down migrations**: drizzle-kit neither generates nor runs them. Rollbacks live in
`drizzle/down/<tag>.down.sql`, outside the migrator's path, and are applied by hand with
`psql -f`. They must also be removed from `drizzle/meta/_journal.json`. See
`drizzle/down/0017_card_lifecycle_archiving.down.sql` for the pattern (including how to
document lossy rollbacks).

### Verifying a migration before it reaches Neon

`docker compose --profile db up -d` gives a local Postgres 15. Replay every migration into
a throwaway DB, seed rows covering each data-migration branch, then run the new one:

```
docker exec ... psql -U acs_user -d postgres -c "CREATE DATABASE mig_test;"
for f in drizzle/00*.sql; do sed 's/--> statement-breakpoint//' "$f" | psql -d mig_test -v ON_ERROR_STOP=1; done
```

Integration tests do the same via `TEST_DATABASE_URL` in `.env.test.local` (gitignored),
which flips `DB_DRIVER=local` so they never touch the shared Neon branch.

### Daily retention purge job

Physically deletes archived cards / card types whose per-tenant retention has
elapsed. One mechanism: a single endpoint invoked once a day (no in-process
scheduler — Vercel is stateless between invocations). See ADR
`2026-07-18-card-lifecycle-purge-job.md`.

1. `purgeExpiredArchivedRecords()` (`src/lib/server/lifecycle/purge.ts`) runs two
   deletes joined to `tenants`: expired archived card types first (cascading to
   their cards), then remaining expired archived cards. Cutoff:
   `archived_at < (now() AT TIME ZONE 'UTC') - make_interval(days => archive_retention_days)`.
   Single CTE = one atomic statement on Neon HTTP. Idempotent; returns a
   per-tenant summary and logs it (the purge leaves no per-record audit).
2. `GET /api/cron/purge-archived` (secret-authed) runs it and returns the summary.

**Triggers (same endpoint everywhere):**

- **Vercel** — `vercel.json` cron at `0 3 * * *`. Vercel injects
  `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is set.
- **Docker / self-hosted** — a host or container cron hits the endpoint once a
  day with the same header. Example crontab line:
  ```
  0 3 * * * curl -fsS -X GET -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/purge-archived
  ```
  or a sidecar cron service on the Compose network targeting `http://acs:3000/...`.
- **Local dev** — invoke by hand:
  `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/purge-archived`.

### Detecting a driver error

Drizzle 0.45 wraps whatever the driver throws, so **the SQLSTATE is never on the error you
catch** — it is one `cause` down, identically for both configured drivers:

```
DrizzleQueryError                        ← what a DAL call catches
  └─ cause: NeonDbError | DatabaseError  ← code "23505", constraint, table
```

(`PgPreparedQuery.queryWithCache` does the wrapping, and `neon-http` routes through it, so
this holds for `DB_DRIVER=neon` and `=local` alike. Verified against both, 2026-08-06.)

`isUniqueViolation(error, constraintName?)` walks that `cause` chain (depth-capped) for
SQLSTATE `23505`. **Always pass the constraint name** when catching to retry: without it,
a violation of any other unique index on the table is swallowed too. Anything that is not
that exact violation returns `false` and must be rethrown.

### Adding a new DAL error

1. Define in `src/lib/dal/errors.ts`.
2. Map in `src/lib/api/response.ts` `actionHandler` error switch.
3. Update the error-mapping table in `foundation/02-conventions.md`.
4. Update the typed `ActionResult<T>` if the new error affects client shape.

## Extension points

- **New API Route for external devices** → `src/app/api/<route>/route.ts`. Use `routeHandler` wrapper. Currently relies on `x-tenant-id` header (`TODO: API_AUTH`) until API key system lands.
- **New API Route for the browser** (rare — Server Actions are the default; justified when an `<img>`/`<a>` needs a real URL) → session guard, `export const dynamic = "force-dynamic"`, and `Cache-Control: private` + `Vary: Cookie` on anything session-dependent. Keep it OUT of `/api/cards/*`: that tree is header-authed, and mixing auth models in one tree invites cross-tenant mistakes. Pattern: `src/app/api/photos/cards/[code]/route.ts`.
- **New scheduled / cron endpoint** → `src/app/api/cron/<name>/route.ts`, `routeHandler` wrapper, `export const dynamic = "force-dynamic"`, no session. Authenticate by a shared secret (`Authorization: Bearer <SECRET>`, constant-time compare, fail closed if unset). Add a `vercel.json` `crons` entry for Vercel and document the equivalent host/container cron for Docker. Pattern: `src/app/api/cron/purge-archived/route.ts`.
- **Swap DB driver** (e.g. for full transactions) → replaces `src/lib/db/index.ts` lazy proxy. Every multi-step write should be re-audited for true atomicity gains. Requires ADR.

## Module interactions

- Consumed by: every module.
- Dependencies on other modules: none (this is foundation).

## Open TODOs

- [ ] `TODO: API_AUTH` — external API authentication (`src/lib/api/auth.ts`).
- [ ] Atomicity for `executeAction` (documented in `modules/actions.md`).
- [ ] RSC payload carries a serialized node-postgres `Result` (`command`/`rowCount`/`_parsers`/`RowCtor`, rows included), which leaks a photo object key that `stripCardListPhotoKeys` cannot reach — it redacts mapped card data, not driver objects. Observed on `/cards` in dev on 2026-08-02, with the Next dev overlay active; **not verified against a production build**, so whether it is dev-only instrumentation is still open. Predates the 2026-08-02 photo work.

## Future considerations

- Janitor cron for orphaned photo objects (replacement uploads write a new key; the previous one is left for an out-of-band sweep). Would follow the `/api/cron/*` + `vercel.json` pattern established by the purge job.

## Recent changes

- 2026-08-06 — New `src/lib/db/pg-errors.ts`: `isUniqueViolation(error, constraintName?)`, the first helper that inspects a driver error. Added because card code generation needs the `(tenant_id, code)` index to arbitrate uniqueness — the no-interactive-transactions constraint makes a pre-check SELECT racy. Established that drizzle wraps driver errors in `DrizzleQueryError`, putting the SQLSTATE one `cause` down for both `neon-http` and `node-postgres` (both verified). `access-control.ts` now exports `CARDS_TENANT_CODE_UNIQUE` and feeds it to its own `unique()` call — no DDL change, the generated SQL is identical. ADR `2026-08-06-autogenerated-card-codes.md`.
- 2026-08-02 — Deleted `signCardListPhotos` from `src/lib/dal/photo-urls.ts`: `stripCardListPhotoKeys` had taken over all three card-list producers the day before, leaving it with zero callers. `signCardPhotos` / `buildPhotoReadUrlMap` are unchanged and still the path for surfaces that sign server-side. Dead-code removal, no behaviour change.
- 2026-08-02 — `cardPhotoRoute` now takes `{ fieldDefinitionId?, download? }` and owns the route's query construction (`URLSearchParams`), replacing hand-built strings in `PhotoRenderer`. New `stripCardListPhotoKeys` in `src/lib/dal/photo-urls.ts` replaces `signCardListPhotos` on the three card-list producers: list surfaces address photos by route, so keys are redacted (`value` **and** `raw.value_text`) rather than signed. Removes ~one signature per photo per list render; adds one hop + one `getCardByCode` per uncached image. ADR `2026-08-02-card-list-photos-stable-route.md`.
- 2026-07-19 — Photo pipeline/storage support for webcam capture + crop (feature owned by `fields`): `optimizeImage` gained an optional source-pixel `cropRect`; `getReadUrl` + new `signPhotoForDownload` sign a `Content-Disposition` attachment; `buildCardPhotoDownloadFilename` builds `<code>_<fieldName>_<random>.<ext>`; `/api/photos/cards/[code]` gained `?field` + `?download`; `PhotoUploader` gained opt-in `enableWebcam`/`enableCrop` plus new `WebcamCaptureDialog` / `ImageCropDialog` / `useWebcamCapture` / `ui/slider.tsx`. Added `react-easy-crop` 6.2.2. ADR `2026-07-19-webcam-capture-and-crop.md`.
- 2026-07-18 — Card lifecycle phase 5 (final, 5/5): daily retention purge. New `purgeExpiredArchivedRecords()` (cross-tenant DELETE-with-join against each tenant's `archive_retention_days`, single atomic CTE, idempotent) in `src/lib/server/lifecycle/purge.ts`; new `GET /api/cron/purge-archived` endpoint (no session, `CRON_SECRET` Bearer auth, fails closed); `vercel.json` cron at `0 3 * * *`; `CRON_SECRET` added to env docs (`.env.example`, `.env.docker`). Master-gated retention UI at `/settings/retention`. Also corrected the stale Node-version note (v24, per `engines`). ADR `2026-07-18-card-lifecycle-purge-job.md`.

# Module: infrastructure

**Last updated**: 2026-09-05 · **Last feature**: AWS S3 added as a third storage driver (`STORAGE_DRIVER=s3`) alongside R2 and MinIO

## Responsibility

Everything that keeps the app running: database connection, migrations, env vars, build/dev scripts, deploy configuration, and low-level helpers not owned by any business domain.

## Key files

- `src/lib/db/index.ts` — Lazy DB Proxy: `drizzle(neon(DATABASE_URL))` initialized on first property access. Calls `assertDatabaseTarget` before building the client.
- `src/lib/db/guard.ts` — `assertDatabaseTarget(url, context)`. Refuses a `neon.tech` host from a non-production runtime unless `ALLOW_NEON_DB=1`. Also consumed by `drizzle.config.ts` and the DB scripts. ADR `2026-08-26-environment-topology.md`.
- `src/test/setup-integration.ts` — `setupFiles` of the vitest `integration` project. Pins the run to `TEST_DATABASE_URL` and aborts if it is missing, remote, or the same database as `DATABASE_URL`. No integration test carries its own env bootstrap.
- `scripts/load-env.ts` — Env cascade for standalone scripts (`.env.local` → `.env.development` → `.env`). Import it first; a dotenv-cli overlay still wins.
- `scripts/db/setup.ts` — `pnpm db:setup`. Creates `acs_dev` + `acs_test` if absent and migrates both.
- `scripts/db/backfill-journal.ts` — `pnpm db:journal:sync[:test|:prod]`. Records already-applied migrations in `drizzle.__drizzle_migrations` without running DDL. Refuses if the schema does not match what it would mark applied.
- `scripts/pull-prod-db.sh` — `pnpm db:pull-prod`. Dumps production into local `acs_dev` (not `acs_test`), then reconciles the journal.
- `src/lib/db/schema/index.ts` — Barrel export.
- `src/lib/db/schema/auth.ts` — Better Auth tables.
- `src/lib/db/schema/access-control.ts` — All app tables + enums. Also exports `CARDS_TENANT_CODE_UNIQUE`, the `(tenant_id, code)` constraint name, which `unique()` itself consumes so the literal cannot drift from the code that matches on it.
- `src/lib/db/constants.ts` — DB values referenced by BOTH a migration and application code, so they cannot live in only one. Currently `SYSTEM_USER_ID` + `SYSTEM_USER_NAME` (the seeded sentinel `user` row, named `Sistema`) — never re-inline either literal.
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
- `src/lib/storage/s3-base.ts` — Shared S3-compatible class (presigned PUT/GET, head, delete, prefix delete). `getReadUrl` takes an optional `downloadFilename` → signed `ResponseContentDisposition`. `endpoint` is optional and **omitted** from the `S3Client` config when unset — passing the key at all disables the SDK's regional endpoint resolver.
- `src/lib/storage/s3.ts` / `r2.ts` / `minio.ts` — Adapter shims. Each picks only region, endpoint and addressing style: S3 = real region + no endpoint + virtual-host; R2 = `"auto"` + account endpoint + virtual-host; MinIO = anything + local endpoint + path-style.
- `src/lib/storage/validation.ts` — `assertObjectMatchesKind`, `assertHeadOk` (server-side guards).
- `src/lib/storage/read.ts` — `signPhotoForRead`, `signPhotoForReadOptional`, `signPhotosForRead`, `signPhotoForDownload` (attachment). 15-min TTL.
- `src/lib/storage/photo-routes.ts` — `cardPhotoRoute(code, { fieldDefinitionId?, download? })`, the single builder for the photo route's URL and query. Dependency-free on purpose: imported by both the DAL and client components (`PhotoRenderer` builds its `<img src>` and download href with it).
- `src/app/api/photos/cards/[code]/route.ts` — Session-authed (OPERATOR+) card photo: 302 → signed URL minted per request. Stable per card, so it neither expires client-side nor busts the browser cache. Optional `?field=<fieldDefinitionId>` picks a specific photo field; `?download` returns an attachment named `<code>_<fieldName>_<random>.<ext>` (default: primary photo, inline). ADR `2026-07-17-stable-photo-routes.md`, `2026-07-19-webcam-capture-and-crop.md`.
- `src/app/api/cron/purge-archived/route.ts` — Daily retention purge endpoint. No session; authed by `Authorization: Bearer <CRON_SECRET>` (constant-time compare, fails closed if `CRON_SECRET` unset). Runs `purgeExpiredArchivedRecords()` and returns the per-tenant summary. In its own `/api/cron/*` tree, NOT under `/api/cards/*` (that tree is device-header-authed). ADR `2026-07-18-card-lifecycle-purge-job.md`.
- `src/lib/server/lifecycle/purge.ts` — `hardDeleteArchivedCard` / `hardDeleteArchivedCardType` / `hardDeleteAllArchived` (phase-4 manual, per-tenant) and `purgeExpiredArchivedRecords` (phase-5 daily job, cross-tenant DELETE-with-join against each tenant's `archive_retention_days`).
- `vercel.json` — Vercel Cron entry: `GET /api/cron/purge-archived` at `0 3 * * *` (daily, 03:00 UTC). Vercel injects the `Authorization: Bearer <CRON_SECRET>` header when `CRON_SECRET` is set in the project env.
- `src/lib/storage/index.ts` — Factory: `getPhotoStorage()`; barrel. `STORAGE_DRIVER` ∈ `s3` / `r2` / `minio`. `S3_REGION` is **required** for `s3` (AWS signs per region; a mismatch is a 301, so there is deliberately no default), ignored by `r2` (hardcoded `"auto"`), optional for `minio`. `S3_ENDPOINT` is required for `r2` / `minio` and **not read at all** by `s3` — env files merge per variable, so honouring it would let `.env`'s MinIO host (or Vercel's R2 host) be inherited by an S3 config and sign a valid request against the wrong server. The `s3` escape hatch is `S3_ENDPOINT_OVERRIDE`. Covered by `__tests__/factory.test.ts`, which reads the resolved client config back rather than trusting the constructor args.
- `src/lib/email/send.ts` — `deliverEmail()` is the single delivery path. With `RESEND_APIKEY` empty (every environment but Vercel) it logs the message and its action link instead of sending, so a local run cannot mail real members from the production Resend account.
- `src/lib/images/profiles.ts` — `CARD_PHOTO_PROFILE`, `MEMBER_AVATAR_PROFILE`, `TENANT_LOGO_PROFILE`, `CARD_DESIGN_IMAGE_PROFILE`. Tweaks here re-tune storage for that kind.
- `src/lib/images/optimize.ts` — Browser-side resize + recompress pipeline (canvas, retry-on-too-large). Optional source-pixel `cropRect` overrides the profile centre-crop — fed by the interactive cropper.
- `src/lib/actions/uploads.ts` — `requestPhotoUploadUrlAction`, `confirmPhotoUploadAction`.
- `src/components/shared/PhotoUploader.tsx` — Universal upload widget (optimize → presign → PUT → confirm). Opt-in `enableWebcam` / `enableCrop` add a camera source + crop step (card photos only; see `modules/fields.md`).
- `src/components/shared/WebcamCaptureDialog.tsx` + `src/hooks/useWebcamCapture.ts` — camera capture UI + getUserMedia lifecycle (rear-camera preference, multi-camera switch, guaranteed track release).
- `src/components/shared/ImageCropDialog.tsx` — `react-easy-crop` crop dialog (Free / 1:1 / 3:4 + zoom) → source-pixel `cropRect`.
- `src/components/ui/slider.tsx` — shadcn `Slider` primitive (unified `radix-ui` import), used by the crop zoom control.
- `infra/storage/` — `s3-cors.json` (`aws s3api put-bucket-cors`, wrapped in `CORSRules`), `r2-cors.json` (`wrangler r2 bucket cors put`, a bare array), `README.md` with the per-provider setup including the S3 IAM policy. MinIO CORS is server-wide via `MINIO_API_CORS_ALLOW_ORIGIN` (no per-bucket file — community edition doesn't implement `PutBucketCors`).
- `scripts/push-photos-to-bucket.sh` — `pnpm push:photos`. Copies every object the local DB references but the production bucket lacks. Resolves destination region/endpoint from `.env.prod`'s `STORAGE_DRIVER`, mirroring `src/lib/storage/index.ts` — the CLI must sign for the same host the app does. Additive; never deletes.
- `docker-compose.yml` — Four services across three profiles: `postgres` (`db`/`all`), `minio` + `minio-init` (`storage`/`all`), and `acs` + `ofelia` (`app`/`all`). **`ofelia`** (`mcuadros/ofelia`, `command: daemon --docker`, `TZ: UTC`, Docker socket mounted read-only) is the self-hosted cron that drives the purge job. ⚠️ In `--docker` mode Ofelia reads its jobs from **labels on the target container**, not from its own service block: the schedule and command live on the `acs` service as `ofelia.job-exec.purge-archived.schedule` / `.command`.
- Scripts in `package.json`: `pnpm dev | dev:branch | dev:prod`, `build | start | lint`, `test | test:unit | test:integration | test:watch`, `db:setup`, `db:generate`, `db:migrate[:test|:all|:branch|:prod]`, `db:studio[:branch|:prod]`, `db:journal:sync[:test|:prod]`, `db:seed`, `db:pull-prod`.

## Environment variables

**`docs/ENVIRONMENTS.md` is the reference** — which command reaches which database, what each file defines, and the per-variable "defined in" table. `.env.example` documents every variable inline. Do not re-derive either from this module.

The shape, in one paragraph: `.env` and `.env.development` are committed and hold non-secret local defaults; `.env.local`, `.env.test.local`, `.env.docker`, `.env.prod` and `.env.neon-branch` are gitignored and hold per-environment secrets. **Local is the default for every command**; remote targets are reached only through a `:prod` / `:branch` script, which injects `ALLOW_NEON_DB=1` — the flag `assertDatabaseTarget` requires and that appears in no env file. `BETTER_AUTH_SECRET` and `CRON_SECRET` are distinct per environment; `RESEND_APIKEY` is set only on Vercel. ADR `2026-08-26-environment-topology.md`.

`CRON_SECRET` protects `GET /api/cron/purge-archived`. On Vercel, Cron Jobs inject the `Authorization: Bearer <CRON_SECRET>` header automatically when it is set in the project env; on Docker / self-hosted the external cron sends it. If unset, the endpoint refuses every request (fail closed). ⚠️ **It is not set in the Vercel project**, so the daily cron in `vercel.json` has been receiving a 401 since it was added and the retention purge has never run in production. See `docs/ENVIRONMENTS.md` § "Tareas pendientes".

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
4. `pnpm db:migrate:all` → applies to `acs_dev` **and** `acs_test`.
5. `pnpm db:migrate:branch` to rehearse against a copy of production data.
6. `pnpm db:migrate:prod` once the rehearsal is clean.
7. Commit schema + generated migration together.

Each database keeps its own journal, so a migration must be applied to each one
independently — that has not changed. What did change (2026-08-26) is that
`drizzle-kit migrate` works again on all of them: their `__drizzle_migrations`
tables were empty while their schemas were at 0021, so the migrator replayed
from 0000 and died on `CREATE TABLE "account"`. `pnpm db:journal:sync` reconciled
`acs_dev` and `acs_test`. **Production's journal is still empty** — run
`pnpm db:journal:sync:prod` before the first `db:migrate:prod`, or it will
replay from 0000 there too. The psql-DDL workaround used for migrations 0018–0021
is no longer needed.

**Data migrations**: drizzle-kit only diffs structure. If a column changes type or a
column's data must be transformed (e.g. `is_active` → `status`), its generated SQL will
be wrong or destructive — hand-write the file. Keep drizzle-kit's snapshot + journal
entry, which it produces even when you replace the SQL body. When the enum diff prompts
"created or renamed?", it needs a real TTY (`expect`); `generate --custom` scaffolds a
journal entry but clones the previous snapshot, so it is not a substitute.

**Adding an enum value**: the constraint is that nothing may **use** the new value
in the same migration file. drizzle-kit runs each file in one transaction, and
Postgres forbids using a new enum value in the transaction that added it (before
PG 12 it forbade the `ALTER` in a transaction block at all). So anything that
references the value — a seed row, a CHECK, a backfill, a `WHERE log_type = …` —
goes in a **later** file.

- **Value + something that uses it** → two files. `0020_action_type_toggle.sql`
  is the reference: one statement, nothing appended, with `0021` doing the work.
- **Value + unrelated structural DDL** → one file is fine, and preferable, since
  splitting means hand-authoring a journal entry and a snapshot between two
  generated ones. `0022_card_snapshots.sql` is the reference: it adds
  `'card_edit'` to `log_type` and creates `card_snapshots` in the same file, and
  its header warns the next editor not to append a use.

⚠️ Do not "tidy" a single-file case into a split without adding the journal +
snapshot entries by hand — drizzle diffs against the LAST snapshot, so a missing
one silently changes what the next `db:generate` produces.

**Triggers and seed rows**: drizzle-kit cannot express either. Generate the
structural DDL normally, then hand-edit the file, marking the hand-written
sections. `0021_presence_control.sql` is the reference — it carries a
behaviour-preserving backfill, `touch_field_value()` + the `field_values_touch`
trigger (the schema's only trigger, which makes `field_values.updated_at`
DB-maintained rather than application-maintained), and the sentinel `user` seed
with `ON CONFLICT DO NOTHING`. Keep drizzle-kit's snapshot + journal entry; rename
the file descriptively and update the journal `tag` to match.

**Down migrations**: drizzle-kit neither generates nor runs them. Rollbacks live in
`drizzle/down/<tag>.down.sql`, outside the migrator's path, and are applied by hand with
`psql -f`. They must also be removed from `drizzle/meta/_journal.json`. See
`drizzle/down/0017_card_lifecycle_archiving.down.sql` for the pattern (including how to
document lossy rollbacks) and `drizzle/down/0022_card_snapshots.down.sql` for the most
recent one.

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
- **Docker / self-hosted** — the `ofelia` service in `docker-compose.yml`
  (profiles `app` / `all`, `TZ: UTC`), running `daemon --docker` with the Docker
  socket mounted read-only. In that mode Ofelia discovers its jobs from **labels
  on the containers it watches**, so the schedule is NOT in the `ofelia` block —
  it is on the `acs` service:
  ```yaml
  labels:
    ofelia.enabled: "true"
    ofelia.job-exec.purge-archived.schedule: "0 3 * * *"   # same time as vercel.json
    ofelia.job-exec.purge-archived.command: >-
      sh -c 'wget -qO- --header="Authorization: Bearer $$CRON_SECRET"
      http://localhost:3000/api/cron/purge-archived'
  ```
  `job-exec` runs the command *inside* the running `acs` container, which is why
  the URL is `localhost:3000` and why `$$CRON_SECRET` (escaped for Compose) is
  read from that container's own env — the secret never appears in the label.
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

- [ ] `CRON_SECRET` is absent from the Vercel project → the daily purge has never run in production. Adding it makes the first run physically delete every archived record past its tenant retention.
- [ ] Production's `__drizzle_migrations` is still empty. Run `pnpm db:journal:sync:prod` before the next `db:migrate:prod`.
- [ ] Migration `0022_card_snapshots.sql` is applied locally (dev + test) but **not to Neon**. It is additive and needs no backfill; it must go out with the code, since `createCard` / `updateCard` / `executeAction` / `logScanEntry` all write the new columns.
- [ ] `S3_BUCKET` is blank in `.env.prod` (Vercel marks it Sensitive and will not read it back), so `pnpm dev:prod` shows no photos until it is filled in from the Cloudflare panel.
- [ ] `TODO: API_AUTH` — external API authentication (`src/lib/api/auth.ts`).
- [ ] Atomicity for `executeAction` (documented in `modules/actions.md`).
- [ ] RSC payload carries a serialized node-postgres `Result` (`command`/`rowCount`/`_parsers`/`RowCtor`, rows included), which leaks a photo object key that `stripCardListPhotoKeys` cannot reach — it redacts mapped card data, not driver objects. Observed on `/cards` in dev on 2026-08-02, with the Next dev overlay active; **not verified against a production build**, so whether it is dev-only instrumentation is still open. Predates the 2026-08-02 photo work.

## Future considerations

- Janitor cron for orphaned photo objects (replacement uploads write a new key; the previous one is left for an out-of-band sweep). Would follow the `/api/cron/*` + `vercel.json` pattern established by the purge job.

## Recent changes

- 2026-09-05 — AWS S3 added as a third storage driver. New `src/lib/storage/s3.ts` (`AwsS3Storage`), `endpoint` made optional on `S3StorageConfig` and omitted rather than passed as `undefined`, and `STORAGE_DRIVER=s3` wired into the factory with `S3_REGION` required and no default. Two latent bugs closed on the way: `S3_ENDPOINT` was unconditionally mandatory (AWS must not have one), and `S3_FORCE_PATH_STYLE` was documented in `.env.example` but never read — addressing style has always been a property of the driver, so the variable was deleted from the docs rather than honoured. `scripts/push-photos-to-r2.sh` → `push-photos-to-bucket.sh`, now resolving region/endpoint per driver instead of hardcoding `auto` + `--endpoint-url` (`pnpm push:photos` unchanged). New `infra/storage/s3-cors.json` + IAM policy in the README. A third bug surfaced during the first live test and is the reason the `s3` driver ignores `S3_ENDPOINT` entirely: reading it made an S3 config inherit `.env`'s MinIO host and sign a correct `eu-south-2` request against `bucket.localhost:9000`. **Production stays on R2** — this ships the driver, not a migration; the 2026-04-27 egress argument is unchanged. CloudFront deliberately deferred: the 302-to-signed-URL indirection in `/api/photos/cards/[code]` means adding a CDN later touches only how a URL is minted, with no data migration. ADR `2026-09-05-aws-s3-storage-driver.md`.
- 2026-08-28 — Migration `0022_card_snapshots.sql`: new `card_snapshots` table, `cards.current_snapshot_id`, `action_logs.card_snapshot_id` + `snapshot_created`, and `'card_edit'` added to the `log_type` enum. Applied to both local databases (`db:migrate` + `db:migrate:test`); **not yet applied to Neon** — see the checklist. Rollback at `drizzle/down/0022_card_snapshots.down.sql` (lossy: it deletes every snapshot and every `card_edit` row). The "enum value must be ALONE in its file" rule above was restated as what it actually protects — no *use* of the value in the same file — because 0022 adds the value alongside unrelated structural DDL, which is safe and avoids hand-authoring a journal/snapshot pair. ADR `2026-08-28-card-snapshots-write-path.md`. The snapshot READ path (A2, same day) needed **no migration** — it is entirely query and rendering work over this schema — so reaching Neon remains the one outstanding item. ADR `2026-08-28-card-snapshots-read-path.md`.
- 2026-08-26 — Environment topology reworked to local-by-default. One env file per target (`.env` + `.env.development` committed; `.env.local`, `.env.test.local`, `.env.docker`, `.env.prod`, `.env.neon-branch` gitignored), enforced by `assertDatabaseTarget` in the new `src/lib/db/guard.ts` + the `ALLOW_NEON_DB=1` flag that only the `:prod` / `:branch` scripts inject. Before this, `.env.local` held the **production** Neon URL, so `pnpm dev` / `db:migrate` / `db:studio` / `db:seed` all defaulted to production, and 4 of the 11 integration tests created and deleted rows in the live database (the other 7 guarded with a check that failed open). Integration tests now boot through `src/test/setup-integration.ts` under a dedicated vitest `integration` project and fail closed. `BETTER_AUTH_SECRET` / `CRON_SECRET` are now distinct per environment and `RESEND_APIKEY` lives only on Vercel, with `deliverEmail` logging instead of sending when it is empty. `__drizzle_migrations` reconciled on both local DBs, so `drizzle-kit migrate` works again. `.env.local-db` and `scripts/pull-neon-db.sh` deleted (superseded by the default target and `scripts/pull-prod-db.sh`); the `:local-db` script suffixes are gone. ADR `2026-08-26-environment-topology.md`; reference doc `docs/ENVIRONMENTS.md`.
- 2026-08-24 — Presence control: migrations `0020_action_type_toggle.sql` (the schema's first `ALTER TYPE … ADD VALUE`, alone in its file for the transaction rule) and `0021_presence_control.sql` (structural DDL + three hand-written sections: the `is_operator_visible = NOT is_auto_execute` backfill, the `field_values_touch` trigger — the schema's **first trigger** — and the sentinel `user` seed). Rollback in `drizzle/down/0021_presence_control.down.sql`, documented as lossy (toggle actions and their logs cannot survive it; the enum value itself cannot be removed). New `src/lib/db/constants.ts` for values shared between a migration and application code. Verified on PG 15.18 (local) and against PG 15.19 (Neon): full replay on a fresh DB is clean and `drizzle-kit` reports no drift. ADR `2026-08-24-presence-control.md`.
- 2026-08-06 — Migration `0019_lucky_gateway.sql` adds `output_width_cm` / `output_height_cm` / `output_lock_aspect` to `card_designs` (additive, no data migration; rollback in `drizzle/down/0019_card_design_export_size.down.sql`). First use of a `numeric` column in this schema: **both configured drivers return `numeric` as `string`**, so a DAL that exposes it as a number must map on every read path (`mapDesignRow` in `src/lib/dal/card-designs.ts` is the reference) and write `.toString()` to avoid float drift into a `numeric(6,2)`. Feature owned by `card-designs`; ADR `2026-08-06-card-design-export-size.md`.

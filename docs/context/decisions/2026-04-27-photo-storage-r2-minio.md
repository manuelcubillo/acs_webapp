# ADR: Photo storage — Cloudflare R2 + MinIO behind a `CardPhotoStorage` interface

**Date**: 2026-04-27
**Status**: accepted (supersedes constraint `04-constraints.md` §21 `TODO: STORAGE`)
**Modules affected**: fields, cards, card-designs, auth-tenants, infrastructure

## Context

Photos exist in several places across the app and the surface keeps growing: cards with a `photo` field, card-design `image` nodes (static logos and field-bound photos), card-design rendering / PNG export, member avatars (the Better Auth `user.image` column has no UI yet), and a tenant logo (no column yet, but used by `DashboardShell`, transactional email branding, and starter design templates). All photo bytes today are written to `public/uploads/<tenantId>/<year>/<month>/<uuid>.<ext>` by `POST /api/upload` and only the URL is stored in the database.

This is broken in production: Vercel serverless has no durable filesystem, so any photo written by a function instance is lost on the next cold start. The `04-constraints.md` §21 `TODO: STORAGE` already flagged the migration to S3/R2. The volume is modest (thousands of cards × ID-photo size after compression ≈ a few GB total), the access pattern is read-heavy (every card detail, list, scan, design preview, PNG export), and the photos are PII that must be tenant-scoped. A subset of deployments (self-hosted / on-premises for compliance) need to keep object bytes off third-party clouds entirely.

## Decision

**Object store: Cloudflare R2 in production, MinIO for self-hosted and local development, both accessed via the AWS S3 SDK.** R2 wins on this read-heavy workload because egress is free, storage is $0.015/GB-month, and the API is S3-compatible. MinIO presents the same S3 API on a local container, so the application code path is identical between deployment shapes.

**All photo I/O goes through a single `CardPhotoStorage` interface** living in `src/lib/storage/`. The interface exposes (at minimum) `getUploadUrl(scope, contentType, contentLength)`, `getReadUrl(key, options)`, `head(key)`, and `delete(key)`. Two implementations register at runtime based on env vars: `R2Storage` and `MinIOStorage`. A thin `getPhotoStorage()` factory is the single seam between the rest of the app and the bucket.

**Upload flow is presigned PUT, two server actions.** The client requests an upload slot from a Server Action (auth + role guard + tenant scoping), which returns a short-lived (~60 s) presigned URL scoped to the caller's tenant prefix and the requested kind (`card-photo`, `card-design-image`, `member-avatar`, `tenant-logo`). The client PUTs directly to R2/MinIO. A second Server Action confirms the upload (HEAD the object, validate size and content-type, write the object key into the owning row). This bypasses the Vercel 4.5 MB function-payload limit and keeps function CPU off the bytes.

**Object keys are tenant-prefixed and kind-prefixed.** The layout is `<tenant_id>/<kind>/<owner_uuid>/<random>.webp` (e.g. `<tenant_id>/cards/<card_uuid>/<random>.webp`, `<tenant_id>/branding/logo/<random>.webp`). The DAL refuses any read whose key prefix does not match `getCurrentTenant()`. The DB stores the *object key*, not a full URL — URLs are derived at read time.

**Reads use signed GETs (10–15 min TTL) generated server-side and embedded in the page payload.** This composes with the existing `force-dynamic` posture and lets us keep buckets private. The external API route (`/api/cards/[code]`) returns presigned URLs in its response. Cross-origin loading for Konva PNG export is solved by serving objects with `Access-Control-Allow-Origin` configured per environment.

**A reusable optimization module (`src/lib/images/`) processes every photo before upload.** It runs client-side (canvas-based), accepts a per-call `ImageOptimizationProfile` (max dimensions, target format, quality, max output bytes, EXIF strip, optional centre-crop aspect), and returns a `Blob` ready for the presigned PUT. The server side runs a smaller verification pass on confirm (HEAD content-length, content-type allowlist, optional dimension probe). Profiles per kind are declared as constants — `CARD_PHOTO_PROFILE`, `MEMBER_AVATAR_PROFILE`, `TENANT_LOGO_PROFILE`, `CARD_DESIGN_IMAGE_PROFILE` — co-located with the call site that owns the kind.

**Lifecycle.** Cards, members, designs, and tenants are soft-deleted; their photo objects are *not* deleted at soft-delete time. Replacements write a new key (random suffix or content hash) and orphan the previous key for an out-of-band janitor. Hard-deletion of a tenant cascades to a bulk-prefix delete (single DELETE-by-prefix S3 op).

## Consequences

- **Positive:**
  - Real persistence on Vercel; the current production bug is closed.
  - Per-GB cost ~10× cheaper than S3 for this read-heavy shape; total bill at projected volume is sub-dollar.
  - Single interface means swapping R2 ↔ MinIO is a config change, not a code path. Self-hosted parity is automatic.
  - Direct-to-bucket uploads remove the 4.5 MB Vercel limit and keep function billing off image bytes.
  - Server-side signing keeps buckets private and tenant-scoped — no public URL leakage in browser history.
  - Centralised optimization module gives a single place to tune size/quality/format and gives every photo surface predictable storage cost.
- **Negative / trade-offs:**
  - Two new env vars per environment (`S3_*` family); local dev now requires `docker compose up minio` (or a remote dev R2 bucket).
  - Presigned URLs in HTML mean we can't HTTP-cache photos beyond the TTL; we accept this — TTLs are 10–15 min and dashboards are `force-dynamic` anyway.
  - Browser canvas export (PNG export from card design) requires the bucket to send permissive CORS, otherwise canvases taint and `toDataURL()` throws. Cross-origin headers are part of the bucket configuration, not optional.
  - Out-of-band janitor for orphaned objects is now part of the operational surface (acceptable; runs weekly).
- **Follow-ups:**
  - Migration of existing `/uploads/...` URLs in `field_values` (and any seeded card-design `staticUrl`) — one-shot script that copies bytes to R2 and rewrites stored URLs/keys.
  - Add `tenants.logo_object_key` column (new migration) for the tenant logo.
  - Add upload UI for `user.image` (member avatar) inside `/settings/account` and consume it in `MemberRow` and `DashboardShell`.
  - Replace the `staticUrl` text input on `image` design nodes with the same upload control wired to the `card-design-image` kind.
  - Resolves the long-standing `TODO: STORAGE` in `04-constraints.md` §21 — that constraint is rewritten by this ADR.

## Alternatives considered

1. **Vercel Blob.** Quickest to ship and zero-config inside Next.js, but ~50% more expensive than R2 on storage and meaningfully worse on egress, with vendor lock-in and no path to an on-premises mirror. Rejected on cost and on the self-hosted requirement.
2. **AWS S3.** Industry-standard, same SDK, but $0.09/GB egress is the wrong shape for a dashboard that re-fetches photos on every page view. R2's free egress is a 10–100× operational cost difference at this read pattern.
3. **Cloudinary / imgix / Uploadcare.** Built-in transformations are appealing for ID-card use cases (face-aware crop), but their pricing scales with transformations and bandwidth, not storage; monthly cost at this volume can exceed R2 by 10–100×. Rejected — and the optimization module covers the pieces we actually need (resize, recompress, strip EXIF).
4. **Postgres `bytea` on Neon.** Atomic with the row but bloats Neon storage at premium per-GB pricing, ruins `SELECT *`, and the HTTP driver cannot stream — anti-pattern for thousands of binary blobs.
5. **Filesystem-only on the self-hosted target.** Considered as the local fallback, rejected as the *default* local path because it diverges the code path and breaks the presigned-PUT flow. MinIO gives full S3 parity in a single container and is the documented local-dev story.

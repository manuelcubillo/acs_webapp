# ADR: AWS S3 as a third storage driver

**Date**: 2026-09-05
**Status**: accepted (extends `2026-04-27-photo-storage-r2-minio.md`; does not supersede it)
**Modules affected**: infrastructure

## Context

`2026-04-27-photo-storage-r2-minio.md` picked R2 for production and MinIO for
local, and explicitly rejected AWS S3 on egress cost: photo bytes travel
bucket → browser on every card view, and $0.09/GB is the wrong shape for that
read pattern.

That reasoning still holds on cost alone, but it was the only axis considered.
Deployments land where their infrastructure already is — an operator whose
accounts, IAM, VPC and billing are on AWS should not have to introduce a
Cloudflare account to store four kinds of image. The interface the previous ADR
built (`CardPhotoStorage` + `getPhotoStorage()`) exists precisely so the store
is a config choice, and it was never exercised against the provider whose SDK
the code already uses.

The mechanical differences from R2 turned out to be three:

1. **Region is load-bearing.** R2 accepts the literal `"auto"`; AWS signs per
   region and answers `301 PermanentRedirect` when the signature's region does
   not match the bucket's.
2. **The endpoint must not be set.** For R2 and MinIO it is mandatory. For AWS,
   passing one bypasses the SDK's regional resolver, so a hand-written host and
   a `region` value can disagree silently.
3. **Nothing else.** Presigned PUT/GET, `head`, `delete`, `ListObjectsV2` +
   `DeleteObjects` are the same S3 API calls the shared base class already
   makes through `@aws-sdk/client-s3`.

## Decision

**Add `AwsS3Storage` as a third adapter behind the same `CardPhotoStorage`
interface, selected by `STORAGE_DRIVER=s3`.** It is a shim over
`S3CompatibleStorage` exactly like `R2Storage` and `MinIOStorage`: virtual-host
addressing, no endpoint, region from `S3_REGION`.

**`endpoint` becomes optional on `S3StorageConfig`, and is omitted from the
`S3Client` config rather than passed as `undefined`** — the SDK skips its
regional resolver whenever the key is present at all.

**The `s3` driver does not read `S3_ENDPOINT`. Its escape hatch is
`S3_ENDPOINT_OVERRIDE`.** This was found the hard way: the first working build
read `S3_ENDPOINT` and treated "unset" as "resolve regionally", which is wrong,
because env files merge *per variable*, not per block. `.env` points
`S3_ENDPOINT` at MinIO and Vercel points it at R2, so an `s3` config that
simply omitted it inherited the neighbouring provider's host and signed a
perfectly valid `eu-south-2` request against
`bucket-name.localhost:9000` — a `net::ERR_CONNECTION_REFUSED` whose signature,
region and credentials all looked correct. Making the endpoint *opt-in under a
name only this driver reads* removes the failure instead of documenting it:
there is nothing to unset, and no lower-priority file can hand the value down.

**`S3_REGION` is required for the `s3` driver, with no default.** The `minio`
driver keeps its `us-east-1` fallback (MinIO ignores the value); the `r2`
driver keeps hardcoding `"auto"` and ignores the variable entirely. A default
here would work for exactly one region's buckets and fail confusingly for every
other, so the factory throws instead.

**`S3_FORCE_PATH_STYLE` is deleted from the documentation.** It was documented
in `.env.example` but never read by `index.ts` — addressing style has always
been a property of the driver. The variable is inert wherever it still exists.

**`scripts/push-photos-to-r2.sh` becomes
`scripts/push-photos-to-bucket.sh`** and resolves region + endpoint the same
way `index.ts` does, per `STORAGE_DRIVER` in `.env.prod`. It previously
hardcoded `AWS_DEFAULT_REGION=auto` and always passed `--endpoint-url`, both of
which are wrong against AWS. `pnpm push:photos` is unchanged.

**Production stays on R2.** This ADR ships the driver, not a migration. The
cost argument in the 2026-04-27 ADR is unchanged, and switching is a
variables-plus-object-copy operation whenever it is wanted.

**CloudFront is explicitly deferred.** See "Follow-ups".

## Consequences

- **Positive:**
  - The provider is now genuinely a config choice, which is what the original
    interface promised. Three adapters, ~35 lines each, one shared base.
  - AWS-native deployments need no third-party account for object storage.
  - Two latent bugs are gone: a mandatory `S3_ENDPOINT` that AWS must not have,
    and a documented env var that nothing reads.
  - The photo-push script is provider-agnostic, so it keeps working across a
    future switch instead of silently signing for the wrong host.
- **Negative / trade-offs:**
  - A third driver to keep in step. Mitigated by the base class: an adapter
    only chooses region, endpoint and addressing style.
  - On S3, egress is billed per GB. At the current shape — signed GET straight
    from the bucket on every card view, list and scan — that is a real line
    item that R2 does not have.
  - `S3_REGION` now has driver-dependent semantics (required / ignored /
    optional). Documented in `.env.example` and `infra/storage/README.md`.
- **Follow-ups:**
  - **CloudFront (or any CDN) is deferred, and can stay deferred.**
    `/api/photos/cards/[code]` answers a 302 to a freshly signed URL, so the
    signing target is one function in `src/lib/storage/read.ts` and the DB
    stores keys rather than URLs. Putting a distribution in front later is a
    change to how a URL is minted (CloudFront signed URLs use a key pair, not
    SigV4), with no data migration and no client change. Reach for it when the
    egress line item justifies it, not before.
  - Smoke-test a real presigned PUT against an AWS bucket before switching
    production: the SDK's default request checksums add `x-amz-checksum-*` to
    `PutObject`, and although the same SDK version signs correctly against R2
    and MinIO today, AWS is the strict implementation of that behaviour.
  - Server-side encryption is left at the bucket default (SSE-S3). SSE-KMS
    would require the matching headers on both the presigned PUT and the
    client's request.

## Alternatives considered

1. **Keep R2 as the only cloud driver.** Cheapest and least code, but leaves
   `CardPhotoStorage` untested against the provider its own SDK targets, and
   forces a Cloudflare account on AWS-native deployments.
2. **Make `S3_REGION` default to `us-east-1` for the `s3` driver.** Fewer
   required variables, but the failure it causes is a 301 on every call with no
   hint that the region is the reason. An explicit throw at construction names
   the missing variable.
3. **Keep reading `S3_ENDPOINT` and document "leave it empty" for AWS.** This
   is what shipped first, and it failed in the first real test. A deployment
   instruction that says "delete this variable" is a trap: the variable already
   exists in every environment, the wrong value produces a request that is
   valid in every respect except its host, and nothing fails until a browser
   tries to fetch an image. Validating the value instead (e.g. rejecting hosts
   that are not `amazonaws.com`) was also rejected: it breaks legitimate
   gateways behind custom domains and still leaves the trap armed.
4. **Honour `S3_FORCE_PATH_STYLE` instead of deleting it.** Would make the
   documentation true, but adds a knob whose only correct value is already
   implied by the driver, and one more way to misconfigure a bucket.
5. **Ship CloudFront together with the driver.** Adds a distribution, an OAC, a
   key group and a second signing path to a change that otherwise touches three
   files — and would be dead weight while production remains on R2, where
   egress is free.

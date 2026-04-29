# 04 · Non-negotiable Constraints

**Last updated**: 2026-04-26

These rules are **non-negotiable**. Any proposed change to one of them requires an ADR in `decisions/` that explicitly supersedes this document.

## Security and tenancy

1. `tenant_id` is always derived from the authenticated session via `getCurrentTenant()`. Never accepted from client input, URL params, or request body.
2. The only exception is the external API (`/api/cards/...`) which currently uses the `x-tenant-id` header. This is a **temporary** workaround marked `TODO: API_AUTH`.
3. Card UUIDs are never exposed to the client. The public Card identifier is `code`, unique per `(tenant_id, code)`.
4. Every Server Action starts with a role guard (`requireOperator`, `requireAdmin`, `requireMaster`) before reading inputs.
5. At least one `master` must exist per tenant at all times. Enforced at the DAL when demoting/removing the last master.

## Data integrity

6. Soft delete everywhere — `is_active = false`. Hard deletes are forbidden for `field_definitions`, `card_types`, `action_definitions`, `scan_validations`, `cards`.
7. `field_type` on a `field_definition` cannot change once any `FieldValue` exists for that field. UI must block, DAL must refuse.
8. Validation runs on both frontend and backend. The backend is the source of truth.

## Scan and action semantics

9. Scan validations **inform** but never **block** action execution.
10. Operational scans are always logged and always trigger auto-actions. Informational consultations are never logged and never trigger auto-actions. These paths must remain distinct.
11. Auto-actions execute sequentially and **stop on first failure**. No parallel execution, no "best effort".
12. If `allow_override_on_error = true` for the tenant, a failed auto-action surfaces the override modal. The override decision must be captured in the action log.
13. `executeAction` follows the sequence: read current value → compute new value → write → log with before/after. Because Neon HTTP does not support interactive transactions, atomicity is best-effort — the known risk is documented in `modules/actions.md`.

## UI and UX

14. Responsive-first. Operators use tablets and phones. Test layouts at mobile widths before desktop.
15. **All text displayed on pages must live in constants or message objects.** No inline strings in JSX. ❌ `<p>Delete account</p>` → ✅ `<p>{TEXT.DELETE_ACCOUNT}</p>`. This enables i18n, testability, and consistency.
16. No shadcn/ui. UI is custom Tailwind. Do not introduce a new component library without a preceding ADR.

## Code organization

17. All comments and JSDoc in English.
18. Each component and significant function in its own file.
19. Barrel exports in `src/lib/api/index.ts` and `src/lib/dal/index.ts` must include every new public helper.
20. Shared components (used by 2+ domains) live in `src/components/shared/`.

## Storage

21. Photo I/O goes through the `CardPhotoStorage` interface in `src/lib/storage/`. Cloudflare R2 is the production driver, MinIO the self-hosted / local driver — both reached via the AWS S3 SDK. Uploads are presigned PUTs scoped per kind (`card-photo`, `card-design-image`, `member-avatar`, `tenant-logo`); reads return 15-minute signed GETs. The DB stores **object keys**, not URLs. Tenant prefix is the security primitive — every read/confirm refuses keys outside the caller's tenant. Optimization (resize, recompress, EXIF strip) runs client-side in `src/lib/images/` against per-kind profiles. See ADR `2026-04-27-photo-storage-r2-minio.md`.

## Invitation flow

22. Member invitations use a `member_invitations` table with a cryptographically random token. Emails are sent via Resend. Tokens expire in 7 days. The accept route (`/invitations/[token]`) is public — the token is the authentication. The `TODO: INVITATIONS` marker has been resolved.

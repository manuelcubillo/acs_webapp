# ADR: Member Invitations — Full Management Feature

**Date**: 2026-04-26
**Status**: accepted
**Modules affected**: auth-tenants, infrastructure

## Context

The system previously supported only immediate member addition (existing Better Auth users only, `inviteMemberAction` in members.ts). This blocked admins from onboarding new staff who had no account yet. The TODO: INVITATIONS marker tracked this gap. We needed: (1) email-based invitation flow for new users, (2) fine-grained permission checks for member management, (3) deactivation/removal with session invalidation, (4) soft-remove semantics distinct from deactivation.

## Decision

**Invitation table**: Added `member_invitations` with a `randomBytes(32).hex` token, 7-day expiry, and three mutually exclusive terminal states (`accepted_at`, `revoked_at`, or expired). Token-only authentication for the accept route — no Better Auth session required. This follows the same pattern as Better Auth's own password-reset token flow.

**Soft-remove vs deactivate**: `is_active = false` is deactivation (reversible). `removed_at IS NOT NULL` is removal (UI-irreversible, but data-preserved). Both are enforced via `isNull(removedAt)` filters in all default DAL queries. This distinction preserves audit trail while giving admins a clear "permanent" removal action.

**Permissions in actions + DAL, not middleware**: Every member management action goes through `requireAdmin` + `canManage(actorRole, targetRole)` + `canAssignRole(actorRole, newRole)` checks from `src/lib/auth/role-hierarchy.ts`. The same helpers are imported in UI components to disable buttons. No middleware was introduced (constraint from `04-constraints.md`).

**Session invalidation on deactivate/remove**: On deactivation or removal, all rows in the `session` table for the affected user are deleted. Combined with the dashboard layout's per-request membership check (`getMemberByUserId`), this ensures deactivated users lose access on the next request even if their session cookie is still valid.

**Best-effort acceptance**: The `acceptInvitationAction` follows ADR `2026-04-25-tenant-bootstrap-best-effort.md`: if user creation succeeds but `addMember` fails, the user is NOT deleted. The client receives `userCreated: true` and is told to try logging in — an admin can manually add them via `addExistingUserAction`.

## Consequences

- **Positive:** Full invitation lifecycle; admins can manage all members below their role; deactivated/removed members lose access immediately; invitation emails via Resend.
- **Negative / trade-offs:** The `session` table delete on deactivation is not atomic with the `tenant_members` update (Neon HTTP, no interactive transactions). Race window: user may complete one more request between updates. Acceptable for this domain.
- **Follow-ups:** The accept route (`/invitations/[token]`) is public and processes cryptographic tokens. If rate-limiting is added to the app, this route should be protected.

## Alternatives considered

1. **Better Auth's built-in organization/member plugin** — not available in Better Auth v1.5. Would require an upgrade path.
2. **Invitation via URL param only (no email)** — rejected; admins need to onboard users who don't yet know the system URL.
3. **Separate `removed_members` audit table instead of `removed_at` column** — rejected; column approach keeps all membership history in one table with simpler queries.

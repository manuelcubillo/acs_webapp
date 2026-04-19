# Module: auth-tenants

**Last updated**: 2026-04-19 · **Last feature**: documentation sync against source code

## Responsibility

Authentication (Better Auth), tenant management, multi-tenancy boundary, membership, and role-based guards. Anything that answers "who is calling and what can they do".

## Key files

- `src/lib/auth.ts` — Better Auth server config.
- `src/lib/auth-client.ts` — Better Auth browser client.
- `src/lib/api/auth.ts` — `getCurrentTenant`, `requireAuth`, `requireRole`, `requireOperator`, `requireAdmin`, `requireMaster`, `getTenantFromHeader` (external API only).
- `src/lib/dal/tenants.ts` — Tenant CRUD, scan mode, override setting.
- `src/lib/dal/members.ts` — Membership CRUD, role transitions, last-master invariant.
- `src/lib/actions/tenants.ts` — Tenant-level Server Actions.
- `src/lib/actions/members.ts` — Invite/remove/change role Server Actions.
- `src/app/(auth)/login/page.tsx` — Email+password login page.
- `src/app/api/auth/[...all]/route.ts` — Better Auth handler.
- `src/lib/db/schema/auth.ts` — Better Auth tables (`user`, `session`, `account`, `verification`).
- `src/lib/db/schema/access-control.ts` — `tenants`, `tenant_members` definitions.

## Data model (relevant subset)

- `tenants(id, name, scan_mode, created_at, updated_at)` — `allow_override_on_error` is **not** here; it lives in `dashboard_settings`.
- `tenant_members(id, tenant_id, user_id, role, is_active, ...)` — unique on `(tenant_id, user_id)`.
- Better Auth: `user`, `session`, `account`, `verification`.

## Main flows

### Login

1. User submits email + password on `/login`.
2. `authClient.signIn.email(...)` establishes session.
3. Session cookie is read server-side by `getCurrentTenant()` on each subsequent request.

### Role check at a Server Action

1. Server Action entry → `await requireRole('admin')` (or specific guard).
2. On failure: `AuthenticationError` or `AuthorizationError` thrown.
3. `actionHandler` wrapper converts to `{ success: false, code: 'UNAUTHENTICATED' | 'UNAUTHORIZED' }`.

### Role demotion safeguard

1. `updateMemberRoleAction(memberId, newRole)` calls DAL.
2. DAL checks: if this is the last `master`, refuse with `ForbiddenOperationError`.
3. Same check in `removeMemberAction`.

## Extension points

- **New role** → extend `tenant_role` enum, update `ROLE_ORDER`, add `requireX()` guard, update `canSee` nav filter in `DashboardShell`.
- **New tenant-level setting** → add column to `tenants`, extend Server Actions, surface in `/settings/*` (typically `master`-gated).
- **Route-level auth** → call the relevant `requireX()` at the top of the `page.tsx` server component. There is no middleware.

## Module interactions

- Consumed by: every Server Action (guards), every DAL function (tenant scoping).
- Writes to: `tenants`, `tenant_members`, Better Auth tables.
- Does not log to `action_logs`.

## Open TODOs

- [ ] `TODO: API_AUTH` (`src/lib/api/auth.ts` ~line 170) — `getTenantFromHeader` uses raw `x-tenant-id` with no authentication. Replace with API key lookup where each key carries a pre-configured role.
- [ ] `TODO: INVITATIONS` (`src/lib/actions/members.ts`) — member invitation is immediate add (existing users only). Need pending-membership + acceptance-token flow.

## Future considerations

- Finer-grained role checks in some tenant management endpoints (no code tag).

## Recent changes

- 2026-04-19 — Initial extraction from technical handoff.
- 2026-04-19 — Synchronized documentation against source code: corrected `tenants` data model (removed `allow_override_on_error`), removed stale `TODO: ROLES` and `TODO: API_KEYS` (no code tags found), corrected `TODO: API_AUTH` line number.

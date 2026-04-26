# Module: auth-tenants

**Last updated**: 2026-04-25 · **Last feature**: public sign-up + tenant bootstrap (master account creation)

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
- `src/app/(auth)/login/page.tsx` — Login server component.
- `src/app/(auth)/login/LoginClient.tsx` — Login form (username + password, "forgot password" + "create account" links).
- `src/app/(auth)/sign-up/page.tsx` — Sign-up server component.
- `src/app/(auth)/sign-up/SignUpClient.tsx` — Public sign-up form (name + email + username + password); calls `authClient.signUp.email` and pushes to `/onboarding/create-tenant`.
- `src/app/(auth)/onboarding/create-tenant/page.tsx` — Server component; redirects to `/dashboard` if `user.tenantId` already set, else renders the form.
- `src/app/(auth)/onboarding/create-tenant/CreateTenantClient.tsx` — Organization-name form; calls `createTenantWithMasterAction`.
- `src/app/(dashboard)/layout.tsx` — Pass-through gate: redirects to `/login` (no session) or `/onboarding/create-tenant` (`user.tenantId` null) before any dashboard page renders.
- `src/app/(auth)/forgot-password/page.tsx` — Forgot-password server component.
- `src/app/(auth)/forgot-password/ForgotPasswordClient.tsx` — Email form; calls `authClient.requestPasswordReset`.
- `src/app/(auth)/reset-password/page.tsx` — Reset-password server component (wrapped in `<Suspense>`).
- `src/app/(auth)/reset-password/ResetPasswordClient.tsx` — New-password form; reads `?token` from URL; calls `authClient.resetPassword`.
- `src/app/api/auth/[...all]/route.ts` — Better Auth handler.
- `src/lib/db/schema/auth.ts` — Better Auth tables (`user`, `session`, `account`, `verification`).
- `src/lib/db/schema/access-control.ts` — `tenants`, `tenant_members` definitions.

## Data model (relevant subset)

- `tenants(id, name, scan_mode, created_at, updated_at)` — `allow_override_on_error` is **not** here; it lives in `dashboard_settings`.
- `tenant_members(id, tenant_id, user_id, role, is_active, ...)` — unique on `(tenant_id, user_id)`.
- Better Auth: `user`, `session`, `account`, `verification`.

## Main flows

### Public sign-up (new tenant + master)

1. User clicks "Crear una" on `/login` → `/sign-up`.
2. `authClient.signUp.email({ name, email, username, password })` creates the Better Auth user and an active session. `user.tenantId` is `null` at this point.
3. Client pushes `/onboarding/create-tenant`. The `(dashboard)` layout would otherwise bounce them here on any other URL.
4. User submits an organization name → `createTenantWithMasterAction({ name })` (in `src/lib/actions/tenants.ts`).
5. Action runs sequentially under `requireAuth()` (no role yet): `createTenant` → `addMember(role: "master")` → `upsertDashboardSettings({})` → `auth.api.updateUser({ tenantId })`. Best-effort atomicity per ADR `2026-04-25-tenant-bootstrap-best-effort.md`; failures after step 1 trigger a compensating `deleteTenant`.
6. Action refuses if `session.user.tenantId` is already set (one tenant per user).
7. Client `router.refresh()` + push to `/dashboard`. The new `tenantId` is now in the session.

### Login

1. User submits username + password on `/login`.
2. `authClient.signIn.username(...)` establishes session (requires `usernameClient()` plugin on both server and client).
3. Session cookie is read server-side by `getCurrentTenant()` on each subsequent request.

### Password reset

1. User clicks "¿Olvidaste tu contraseña?" on `/login` → `/forgot-password`.
2. `authClient.requestPasswordReset({ email, redirectTo: origin + "/reset-password" })` sends a reset email via Resend (`emailAndPassword.sendResetPassword` callback in `auth.ts`).
3. Better Auth generates a token, stores it in the `verification` table, and emails a link to `/api/auth/reset-password/TOKEN?callbackURL=...`.
4. User clicks link → Better Auth validates token → redirects to `/reset-password?token=TOKEN`.
5. User submits new password → `authClient.resetPassword({ newPassword, token })` → session-ready, redirect to `/login`.

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

- 2026-04-25 — Added public sign-up + tenant bootstrap. New `/sign-up` and `/onboarding/create-tenant` pages, `createTenantWithMasterAction` in `src/lib/actions/tenants.ts`, pass-through `(dashboard)/layout.tsx` gate, "create account" link on login. ADR `2026-04-25-tenant-bootstrap-best-effort.md` captures the best-effort sequential write strategy.
- 2026-04-25 — Added password recovery flow: `/forgot-password` + `/reset-password` pages, Resend email transport in `auth.ts`, "forgot password" link on login page. Corrected Login flow (username, not email).
- 2026-04-19 — Initial extraction from technical handoff.
- 2026-04-19 — Synchronized documentation against source code: corrected `tenants` data model (removed `allow_override_on_error`), removed stale `TODO: ROLES` and `TODO: API_KEYS` (no code tags found), corrected `TODO: API_AUTH` line number.

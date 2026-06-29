# Module: auth-tenants

**Last updated**: 2026-06-07 · **Last feature**: Phase 3 token/shadcn migration of members + auth screens; new `--role-*` tokens for role badges; `AuthShell` extracted (ADR `2026-06-07-phase3-inline-style-migration.md`)

## Responsibility

Authentication (Better Auth), tenant management, multi-tenancy boundary, membership, and role-based guards. Anything that answers "who is calling and what can they do".

## Key files

- `src/lib/auth.ts` — Better Auth server config.
- `src/lib/auth-client.ts` — Better Auth browser client.
- `src/lib/api/auth.ts` — `getCurrentTenant`, `requireAuth`, `requireRole`, `requireOperator`, `requireAdmin`, `requireMaster`, `getTenantFromHeader` (external API only).
- `src/lib/dal/tenants.ts` — Tenant CRUD, scan mode, override setting.
- `src/lib/auth/role-hierarchy.ts` — `ROLE_ORDER`, `canManage`, `canAssignRole` helpers (single source of truth for permission checks).
- `src/lib/email/send.ts` — Shared Resend client + `sendInvitationEmail`.
- `src/lib/dal/members.ts` — Membership CRUD, role transitions, activate/deactivate/remove, profile update, last-master invariant. Filters `removedAt IS NULL` by default.
- `src/lib/dal/invitations.ts` — `createInvitation`, `getInvitationByToken`, `listPendingInvitations`, `findPendingInvitation`, `revokeInvitation`, `acceptInvitation`.
- `src/lib/actions/tenants.ts` — Tenant-level Server Actions.
- `src/lib/actions/members.ts` — Member management actions (createAndAddMember, addExistingUser, updateRole, setActive, remove, updateProfile, triggerPasswordReset, checkOwnMembershipStatus). All @role admin except checkOwnMembershipStatus (public).
- `src/lib/actions/invitations.ts` — `inviteMemberByEmailAction`, `revokeInvitationAction`, `listPendingInvitationsAction`, `acceptInvitationAction` (public).
- `src/app/(auth)/login/page.tsx` — Login server component.
- `src/app/(auth)/login/LoginClient.tsx` — Login form; calls `checkOwnMembershipStatusAction` after sign-in to bounce deactivated members.
- `src/app/(auth)/invitations/[token]/page.tsx` — Public invitation accept page (no auth guard).
- `src/app/(auth)/invitations/[token]/InvitationAcceptClient.tsx` — Registration / join form.
- `src/app/(auth)/account-deactivated/page.tsx` — Shown when a member's access is revoked; signs out client-side.
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
- `src/lib/db/schema/access-control.ts` — `tenants`, `tenant_members`, `departure_feedback` definitions.
- `src/lib/actions/account.ts` — `deleteAccountAction`, `submitDepartureFeedbackAction`.
- `src/app/(auth)/goodbye/page.tsx` — Goodbye server page (no auth guard).
- `src/app/(auth)/goodbye/GoodbyeClient.tsx` — Farewell UI + optional feedback form; reads `?fid` to link feedback to deletion event.
- `src/components/settings/account/DeleteAccountModal.tsx` — Simple confirmation modal (non-last-master case).
- `src/components/settings/account/DeleteTenantAccountModal.tsx` — Typed-phrase confirmation modal (last-master case; requires typing "confirmar borrado de datos").

## Data model (relevant subset)

- `tenants(id, name, scan_mode, logo_object_key, created_at, updated_at)` — `allow_override_on_error` is **not** here; it lives in `dashboard_settings`. `logo_object_key` is the photo storage key (signed at render).
- `tenant_members(id, tenant_id, user_id, role, is_active, removed_at, ...)` — unique on `(tenant_id, user_id)`. `removed_at IS NOT NULL` = soft-removed; hidden from all default queries.
- `member_invitations(id, tenant_id, email, role, token, invited_by_user_id, expires_at, accepted_at, revoked_at, created_at)` — token is unique; pending = all three nullable timestamp columns are null AND expires_at > now().
- `departure_feedback(id, name, email, tenant_name, reason, comment, created_at)` — no FK constraints; row created during deletion before user/tenant is removed. `reason` and `comment` filled in later by `submitDepartureFeedbackAction` via `?fid` token.
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

### Account deletion

1. User clicks "Eliminar cuenta" in `/settings/account` (admin+ only route).
2. Server page pre-fetches `masterCount = countActiveMasters(tenantId)` and passes it to `AccountSettings` client.
3. Client shows the appropriate confirmation modal:
   - **Non-last-master** (`role !== 'master'` or `masterCount > 1`): `DeleteAccountModal` — simple confirm.
   - **Last master** (`role === 'master'` and `masterCount === 1`): `DeleteTenantAccountModal` — user must type "confirmar borrado de datos" to enable the confirm button.
4. On confirm → `deleteAccountAction()`:
   a. Collects `name`, `email`, `tenant.name` before any deletion.
   b. Inserts `departure_feedback` row (captures PII that would otherwise be lost).
   c. If last master: `deleteTenant(tenantId)` → cascades all tenant data.
   d. `auth.api.signOut()` — invalidates session server-side.
   e. `db.delete(user)` — cascades `session`, `account`, `tenant_members`.
   f. Returns `{ feedbackId }`.
5. Client does `window.location.href = /goodbye?fid=<feedbackId>` (full navigation to avoid dashboard layout auth checks on dead session).
6. Goodbye page (`/goodbye`) — no auth guard. User optionally submits reason + comment → `submitDepartureFeedbackAction({ feedbackId, reason, comment })` updates the pre-created row.

See ADR `2026-04-26-account-deletion-feedback-token.md`.

### Member invitation by email

1. Admin calls `inviteMemberByEmailAction({ email, role })`.
2. Action validates no pending invitation exists and email isn't an active member.
3. Inserts `member_invitations` row with `token = randomBytes(32).hex`, `expiresAt = now + 7d`.
4. Sends email via Resend with link `${BETTER_AUTH_URL}/invitations/${token}`.
5. Invitee opens link → `/invitations/[token]` page fetches invitation and renders form.
6. On submit: `acceptInvitationAction({ token, name, username, password })`:
   - If email has existing user: `addMember` + update `user.tenantId` if null + mark accepted.
   - If new user: `auth.api.signUpEmail` → `addMember` → update `user.tenantId` → mark accepted.
7. Client signs in (new users) or redirects to /dashboard (existing users).

### Create and add a new member

1. Admin opens the "Usuario nuevo" tab in `InviteMemberModal` and fills in email, name, username, password, role.
2. `createAndAddMemberAction({ email, name, username, password, role })`:
   - Rejects if the email already exists in the `user` table (any tenant — one user per tenant invariant).
   - `auth.api.signUpEmail` creates the Better Auth user with `tenantId: null`.
   - `addMember(tenantId, newUserId, { role })` adds the membership.
   - `db.update(user).set({ tenantId })` links the user to the tenant.
3. User account is active immediately; no invitation email sent, no sign-in step required from the admin.

### Member deactivate / reactivate

- `setMemberActiveAction(memberId, isActive)` — requireAdmin + canManage check.
- On deactivation: deletes all session rows for that user (immediate logout).
- `(dashboard)/layout.tsx` checks membership on every request; redirects removed/deactivated members to `/account-deactivated`.
- `LoginClient` calls `checkOwnMembershipStatusAction` after sign-in to bounce before reaching the layout.

### Member removal (soft)

- `removeMemberAction(memberId)` — requireAdmin + canManage + last-master guard.
- Sets `removedAt = now()` + `isActive = false` + deletes sessions + clears `user.tenantId`.
- Removed members are invisible to all default DAL queries (filter `removedAt IS NULL`).
- Invitations to a removed member's email are allowed again.

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
- Writes to: `tenants`, `tenant_members`, `departure_feedback`, Better Auth tables.
- Does not log to `action_logs`.

## Open TODOs

- [ ] `TODO: API_AUTH` (`src/lib/api/auth.ts` ~line 170) — `getTenantFromHeader` uses raw `x-tenant-id` with no authentication. Replace with API key lookup where each key carries a pre-configured role.

## Future considerations

- Finer-grained role checks in some tenant management endpoints (no code tag).

## Recent changes

- 2026-04-28 — Member avatar (`user.image`) and tenant logo (`tenants.logo_object_key`, migration 0015) wired through `PhotoUploader`. New actions: `setMyAvatarAction` (operator+ self-edit), `setCurrentTenantLogoAction` (master). New DAL helper `setUserAvatar`. `MemberWithUser.userImage` exposed by `listMembers`; the members page batch-signs avatars. `DashboardShell` shows tenant logo (sidebar) and user avatar (topbar) when present, falling back to initials. ADR `2026-04-27-photo-storage-r2-minio.md`.
- 2026-04-26 — Replaced "Usuario existente" tab in `InviteMemberModal` with "Usuario nuevo" tab. Added `createAndAddMemberAction`: validates email uniqueness across all tenants, creates user via `auth.api.signUpEmail`, adds membership, links `user.tenantId`. `addExistingUserAction` retained for programmatic use only.
- 2026-04-26 — Added full member management: email invitations (`member_invitations` table, token flow, Resend email), deactivate/reactivate with session invalidation, soft-remove (`removedAt`), profile edit, password-reset trigger, role changes via `canManage`/`canAssignRole`. `/members` page now requireAdmin. `/invitations/[token]` public accept page. `/account-deactivated` page. Dashboard layout blocks deactivated/removed members. ADR `2026-04-26-member-invitations.md`.
- 2026-04-26 — Added account deletion flow. New `deleteAccountAction` (pre-creates `departure_feedback` row to capture PII), `DeleteAccountModal` / `DeleteTenantAccountModal` (last-master requires typed phrase), `/goodbye` page with optional feedback form via `?fid` token. ADR `2026-04-26-account-deletion-feedback-token.md`.
- 2026-04-25 — Added public sign-up + tenant bootstrap. New `/sign-up` and `/onboarding/create-tenant` pages, `createTenantWithMasterAction` in `src/lib/actions/tenants.ts`, pass-through `(dashboard)/layout.tsx` gate, "create account" link on login. ADR `2026-04-25-tenant-bootstrap-best-effort.md` captures the best-effort sequential write strategy.

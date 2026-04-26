## ADR: Tenant bootstrap is best-effort sequential, not transactional

**Date**: 2026-04-25
**Status**: accepted
**Modules affected**: auth-tenants, infrastructure

## Context

Public sign-up creates a user, a tenant, the first `master` membership, default `dashboard_settings`, and updates `user.tenantId` — five writes that must succeed together or the account is left in a broken state (authenticated but no tenant, or tenant with no master). Neon's HTTP driver does not support interactive transactions, so the same constraint that affects `executeAction` (see `2026-03-09-auto-actions-sequential.md`) applies here. Wrapping the writes in a true transaction would require swapping the DB driver, which has wider blast radius than this feature warrants.

## Decision

`createTenantWithMasterAction` performs the writes sequentially. If any step after the initial `createTenant` fails, the tenant is removed via a compensating `deleteTenant` (cascades clear member + settings) and the original error is surfaced to the operator so they can retry.

The first write — creating the tenant row — has no compensation: if it fails, nothing has changed and the action returns the error. The Better Auth `auth.api.updateUser` call is the last step on purpose, so a failure there leaves the tenant + master + settings consistent and only `user.tenantId` is missing — re-running the action will hit the "already has tenant" guard once the session refreshes, and the operator can be guided to log out / log back in. In practice this scenario is extremely rare.

## Consequences

- **Positive:** No driver swap. Behaviour matches the existing `executeAction` precedent. Failure mode is well-defined and recoverable (retry yields a clean state).
- **Negative / trade-offs:** A process crash between writes can still leave a partial state. Compensating delete itself can fail (logged-and-swallowed); a residual orphan tenant is possible but bounded to the user who triggered it. There is no automated reconciliation.
- **Follow-ups:** When the platform migrates to a transactional driver (Neon WebSocket, or an alternative pooler), revisit this action and `executeAction` together — both should adopt true transactions in the same change.

## Alternatives considered

- **Swap to Neon WebSocket driver for this action only.** Rejected: dual-driver setup adds complexity; benefit is small for a low-frequency flow.
- **Defer tenant creation until a separate retry job picks it up.** Rejected: introduces a job runner the project does not have, and operators expect immediate feedback during onboarding.
- **Skip `dashboard_settings` seeding (do it lazily on first read).** Rejected: the existing `getDashboardSettings` returns null for missing rows and callers fall back to defaults, but seeding here keeps the tenant fully provisioned in one place and avoids implicit-creation surprises.

# ADR: Account deletion — pre-created feedback row with fid token

**Date**: 2026-04-26
**Status**: accepted
**Modules affected**: auth-tenants, infrastructure

## Context

The account deletion flow must capture the departing user's name, email, and tenant name for analytics, and optionally collect a reason on a post-deletion goodbye page. The challenge: by the time the user reaches `/goodbye`, the account (including the session) is already deleted, so an authenticated write is impossible. Three approaches were considered for linking the goodbye-page feedback back to the deletion event and capturing PII.

## Decision

`deleteAccountAction` creates a `departure_feedback` row (with `name`, `email`, `tenant_name`) **before** deleting the user or tenant. It returns the row's `id` as `feedbackId`. The client redirects to `/goodbye?fid=<feedbackId>`. The goodbye page calls `submitDepartureFeedbackAction({ feedbackId, reason, comment })` — a no-auth Server Action that updates the pre-existing row.

## Consequences

- **Positive:** PII is always captured even if the user skips or closes the goodbye page. The feedback row is always linkable to the deletion event.
- **Negative / trade-offs:** `departure_feedback` requires no FK constraints (user/tenant are gone), so referential integrity cannot be enforced at the DB level. The `fid` UUID in the URL is guessable in format but not in value (UUID v4), which is an acceptable trust level for unauthenticated feedback submission (low-stakes data).
- **Follow-ups:** The `submitDepartureFeedbackAction` is fully public; spam is mitigated only by UUID entropy. Rate limiting can be added later if needed.

## Alternatives considered

1. **Pass name/email/tenantName via URL query params to `/goodbye`**: simpler, but leaks PII in browser history, server logs, and referrer headers. Rejected.
2. **Collect feedback in the confirmation modal before deletion** (include reason as a parameter to `deleteAccountAction`): avoids the unauthenticated endpoint entirely, but UX is worse — forces the user to state a reason before they can delete, mixing confirmation with feedback. Rejected in favour of the post-redirect model.

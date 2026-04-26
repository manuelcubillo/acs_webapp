# ADR: Resend as transactional email provider

**Date**: 2026-04-25
**Status**: accepted
**Modules affected**: auth-tenants, infrastructure

## Context

Password recovery requires sending transactional emails with reset tokens. The app has no existing email infrastructure. The stack deploys on Vercel and uses a serverless-first architecture (Neon HTTP driver, no long-lived processes), so SMTP connections with pooling are impractical. An HTTP-based email API is the natural fit.

## Decision

Use Resend (`resend` v6.12.2) as the transactional email provider. The client is instantiated in `src/lib/auth.ts` and called inside Better Auth's `emailAndPassword.sendResetPassword` callback. Configuration is via `RESEND_APIKEY` and `RESEND_FROM_EMAIL` env vars.

## Consequences

- **Positive:** Simple HTTP SDK, no SMTP configuration, generous free tier (3 000 emails/month), first-class Vercel integration.
- **Negative / trade-offs:** External service dependency; `RESEND_FROM_EMAIL` must be a Resend-verified domain — development without a verified domain requires using Resend's sandbox address or a test API key.
- **Follow-ups:** If the app needs marketing/bulk email in future, a second Resend sender or a dedicated marketing provider should be evaluated separately. Do not reuse the password-reset sender for bulk sends.

## Alternatives considered

- **Nodemailer (SMTP)** — rejected; requires persistent SMTP connections or per-request connection setup, which adds latency and complexity in a serverless environment.
- **SendGrid** — comparable HTTP API, but heavier SDK and pricing is less favorable at this scale.

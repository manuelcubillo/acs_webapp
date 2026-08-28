# ADR: Local-by-default environment topology

**Date**: 2026-08-26
**Status**: accepted
**Modules affected**: infrastructure, auth-tenants

## Context

Five `.env` files had accumulated with no rule governing which one a command
would load. `.env.local` — the file Next.js loads automatically for `pnpm dev`,
that `drizzle.config.ts` hardcoded, and that every standalone script and every
integration test read — held the **production** Neon URL. So `pnpm dev`,
`pnpm db:migrate`, `pnpm db:studio` and `pnpm db:seed` all defaulted to
production, and the safe path was an opt-in `:local-db` suffix nobody could be
relied on to type. Four integration tests (`critical-rules`, `presence`,
`provisioning`, `scan-correlation`) loaded only `.env.local` and therefore
created and deleted real rows in the live Veredillas database; the other seven
guarded with `if (process.env.TEST_DATABASE_URL)`, which fails **open** when the
gitignored `.env.test.local` is absent. `BETTER_AUTH_SECRET` was byte-identical
across dev, Docker and Vercel, so a session cookie minted locally was valid in
production, and the production Resend key sat in the dev file, letting a local
run send real mail to real members.

## Decision

Every target gets one env file, selected explicitly, with **local as the
implicit default and remote reachable only by naming it in the command**.
`.env` and `.env.development` are committed (non-secret, local stack);
`.env.local`, `.env.test.local`, `.env.docker`, `.env.prod` and
`.env.neon-branch` hold per-environment secrets and stay out of git. The rule is
enforced in code by `assertDatabaseTarget` (`src/lib/db/guard.ts`), which
refuses a `neon.tech` host from a non-production runtime unless `ALLOW_NEON_DB=1`
— a flag that exists in no env file and is injected only by the `:prod` and
`:branch` scripts in `package.json`.

## Consequences

- **Positive:** reaching production requires typing `:prod`, and the guard
  catches the cases where an env file is stale anyway. Integration tests fail
  closed on a missing, remote, or shared `TEST_DATABASE_URL`. A leaked
  non-production secret no longer opens production. A fresh clone runs against
  the local stack with no configuration, because `.env` is committed.
- **Negative / trade-offs:** more env files, not fewer, and a variable added to
  one environment must be added to the others by hand — `.env.example` carries a
  "defined in" column for exactly that reason. The committed `.env` relies on
  Vercel's real env vars taking precedence over `.env` files; that precedence is
  Next.js behaviour, not something this repo controls, which is why no
  `NEXT_PUBLIC_*` variable is allowed in it (those are inlined at build time and
  a wrong value would ship in the client bundle). `.env.development`, which Next
  loads only under `next dev`, holds those instead.
- **Follow-ups:** the naming `.env.prod` (not `.env.production.local`) is
  deliberate — the reserved name would be auto-loaded by `next build` and
  `next start`, reintroducing the exact accident this ADR removes. Any future
  remote target should follow the same pattern: unreserved filename, explicit
  script, `ALLOW_NEON_DB=1` injected by the script.

## Alternatives considered

- **`NODE_ENV`-driven files only** (`.env.development` / `.env.production`, the
  stock Next.js convention). Rejected: there are five targets and `NODE_ENV` has
  three values, and the two that matter most here — "local against production
  data" and "local against a Neon branch" — both run under
  `NODE_ENV=development`.
- **Keep `.env.local` pointing at production and rely on discipline.** Rejected:
  that was the status quo, and it had already put four destructive test files on
  the live database.
- **A single `.env` with a `TARGET` switch read at runtime.** Rejected: it puts
  production credentials in the same file as dev ones, so the blast radius of
  sharing or leaking that file is every environment at once.

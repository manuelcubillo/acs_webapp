# Project guide for Claude Code

This file is read at the start of every session. Keep it short; the real knowledge lives in `docs/context/`.

## How to work on this project

### At the start of every task

1. Read `docs/context/INDEX.md` — it maps task keywords to the modules you need to load.
2. Read `docs/context/foundation/` once per session (files 00 → 04). Skip if already loaded in this session.
3. Read only the modules from `docs/context/modules/` that the INDEX identified for this task.
4. Consult `docs/context/decisions/` only if a module's `Recent changes` section references an ADR relevant to the task.

If the task doesn't match any row in the INDEX routing table, ask before coding — don't guess.

### When I say "update context" (or equivalent)

Follow `docs/context/UPDATE-PROTOCOL.md` strictly. The protocol is deterministic — do not improvise structure, dates, or reporting format.

## Non-negotiable rules (full list in `docs/context/foundation/04-constraints.md`)

- **Node v20 only.** Node 22 is broken (icu4c ABI mismatch). Use `/opt/homebrew/opt/node@20/bin/node` or prefix with `PATH="/opt/homebrew/opt/node@20/bin:$PATH"`.
- `tenant_id` is always derived from the authenticated session via `getCurrentTenant()`. Never from client input, URL, or body — except the external API (`/api/cards/...`), which has a documented `TODO: API_AUTH`.
- Card UUIDs are never exposed to the client. The public Card identifier is `code`, unique per `(tenant_id, code)`.
- Soft delete everywhere. Never hard-delete `field_definitions`, `card_types`, `action_definitions`, `scan_validations`, or `cards`.
- `field_type` on a field with existing values cannot change. UI blocks; DAL refuses.
- Scan validations inform but never block actions.
- Auto-actions execute sequentially and stop on first failure. If tenant `allow_override_on_error = true`, the confirmation modal flow applies.
- All code comments and JSDoc in English.
- No middleware — `src/middleware.ts` does not exist. Auth is page-level via `requireOperator()` / `requireAdmin()` / `requireMaster()` guards.
- Operational scans and informational consultations are distinct entry paths. Never blur them. See `docs/context/decisions/2026-03-20-operational-vs-informational.md`.
- **All text displayed on pages must be in constants, not inline strings.** ❌ `<p>Delete account</p>` → ✅ `<p>{TEXT.DELETE_ACCOUNT}</p>`. This enables i18n and consistency.

## Code conventions (full list in `docs/context/foundation/02-conventions.md`)

- `@/` alias maps to `src/`.
- Server / client boundary: `page.tsx` (async server component, auth + data fetch) + `<Name>Client.tsx` (client component, UI state).
- All Server Actions wrapped by `actionHandler<T>` (`src/lib/api/response.ts`).
- DAL functions accept `tenantId` explicitly and throw typed errors from `src/lib/dal/errors.ts`.
- Field values use type-specific columns via `mapValueToColumn` / `extractValue` — never access typed columns directly.
- Shared components (used by 2+ domains) go in `src/components/shared/`.
- All dashboard pages: `export const dynamic = "force-dynamic"`.
- Zod validates at the Server Action boundary. Same validation engine runs on backend as source of truth.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 (custom, no shadcn) · Better Auth · Drizzle ORM · PostgreSQL on Neon (HTTP driver, no interactive transactions) · pnpm · Vercel · Vitest.

Full detail in `docs/context/foundation/00-overview.md`.

## Do not

- Skip reading the context docs "to save tokens". The modules are scoped precisely — typical overhead is ~2.5k tokens per task.
- Modify `docs/context/foundation/` unless a fundamental change occurred (constraint changed, new convention adopted, stack component replaced, new table added).
- Create a new module file in `docs/context/modules/` without asking first.
- Edit historical ADRs in `docs/context/decisions/`. Supersede them with a new dated ADR instead.
- Introduce `src/middleware.ts` or a new auth flow without a preceding ADR.
- Add shadcn/ui or another component library without a preceding ADR.

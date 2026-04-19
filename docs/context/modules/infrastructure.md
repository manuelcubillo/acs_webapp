# Module: infrastructure

**Last updated**: 2026-04-19 · **Last feature**: documentation sync against source code

## Responsibility

Everything that keeps the app running: database connection, migrations, env vars, build/dev scripts, deploy configuration, and low-level helpers not owned by any business domain.

## Key files

- `src/lib/db/index.ts` — Lazy DB Proxy: `drizzle(neon(DATABASE_URL))` initialized on first property access.
- `src/lib/db/schema/index.ts` — Barrel export.
- `src/lib/db/schema/auth.ts` — Better Auth tables.
- `src/lib/db/schema/access-control.ts` — All app tables + enums.
- `src/lib/db/schema/relations.ts` — Drizzle relations.
- `drizzle/` — Generated migrations.
- `drizzle.config.ts` — Drizzle Kit config (`schema: "./src/lib/db/schema/index.ts"`, `out: "./drizzle"`, `dialect: "postgresql"`).
- `next.config.ts` — `allowedDevOrigins: ["127.0.0.1", "192.168.1.140"]`.
- `src/lib/api/errors.ts` — `AppError`, `AuthenticationError`, `AuthorizationError`, `UnprocessableError`, `ActionResult<T>`.
- `src/lib/api/response.ts` — `actionHandler`, `routeHandler`, `apiSuccess`, `apiError`.
- `src/lib/api/index.ts` — Barrel export.
- `src/lib/dal/types.ts` — All Drizzle-derived types + input/output shapes.
- `src/lib/dal/errors.ts` — `DalError`, `NotFoundError`, `ValidationError`, `ForbiddenOperationError`, `DuplicateCodeError`.
- `src/lib/dal/index.ts` — Barrel export.
- Scripts in `package.json`: `pnpm dev | build | start | lint`, `pnpm db:generate | db:migrate | db:studio`, `pnpm db:seed`, `pnpm test | test:watch`.

## Environment variables

```
DATABASE_URL=postgresql://...          # Neon connection string
BETTER_AUTH_SECRET=...                 # openssl rand -hex 32
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000
```

## Runtime constraints

- **Node.js v20 only.** Node 22 (Homebrew default) is broken due to `icu4c` ABI mismatch (v74 ↔ v77). Use `/opt/homebrew/opt/node@20/bin/node` or `PATH="/opt/homebrew/opt/node@20/bin:$PATH" pnpm ...`.
- **Neon HTTP driver** — does not support interactive transactions. Any multi-step write that needs atomicity must document the limitation (see `modules/actions.md`).
- **No middleware** — `src/middleware.ts` does not exist. All auth is page-level via `requireX()` guards.

## Dependencies (key versions)

| Package                        | Version      | Purpose                                     |
| ------------------------------ | ------------ | ------------------------------------------- |
| next                           | 16.1.6       | Framework                                   |
| react / react-dom              | 19.2.3       | UI                                          |
| better-auth                    | 1.5.0        | Auth                                        |
| drizzle-orm                    | 0.45.1       | ORM                                         |
| @neondatabase/serverless       | 1.0.2        | Neon HTTP driver                            |
| zod                            | 4.3.6        | Server Action input validation              |
| html5-qrcode                   | 2.3.8        | Camera QR scanning                          |
| @dnd-kit/core + /sortable + /utilities | 6.3.1 / 10.0.0 / 3.2.2 | Field reordering                    |
| lucide-react                   | 0.577.0      | Icons                                       |
| date-fns                       | 4.1.0        | Date formatting                             |
| dotenv                         | 17.3.1       | Scripts                                     |
| drizzle-kit                    | 0.31.9       | Migrations                                  |
| vitest                         | 4.0.18       | Tests                                       |
| tsx                            | 4.21.0       | Scripts                                     |

## Main flows

### Adding a migration

1. Modify schema files in `src/lib/db/schema/`.
2. `pnpm db:generate` → writes SQL to `drizzle/`.
3. Review generated SQL.
4. `pnpm db:migrate` to apply against `DATABASE_URL`.
5. Commit schema + generated migration together.

### Adding a new DAL error

1. Define in `src/lib/dal/errors.ts`.
2. Map in `src/lib/api/response.ts` `actionHandler` error switch.
3. Update the error-mapping table in `foundation/02-conventions.md`.
4. Update the typed `ActionResult<T>` if the new error affects client shape.

## Extension points

- **New API Route for external devices** → `src/app/api/<route>/route.ts`. Use `routeHandler` wrapper. Currently relies on `x-tenant-id` header (`TODO: API_AUTH`) until API key system lands.
- **Swap DB driver** (e.g. for full transactions) → replaces `src/lib/db/index.ts` lazy proxy. Every multi-step write should be re-audited for true atomicity gains. Requires ADR.

## Module interactions

- Consumed by: every module.
- Dependencies on other modules: none (this is foundation).

## Open TODOs

- [ ] `TODO: API_AUTH` — external API authentication (`src/lib/api/auth.ts`).
- [ ] Atomicity for `executeAction` (documented in `modules/actions.md`).

## Future considerations

- Photo storage migration to S3/R2 (no code tag; tracked at project level).

## Recent changes

- 2026-04-19 — Initial extraction from technical handoff.
- 2026-04-19 — Synchronized documentation against source code: removed stale `TODO: API_KEYS` (no code tag found); moved `TODO: STORAGE` to Future considerations (no code tag).

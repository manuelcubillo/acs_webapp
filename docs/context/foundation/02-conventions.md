# 02 · Conventions

**Last updated**: 2026-04-19

## Code style

- All code comments and JSDoc in **English**.
- One component / one function per file when reasonable.
- `@/` alias maps to `src/`.
- Barrel exports in `src/lib/api/index.ts` and `src/lib/dal/index.ts`. New DAL / API helpers must be re-exported.
- Shared components (used by 2+ domains) go in `src/components/shared/`.

## Server / client boundary

Heavy pages use a two-file pattern:

- `page.tsx` — **server component**, `async`, does auth + data fetch. `export const dynamic = "force-dynamic"`.
- `<Name>Client.tsx` — **client component**, handles UI state and interactions.

This keeps auth checks and DB access off the client and keeps data-fetching co-located with the route.

## Server Actions

All frontend-facing mutations go through Server Actions wrapped by `actionHandler<T>`. Error mapping:

| Error                | Result shape                                                  |
| -------------------- | ------------------------------------------------------------- |
| `ZodError`           | `{ success: false, fieldErrors: Record<path, string[]> }`     |
| `NotFoundError`      | `{ error, code: "NOT_FOUND" }`                                |
| `DuplicateCodeError` | `{ error, code: "DUPLICATE_CODE" }`                           |
| `ValidationError`    | `{ error, code: "VALIDATION_ERROR" }`                         |
| `AuthenticationError`| `{ error, code: "UNAUTHENTICATED" }`                          |
| `AuthorizationError` | `{ error, code: "UNAUTHORIZED" }`                             |
| unknown              | `{ error: "An unexpected error occurred", code: "INTERNAL_ERROR" }` |

Zod validation happens at the Server Action boundary, before calling the DAL.

## DAL layer

- Every DAL function accepts `tenantId` explicitly as a parameter. Never reads it from a global.
- DAL functions throw typed errors (`NotFoundError`, `DuplicateCodeError`, `ValidationError`, `ForbiddenOperationError`). Never return null for an error condition.
- Soft-delete filters (`isActive = true`) are applied by default. Include-inactive variants are opt-in.

## Auth invariants

- `tenant_id` is **always** extracted from the Better Auth session via `getCurrentTenant()`. Never from client input, URL, or headers (except for the external API — see `TODO: API_AUTH`).
- Role guards (`requireOperator`, `requireAdmin`, `requireMaster`) throw on failure; call sites do not check the return value.
- UUIDs are never exposed to the client as identifiers for cards. The public identifier is `code`, unique per `(tenant_id, code)`.

## Field value storage

Field values are stored in type-specific columns:

| Field type | Column          |
| ---------- | --------------- |
| `text`     | `value_text`    |
| `number`   | `value_number`  |
| `boolean`  | `value_boolean` |
| `date`     | `value_date`    |
| `photo`    | `value_text` (URL)  |
| `select`   | `value_json` (array for multi, string for single) |

Use `mapValueToColumn(fieldType, value)` when writing and `extractValue(fieldType, row)` when reading. Do not access the typed columns directly.

## Form validation timing

`useCardForm.validate()` runs **on submit only**. Per-field errors clear on `setValue`. Do not validate on blur — it creates noisy UX in this domain.

## Edit mode tempId convention (CardType wizard)

When loading a CardType into edit mode, the wizard maps DB UUIDs to `tempId` fields so the diffing logic treats them as "existing":

```ts
// Fields
fieldDrafts[i].tempId = field.id;
fieldDrafts[i].id     = field.id;

// Actions
actionDrafts[i].targetFieldTempId = action.targetFieldDefinitionId;

// Scan validations
scanValidationDrafts[i].fieldTempId = sv.fieldDefinitionId;
```

New items created in the wizard get a generated `tempId` without a DB `id`.

## Texts and i18n readiness

All user-facing strings are declared in constants or message objects, prepared for i18n. i18n itself is not implemented — but never inline strings in JSX where a key in a constant would do.

## Comments on non-obvious logic

When a function has non-obvious reasoning (tempId mapping, auto-action sequencing, scan-validation re-evaluation), add a short JSDoc block explaining **why**, not just **what**. The code tells the what.

## Forbidden patterns

- Hard-deleting `field_definitions` (never — only soft delete).
- Changing `field_type` on a field with existing values (UI blocks this; DAL must also refuse).
- Reading `tenantId` from headers or request body outside the external API route.
- Inventing a new auth flow that bypasses the Better Auth session.
- Adding middleware (`src/middleware.ts`) without coordinating a broader auth-architecture change.

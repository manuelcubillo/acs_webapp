# Module: validations

**Last updated**: 2026-04-19 · **Last feature**: documentation sync against source code

## Responsibility

Two independent validation engines, both pure TypeScript and framework-agnostic:

1. **Form validation** — used when creating / editing a Card. Evaluates user input against the `validation_rules` of each field.
2. **Scan validation** — used at scan time and re-evaluated after each action. Evaluates the current Card state against rules attached to the CardType.

Critical invariant: scan validations **inform**, never **block** actions.

## Key files

- `src/lib/validation/types.ts` — Rule definitions, result types, `ScanValidationResult`.
- `src/lib/validation/rules.ts` — Enum + metadata for all supported rules.
- `src/lib/validation/validators.ts` — Per-field-type validator functions.
- `src/lib/validation/engine.ts` — Form validation orchestration.
- `src/lib/validation/scan-validator.ts` — Scan-time evaluation.
- `src/lib/validation/messages.ts` — Message templates (i18n-ready).
- `src/lib/validation/index.ts` — Barrel export.
- `src/lib/dal/scan-validations.ts` — `getScanValidationsByCardType`, `validateScan`.
- `src/components/card-types/steps/ScanValidationsStep.tsx` — Wizard step for scan validation rules.
- `src/components/cards/ScanAlerts.tsx` — Renders `ScanValidationResult`.

## Data model (relevant subset)

- `scan_validations(id, card_type_id, field_definition_id, rule, value jsonb, error_message, severity, position, is_active, ...)`
- `field_definitions.validation_rules` (jsonb) — source for form validation.

## Supported rules

### Form validation (per field type)

| Field type | Rules                                                                 |
| ---------- | --------------------------------------------------------------------- |
| `text`     | `minLength`, `maxLength`, `pattern` / presets                         |
| `number`   | `min`, `max`, `integer`                                               |
| `boolean`  | `mustBeTrue`                                                          |
| `date`     | `minDate`, `maxDate`, `pastOnly`, `futureOnly`                        |
| `photo`    | `maxSizeKb`, `allowedFormats`                                         |
| `select`   | `options`, `allowMultiple`                                            |

### Scan validation (per field type)

| Field type | Rules                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------- |
| `boolean`  | `boolean_is_true`, `boolean_is_false`                                                           |
| `number`   | `number_eq`, `number_gt`, `number_lt`, `number_gte`, `number_lte`, `number_between`             |
| `date`     | `date_before`, `date_after`, `date_equals` — support `{ relative: "today" }` for dynamic dates  |

Severity: `error` (red) or `warning` (yellow).

## Main flows

### Form validation

1. `useCardForm.validate()` runs on submit only.
2. Engine walks each field → its validators → first failure per field becomes the error message.
3. Per-field errors clear on `setValue`.
4. Backend (`Server Action`) runs the same engine against the same input. Backend is the source of truth.

### Scan validation

1. Card detail page calls `validateScan(card, scanValidations)`.
2. Returns `ScanValidationResult { passed, results[] }` with per-rule `passed`, `severity`, `message`.
3. `ScanAlerts` renders the failing rules (errors first, then warnings).
4. After a successful action, client re-evaluates because values may have changed — handled in `CardActions` / `ActiveCardZone` callbacks.

## Extension points

- **New form validation rule** → add to `rules.ts` enum, implement in `validators.ts`, expose in `ValidationRulesEditor` UI.
- **New scan validation rule** → add to `rules.ts`, implement in `scan-validator.ts`, add to `ScanValidationsStep` UI, provide `messages.ts` entry.
- **New severity level** → extend the `severity` enum + `ScanAlerts` styling; reconsider whether the invariant "never block" still holds.

## Module interactions

- Consumed by: `cards` (via `useCardForm` and `ScanAlerts`), `card-types` (wizard UIs for both engines), `scanning` (triggers scan validation re-eval after actions).
- Reads: `field_definitions.validation_rules`, `scan_validations`.

## Open TODOs

- [ ] None specific as of last extraction.

## Recent changes

- 2026-04-19 — Initial extraction from architecture document.
- 2026-04-19 — Synchronized documentation against source code: no drift found; metadata updated.

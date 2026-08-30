# Module: validations

**Last updated**: 2026-08-29 · **Last feature**: date scan validations include the reference day

## Responsibility

Two independent validation engines, both pure TypeScript and framework-agnostic:

1. **Form validation** — used when creating / editing a Card. Evaluates user input against the `validation_rules` of each field.
2. **Scan validation** — used at scan time and re-evaluated after each action. Evaluates the current Card state against rules attached to the CardType.

Critical invariant: scan validations **inform**, never **block** actions.

⚠️ Phase 2 reuses the scan-validation *channel* for lifecycle, but the lifecycle gate itself DOES block (it is not a scan validation). `buildLifecycleScanCheck` (`src/lib/server/lifecycle/scan-gate.ts`) emits a synthetic error-level `ScanValidationCheck` (`rule: "lifecycle_status"`, no `fieldDefinitionId`) that is prepended to `validateScan`'s results for an inactive/expired card, so the existing pause/block/override machinery drives it. The scan validator and its rules are untouched; only the result stream carries an extra, synthetic check. The message templates live in `messages.ts` (`LIFECYCLE_SCAN_MESSAGES`).

## Key files

- `src/lib/validation/types.ts` — Rule definitions, result types, `ScanValidationResult`.
- `src/lib/validation/scan-rules.ts` — Catalogue of the SCAN validation rules: identifier → label, field type, `value` shape. Single source for the wizard step, the read-only summaries and the DAL guard.
- `src/lib/validation/rules.ts` — Enum + metadata for all supported FORM validation rules. Also owns `SELECT_OPTIONS_RULE` + `getSelectOptions(validationRules)` — the single source of truth for a select field's configured options.
- `src/lib/validation/validators.ts` — Per-field-type validator functions.
- `src/lib/validation/engine.ts` — Form validation orchestration.
- `src/lib/validation/scan-validator.ts` — Scan-time evaluation.
- `src/lib/validation/messages.ts` — Message templates (i18n-ready).
- `src/lib/validation/index.ts` — Barrel export.
- `src/lib/validation/__tests__/scan-validator.test.ts` — Pins the empty-value contract (skip on optional, fail on required, `false`/`0` still evaluated) and the inclusive date boundaries.
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
| `date`     | `date_before` (≤), `date_after` (≥), `date_equals` — support `{ relative: "today" }` for dynamic dates |

Severity: `error` (red) or `warning` (yellow).

**Inclusive dates.** `date_before` and `date_after` include the reference day
(`<=` / `>=`) despite reading as strict. The identifiers were kept because an
unknown one fails closed and would break card-type saves; the labels («es
anterior o igual a», «es posterior o igual a») carry the meaning. ADR
`2026-08-29-inclusive-date-scan-validations.md`.

**Empty values.** A rule whose target field is **optional** and holds no value is skipped — reported as `passed: true` plus `skipped: true`, never as a failure. On a **required** field an empty value still fails. Empty means `undefined` / `null` / `""`; `false` and `0` are real values and are still evaluated. The mandatory flag reaches the engine through `ScanValidationWithField.fieldIsRequired` (joined in `getScanValidationsByCardType`), **not** through `EnrichedFieldValue.isRequired` — a field left blank on card creation has no `field_values` row at all, so it is absent from the card's enriched values entirely. ADR `2026-08-15-scan-validation-empty-optional-fields.md`.

## Main flows

### Form validation

1. `useCardForm.validate()` runs on submit only.
2. Engine walks each field → its validators → first failure per field becomes the error message.
3. Per-field errors clear on `setValue`.
4. Backend (`Server Action`) runs the same engine against the same input. Backend is the source of truth.

### Scan validation

1. Card detail page calls `validateScan(card, scanValidations)`.
2. Per rule: if the field is optional and its value is empty the rule is skipped (`passed: true`, `skipped: true`); otherwise the evaluator runs.
3. Returns `ScanValidationResult { passed, results[] }` with per-rule `passed`, `severity`, `message`.
4. `ScanAlerts` renders the failing rules (errors first, then warnings). Every UI surface filters on `!passed`, so a skipped check renders nothing.
5. After a successful action, client re-evaluates because values may have changed — handled in `CardActions` / `ActiveCardZone` callbacks.

## Extension points

- **New form validation rule** → add to `rules.ts` enum, implement in `validators.ts`, expose in `ValidationRulesEditor` UI.
- **Reading a rule's configured value from a UI layer** → never re-derive the rule name inline. Rule names that more than one layer reads are exported as constants from `rules.ts` with an accessor beside them (`SELECT_OPTIONS_RULE` / `getSelectOptions`); accessors take `unknown` because the payload arrives typed from the form layer and as raw JSONB from the DAL.
- **New scan validation rule** → add to `scan-rules.ts` (identifier, label, field type, value shape) and implement the evaluator in `scan-validator.ts`. The wizard step, the review/detail summaries and the DAL's `RULE_FIELD_TYPE_MAP` all derive from the catalogue, so nothing else needs touching; a test pins the catalogue against `SCAN_RULE_EVALUATORS`. Scan rules are NOT in `rules.ts` — that file owns form validation only. No `messages.ts` entry: the alert text is authored per rule in `scan_validations.error_message`.
- **New severity level** → extend the `severity` enum + `ScanAlerts` styling; reconsider whether the invariant "never block" still holds.

## Module interactions

- Consumed by: `cards` (via `useCardForm` and `ScanAlerts`), `card-types` (wizard UIs for both engines), `scanning` (triggers scan validation re-eval after actions).
- Reads: `field_definitions.validation_rules`, `scan_validations`.

## Open TODOs

- [ ] None specific as of last extraction.

## Recent changes

- 2026-08-29 — The two date comparisons in scan validations now include the reference day: `date_before` evaluates `<=` and `date_after` `>=`, and their labels became «es anterior o igual a» / «es posterior o igual a». The identifiers are deliberately unchanged — the column is free `text`, but an unrecognised identifier fails closed (`passed: false`, `error`) and `assertRuleCompatible` would reject it on the next card-type save, which the wizard triggers for every existing rule. So already-configured rules turn inclusive with no migration, and they alert *less* than before (a card whose date equals the reference day no longer raises an alert) — the intended effect. New `scan-rules.ts` holds the rule catalogue that `ScanValidationsStep`, `ReviewStep`, the card-type detail page and the DAL's `RULE_FIELD_TYPE_MAP` now all derive from; the last two used to print the raw identifier («Campo · date_before»). New boundary tests in `__tests__/scan-validator.test.ts` — the comparison semantics had no assertions at all — mutation-verified against `<` / `>`. ADR `2026-08-29-inclusive-date-scan-validations.md`.
- 2026-08-15 — Scan validations no longer fail on an empty value when the target field is not mandatory: `validateScan` skips the rule (`passed: true`, new `skipped` marker) before reaching the evaluator. Every evaluator is a positive type guard, so the absence of a value used to surface as an error-level failure and deny the scan. The mandatory flag now travels with the rule (`ScanValidationWithField.fieldIsRequired`, joined in `getScanValidationsByCardType` — no extra query) because a field blank since creation has no `field_values` row and is missing from `EnrichedFieldValue[]`. Required fields still fail; `false` and `0` are still evaluated. New `__tests__/scan-validator.test.ts` (the engine had no direct coverage). ADR `2026-08-15-scan-validation-empty-optional-fields.md`.
- 2026-08-02 — `rules.ts` gained `SELECT_OPTIONS_RULE` + `getSelectOptions(validationRules)`, now the only way to read a select field's options. Three layers previously hard-coded their own access pattern and two were wrong (`SelectInput` looked up a rule named `allowedValues`; `FieldFilterBuilder` read `validationRules.options` instead of walking `rules[]`), each returning `[]` rather than throwing — so select fields silently rendered empty dropdowns and could be neither assigned on card creation nor filtered. `RULES_BY_FIELD_TYPE.select` and the `VALIDATOR_REGISTRY` key now derive from the same constant, so writer and readers cannot desync. New `__tests__/select-options.test.ts` pins the contract (mutation-verified against both original bugs). No ADR — bug fix + refactor.
- 2026-07-17 — Phase-2 lifecycle reuses the scan-validation channel: a synthetic `lifecycle_status` check (`buildLifecycleScanCheck`) surfaces an inactive/expired card as an error-level failure so the override flow handles it. `messages.ts` gained `LIFECYCLE_SCAN_MESSAGES` + `LIFECYCLE_SCAN_FIELD_LABEL`. The engines themselves are unchanged. ADR `2026-07-17-card-lifecycle-scan-behaviour.md`.
- 2026-04-19 — Initial extraction from architecture document.

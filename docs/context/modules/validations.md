# Module: validations

**Last updated**: 2026-09-08 · **Last feature**: multi-select implemented; the configurator trimmed and translated

## Responsibility

Two independent validation engines, both pure TypeScript and framework-agnostic:

1. **Form validation** — used when creating / editing a Card. Evaluates user input against the `validation_rules` of each field.
2. **Scan validation** — used at scan time and re-evaluated after each action. Evaluates the current Card state against rules attached to the CardType.

Critical invariant: scan validations **inform**, never **block** actions.

⚠️ Phase 2 reuses the scan-validation *channel* for lifecycle, but the lifecycle gate itself DOES block (it is not a scan validation). `buildLifecycleScanCheck` (`src/lib/server/lifecycle/scan-gate.ts`) emits a synthetic error-level `ScanValidationCheck` (`rule: "lifecycle_status"`, no `fieldDefinitionId`) that is prepended to `validateScan`'s results for an inactive/expired card, so the existing pause/block/override machinery drives it. The scan validator and its rules are untouched; only the result stream carries an extra, synthetic check. The message templates live in `messages.ts` (`LIFECYCLE_SCAN_MESSAGES`).

## Key files

- `src/lib/validation/types.ts` — Rule definitions, result types, `ScanValidationResult`.
- `src/lib/validation/scan-rules.ts` — Catalogue of the SCAN validation rules: identifier → label, field type, `value` shape. Single source for the wizard step, the read-only summaries and the DAL guard.
- `src/lib/validation/rules.ts` — Enum + metadata for all supported FORM validation rules. Also owns the select accessors (`SELECT_OPTIONS_RULE` / `getSelectOptions`, `ALLOW_MULTIPLE_RULE` / `getAllowMultiple`), the configuration/validation split (`FIELD_CONFIGURATION_RULES`, `getValidationRulesForFieldType`, `countValidationRules`) and the pure rule-array helpers the configurator UIs share (`upsertRule` / `removeRule`).
- `src/lib/validation/validators.ts` — Per-field-type validator functions.
- `src/lib/validation/engine.ts` — Form validation orchestration.
- `src/lib/validation/scan-validator.ts` — Scan-time evaluation.
- `src/lib/validation/messages.ts` — Message templates (i18n-ready).
- `src/lib/validation/index.ts` — Barrel export.
- `src/lib/validation/__tests__/multi-select.test.ts` — The whole multi-select path: storage shape, arity, snapshot freezing + diff. Nothing there is covered by a type, and every original failure mode was silent.
- `src/lib/validation/__tests__/field-configuration-rules.test.ts` — Pins both halves of the configuration/validation split: every configuration rule stays declared in `RULES_BY_FIELD_TYPE` and registered in `VALIDATOR_REGISTRY` (so it is still enforced), and none of them ever reaches the configurator.
- `src/lib/validation/__tests__/scan-validator.test.ts` — Pins the empty-value contract (skip on optional, fail on required, `false`/`0` still evaluated) and the inclusive date boundaries.
- `src/lib/dal/scan-validations.ts` — `getScanValidationsByCardType`, `validateScan`.
- `src/components/card-types/steps/ScanValidationsStep.tsx` — Wizard step for scan validation rules.
- `src/components/cards/ScanAlerts.tsx` — Renders `ScanValidationResult`.

## Data model (relevant subset)

- `scan_validations(id, card_type_id, field_definition_id, rule, value jsonb, error_message, severity, position, is_active, ...)`
- `field_definitions.validation_rules` (jsonb) — source for form validation.

## Supported rules

### Form validation (per field type)

| Field type | Offered in the wizard                        | Enforced but hidden               |
| ---------- | -------------------------------------------- | --------------------------------- |
| `text`     | `minLength`, `maxLength`, `pattern` / presets | —                                 |
| `number`   | `min`, `max`, `integer`                       | —                                 |
| `boolean`  | *(none)*                                      | `mustBeTrue`                      |
| `date`     | `minDate`, `maxDate`                          | `pastOnly`, `futureOnly`          |
| `photo`    | *(none)*                                      | `maxSizeKb`, `allowedFormats`     |
| `select`   | *(none — see configuration below)*            | `options`, `allowMultiple`        |

⚠️ **Hidden ≠ deleted.** The right-hand column lists rules removed from
`RULES_BY_FIELD_TYPE` (what the configurator offers) but still present in
`VALIDATOR_REGISTRY` and `DEFAULT_MESSAGES` (what the engine enforces). The
catalogue entries survive commented out under a `⚠️ HIDDEN ON PURPOSE` block.
The reason is that `field_definitions.validation_rules` is production jsonb and
an identifier the engine does not know is **skipped silently** — deleting a
validator converts an enforced constraint into an unreported no-op. ADR
`2026-09-08-validation-rules-configurator-surface.md`.

`boolean`, `photo` and `select` therefore have an EMPTY configurator catalogue,
which is what makes the «Reglas de validación» heading disappear for them.

**All rule text is Spanish, by variable.** `RuleDefinition` carries a `label`
and a `description`; `ValidationRulesEditor` renders `def.label`, never
`def.rule`. `DEFAULT_MESSAGES` is Spanish too, and deliberately keeps entries
for the hidden rules — a pruned map would leave a stored rule failing with the
generic fallback string.

⚠️ **Configuration rules.** `options` and `allowMultiple` describe what a select
field IS; they live in `validation_rules` only because that jsonb column
existed. `FIELD_CONFIGURATION_RULES` names them, `getValidationRulesForFieldType`
filters them out of the rules configurator, and the wizard edits them in
`SelectOptionsEditor` instead. The split is a UI reading convention, not a
schema or engine change. ADR `2026-09-08-select-options-are-configuration.md`.

**Multi-select arity.** A single-select field must not receive several values,
and that check lives in `validateOptions` — NOT in `validateAllowMultiple`.
A disabled rule is absent from `rules[]`, so its own validator never runs;
putting the check there would leave nothing to reject an array. Conversely
`validateAllowMultiple` accepts a lone string, so switching a populated field to
multiple does not invalidate every existing card. ADR
`2026-09-08-multi-select-storage.md`.

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
- **New field-CONFIGURATION rule** (something that describes the field rather than constraining its value) → register it in `RULES_BY_FIELD_TYPE` and `VALIDATOR_REGISTRY` as usual, then add its name to `FIELD_CONFIGURATION_RULES` and give it a dedicated editor beside `SelectOptionsEditor`. Forgetting the second step surfaces it as a toggle under «Reglas de validación», which is the exact category error the split exists to prevent.
- **Reading a rule's configured value from a UI layer** → never re-derive the rule name inline. Rule names that more than one layer reads are exported as constants from `rules.ts` with an accessor beside them (`SELECT_OPTIONS_RULE` / `getSelectOptions`); accessors take `unknown` because the payload arrives typed from the form layer and as raw JSONB from the DAL.
- **New scan validation rule** → add to `scan-rules.ts` (identifier, label, field type, value shape) and implement the evaluator in `scan-validator.ts`. The wizard step, the review/detail summaries and the DAL's `RULE_FIELD_TYPE_MAP` all derive from the catalogue, so nothing else needs touching; a test pins the catalogue against `SCAN_RULE_EVALUATORS`. Scan rules are NOT in `rules.ts` — that file owns form validation only. No `messages.ts` entry: the alert text is authored per rule in `scan_validations.error_message`.
- **New severity level** → extend the `severity` enum + `ScanAlerts` styling; reconsider whether the invariant "never block" still holds.

## Module interactions

- Consumed by: `cards` (via `useCardForm` and `ScanAlerts`), `card-types` (wizard UIs for both engines), `scanning` (triggers scan validation re-eval after actions).
- Reads: `field_definitions.validation_rules`, `scan_validations`.

## Open TODOs

- [ ] None specific as of last extraction.

## Recent changes

- 2026-09-08 — Multi-select works. `validateAllowMultiple` demanded an array while `mapValueToColumn` threw on one, so enabling the rule made the field unsubmittable; both halves are fixed and the storage decision (shape-dispatched `value_text` / `value_json`) is ADR `2026-09-08-multi-select-storage.md`. `validateOptions` gained the arity check and both select validators now accept either shape. New `__tests__/multi-select.test.ts`.
- 2026-09-08 — The configurator was trimmed and translated. `mustBeTrue`, `pastOnly`/`futureOnly` and `maxSizeKb`/`allowedFormats` left `RULES_BY_FIELD_TYPE` (commented out in place) while keeping their validators registered, so a stored rule stays enforced instead of silently becoming a no-op; `boolean` and `photo` now render no rules section at all. `RuleDefinition` gained `label`, every label and description is Spanish, and `DEFAULT_MESSAGES` was translated — the three engine tests that asserted English text were updated, as was one integration assertion (`/is required/` → `/es obligatorio/`). ADR `2026-09-08-validation-rules-configurator-surface.md`.
- 2026-09-08 — `rules.ts` gained `FIELD_CONFIGURATION_RULES` + `getValidationRulesForFieldType`, splitting rules that CONFIGURE a field from rules that VALIDATE its value. Only `select` has configuration rules today (`options`, `allowMultiple`), so it is the one type whose configurator catalogue is empty and whose «Reglas de validación» heading disappears. Also added: `ALLOW_MULTIPLE_RULE` + `getAllowMultiple` (the accessor pattern the module already required for `options`), `countValidationRules` for the summary badges, and `upsertRule` / `removeRule` — pure array helpers lifted out of `ValidationRulesEditor` so the new `SelectOptionsEditor` writes the same jsonb shape rather than re-deriving it. The engine is untouched: both configuration rules stay in `RULES_BY_FIELD_TYPE` and `VALIDATOR_REGISTRY`, pinned by `__tests__/field-configuration-rules.test.ts`. ADR `2026-09-08-select-options-are-configuration.md`.
- 2026-08-29 — The two date comparisons in scan validations now include the reference day: `date_before` evaluates `<=` and `date_after` `>=`, and their labels became «es anterior o igual a» / «es posterior o igual a». The identifiers are deliberately unchanged — the column is free `text`, but an unrecognised identifier fails closed (`passed: false`, `error`) and `assertRuleCompatible` would reject it on the next card-type save, which the wizard triggers for every existing rule. So already-configured rules turn inclusive with no migration, and they alert *less* than before (a card whose date equals the reference day no longer raises an alert) — the intended effect. New `scan-rules.ts` holds the rule catalogue that `ScanValidationsStep`, `ReviewStep`, the card-type detail page and the DAL's `RULE_FIELD_TYPE_MAP` now all derive from; the last two used to print the raw identifier («Campo · date_before»). New boundary tests in `__tests__/scan-validator.test.ts` — the comparison semantics had no assertions at all — mutation-verified against `<` / `>`. ADR `2026-08-29-inclusive-date-scan-validations.md`.
- 2026-08-15 — Scan validations no longer fail on an empty value when the target field is not mandatory: `validateScan` skips the rule (`passed: true`, new `skipped` marker) before reaching the evaluator. Every evaluator is a positive type guard, so the absence of a value used to surface as an error-level failure and deny the scan. The mandatory flag now travels with the rule (`ScanValidationWithField.fieldIsRequired`, joined in `getScanValidationsByCardType` — no extra query) because a field blank since creation has no `field_values` row and is missing from `EnrichedFieldValue[]`. Required fields still fail; `false` and `0` are still evaluated. New `__tests__/scan-validator.test.ts` (the engine had no direct coverage). ADR `2026-08-15-scan-validation-empty-optional-fields.md`.
_Pruned to the 5-entry cap: the shared `getSelectOptions` accessor (2026-08-02)
is described above under "Key files", and the phase-2 lifecycle scan channel
(2026-07-17) in the Responsibility section._

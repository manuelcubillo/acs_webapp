# ADR: A select's options are field configuration, not a validation rule

**Date**: 2026-09-08
**Status**: accepted
**Modules affected**: fields, validations, card-types

## Context

A `select` field's option list and its `allowMultiple` flag are stored inside
`field_definitions.validation_rules` — a storage decision taken because that
jsonb column already existed (see `modules/fields.md` → Future considerations).
The card-type wizard then inherited that shape as its information architecture:
`RULES_BY_FIELD_TYPE.select` fed `ValidationRulesEditor`, so the only way to
declare what a select offers was to switch on a toggle labelled «options»
inside a section headed **Reglas de validación**. Storage layout had become the
user's mental model, and the wrong one: the options are what the field *is*,
not a constraint on what someone typed into it.

The generic `string[]` editor behind that toggle was a single comma-separated
text input. It split on every keystroke and re-joined with `", "`, so a comma
could never appear inside an option value (`"Portal 1, bajo A"` became two
options) and the caret jumped while typing. Three more surfaces repeated the
category error in summary badges, counting a select's option list as «1 regla».

## Decision

Configuration rules are named as such —
`FIELD_CONFIGURATION_RULES = [SELECT_OPTIONS_RULE, ALLOW_MULTIPLE_RULE]` in
`src/lib/validation/rules.ts` — and `getValidationRulesForFieldType` filters
them out of the rules configurator. They keep their entries in
`RULES_BY_FIELD_TYPE` and `VALIDATOR_REGISTRY`, so the engine contract is
untouched and both are still enforced on submit; only the UI splits.

A select is therefore edited in a dedicated `SelectOptionsEditor` panel — one
option at a time, add / rename / delete / drag-reorder — and the whole «Reglas
de validación» block is hidden for it, because after the split it has none.

## Consequences

- **Positive:** an option may contain any character, commas included, and the
  input is never rewritten under the caret.
- **Positive:** the split is declared in one place. A future field type with
  configuration of its own registers the rule name and gets the same treatment
  in the wizard, the configurator and the badges for free.
- **Positive:** `countValidationRules` makes the summary badges honest —
  `FieldList`, `ReviewStep`, `FieldDefinitionsStep` and the card-type detail
  page now show «N opciones» and «N reglas» separately.
- **Negative / trade-offs:** the storage layout still disagrees with the
  concept — options live in a column named `validation_rules`. The split is a
  reading convention, not a schema change, so a layer that walks the jsonb
  inline still sees the options among the rules. The accessors
  (`getSelectOptions`, `getAllowMultiple`, `countValidationRules`) remain the
  only supported way in, exactly as after the 2026-08-02 fix.
- **Follow-ups:** the dedicated `options` jsonb column proposed in
  `modules/fields.md` would now be a mechanical migration — the readers are
  already funnelled through three accessors.

## Alternatives considered

- **Remove `options` / `allowMultiple` from `RULES_BY_FIELD_TYPE` entirely.**
  Rejected: that table is also the enforcement catalogue, and dropping them
  would silently stop validating a select's submitted value while the
  `VALIDATOR_REGISTRY` entries sat unreachable.
- **Add a real `options` column to `field_definitions` now.** Rejected as
  out of proportion to a UI fix: it needs a migration, a backfill of every
  existing select field, and a change to the snapshot payload contract. The
  accessor indirection makes it a later, cheaper decision.
- **Keep the comma-separated input and just escape commas.** Rejected — it
  keeps a list-editing UI that cannot express reordering or renaming, and any
  escaping scheme leaks into the stored values.
- **Implement multi-select while here.** Rejected: `mapValueToColumn` throws on
  a non-string for `select`, so it needs `value_json` storage, `extractValue`,
  a multi `SelectInput`, filter SQL and snapshot changes. The toggle is
  surfaced in the new panel with an inline warning that enabling it makes the
  field unsubmittable — the pre-existing trap, now visible instead of silent.

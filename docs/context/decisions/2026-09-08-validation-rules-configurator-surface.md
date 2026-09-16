# ADR: Hiding a validation rule is not deleting it

**Date**: 2026-09-08
**Status**: accepted
**Modules affected**: fields, validations, card-types

## Context

The field editor's «Reglas de validación» section offered every rule the engine
could enforce, each shown by its raw identifier (`minLength`, `pastOnly`) above
an English description written for a developer. A master configuring a card
type read a list of keys in a language the rest of the product does not use,
and several of the entries were rules this deployment has no use for:

- `mustBeTrue` on a Sí/No field — a terms-acceptance checkbox.
- `pastOnly` / `futureOnly` on a date — they restate «Fecha mínima» / «Fecha
  máxima» against a reference that moves every midnight, so a card that saved
  cleanly yesterday can stop validating overnight.
- `maxSizeKb` / `allowedFormats` on a photo — both are already guaranteed by the
  upload pipeline (`optimizeImage` re-encodes every capture to WebP under the
  profile's ceiling; `confirmPhotoUploadAction` re-checks size and content-type
  server-side), so configuring them by hand could only contradict it.

Deleting them outright is the obvious move and the wrong one. The rule name is
free text in a jsonb column that exists in production. An identifier the engine
no longer knows is skipped silently — `validateField` logs a dev warning and
moves on — so removing a validator turns an enforced constraint into a no-op
that nothing reports.

## Decision

Rules are removed from **`RULES_BY_FIELD_TYPE`** (what the configurator offers)
and kept in **`VALIDATOR_REGISTRY`** and `DEFAULT_MESSAGES` (what the engine
enforces). The catalogue entries stay in the file, commented out, under a
`⚠️ HIDDEN ON PURPOSE — do not delete` block saying why and how to restore them.

`RuleDefinition` gained a `label`, and every label and description is Spanish.
The configurator renders `def.label`, never `def.rule`.

## Consequences

- **Positive:** a field definition that already stores one of these rules keeps
  being validated exactly as before. The change is to what can be newly
  configured, not to what is enforced.
- **Positive:** `boolean` and `photo` now have an empty catalogue, so the whole
  «Reglas de validación» heading disappears for them — the gate added for
  `select` in `2026-09-08-select-options-are-configuration.md` already handled
  it, with no new branch.
- **Negative / trade-offs:** a stored hidden rule is now invisible AND
  unremovable through the UI. Editing it means uncommenting the catalogue entry
  or a manual jsonb update. Accepted because no such row exists in the local
  database and the alternative is silent non-enforcement.
- **Negative / trade-offs:** commented-out code is dead weight the linter cannot
  check. The tests compensate: `field-configuration-rules.test.ts` asserts the
  hidden names are absent from the catalogue AND present in the registry, so
  deleting a validator "to tidy up" fails.
- **Follow-ups:** `DEFAULT_MESSAGES` deliberately keeps entries for the hidden
  rules. A message map pruned to match the catalogue would leave a stored rule
  failing with the generic fallback text.

## Alternatives considered

- **Delete the rules, validators and messages.** Rejected: a rule the engine
  does not recognise is skipped, not rejected, so any production field storing
  `pastOnly` would silently stop being validated with nothing to notice it.
- **Keep them in the configurator but disable the toggle.** Rejected — it
  leaves the operator reading options they cannot use, which is the problem.
- **Move the catalogue entries to a separate `HIDDEN_RULES` export.** Rejected
  as more structure than the situation earns: two constants to keep in sync
  where a commented block plus a test does the same job, and the comment is
  where someone looking for the rule will actually land.
- **Translate the identifiers themselves.** Rejected for the same reason the
  scan rules kept theirs (ADR `2026-08-29-inclusive-date-scan-validations.md`):
  the identifier is stored data, the label carries the meaning.

# ADR: Date scan validations include the reference day

**Date**: 2026-08-29
**Status**: accepted
**Modules affected**: validations, card-types

## Context

A scan validation on a `date` field offered three conditions: «es anterior a»
(`date_before`, `<`), «es posterior a» (`date_after`, `>`) and «es igual a»
(`date_equals`). Both comparisons were strict, so the reference day itself fell
outside the condition — and because an alert fires when the rule does **not**
pass, a rule like «caducidad es posterior a hoy» raised an error the same day a
carnet expired. The requirement was to cover that day: keep three conditions,
but make the two comparisons inclusive.

`scan_validations.rule` is a free `text` column (no PG enum, and the Server
Action schema is `z.string()`), so the identifiers are not schema. They are,
however, already stored in every environment, and an identifier the engine does
not recognise fails closed: `validateScan` reports `passed: false` at `error`
severity, and `assertRuleCompatible` rejects it on the next card-type save —
which the wizard triggers for every existing rule on any edit.

## Decision

The comparators changed in place — `date_before` evaluates `<=` and `date_after`
evaluates `>=` — while the rule identifiers stay as they are. Already-configured
rules become inclusive automatically, with no data migration. The user-facing
labels («es anterior o igual a», «es posterior o igual a») now carry the meaning
that the identifiers no longer do.

## Consequences

- **Positive:** one-line semantic change, no migration to carry to `acs_test`,
  the Neon branch and production — which matters while 0022 is still unapplied
  there and production's journal is empty. Every existing rule picks up the new
  behaviour without anyone reconfiguring it.
- **Negative / trade-offs:** the identifiers `date_before` / `date_after` now
  read as strict while behaving inclusively. Anyone reading the DB or the
  evaluator map can be misled, so the mismatch is flagged in `scan-rules.ts`,
  `scan-validator.ts` and the Drizzle table docblock.
- **Behaviour change:** rules already in production alert *less* than before — a
  carnet whose date equals the reference day stops raising an alert. That is the
  intended effect, not a regression.
- **Follow-ups:** the rule catalogue now lives in one place
  (`src/lib/validation/scan-rules.ts`), consumed by the wizard step, the two
  read-only summaries and the DAL's field-type guard. If the identifiers are
  ever renamed, it is now a single edit plus a data backfill.

## Alternatives considered

- **Rename to `date_on_or_before` / `date_on_or_after` with a data migration.**
  Honest identifiers, but it needs migration 0023 applied to four databases plus
  permanent legacy aliases in the evaluator map and the DAL guard, otherwise any
  row not yet migrated fails closed and blocks card-type saves. No user-visible
  gain over relabelling.
- **Keep the strict conditions and add two inclusive ones (five options).**
  Rejected: the request was to replace them, and it would leave every existing
  rule strict until reconfigured by hand, one at a time.

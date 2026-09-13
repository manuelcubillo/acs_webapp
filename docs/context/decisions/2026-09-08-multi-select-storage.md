# ADR: Multi-select stores its shape, not its rule

**Date**: 2026-09-08
**Status**: accepted
**Modules affected**: fields, validations, cards, history, dashboard

## Context

`allowMultiple` had existed as a select rule since the validation engine was
written, and enabling it made the field **unsubmittable**. Two halves
disagreed: `validateAllowMultiple` required `Array.isArray(value)`, while
`mapValueToColumn` grouped `select` with `text`/`photo` and threw on anything
that was not a string. `modules/fields.md` carried the open question — implement
it or drop the rule.

The obstacle was the dispatch signature. `mapValueToColumn(fieldType, value)`
and `extractValue(row, fieldType)` receive the field TYPE and nothing else;
they cannot see the field's `validation_rules`, so they cannot ask whether this
particular select is multiple. Threading the rules through both would touch
every call site — including `setFieldValue`, `createCard`, `updateCard`,
`executeAction` and the external API — for a question only one field type ever
asks.

## Decision

A select stores a single option in **`value_text`** and several in
**`value_json`**, dispatched on the runtime shape of the value
(`Array.isArray`) rather than on the field's configuration. The shape is
self-describing on the way back out: `extractValue` returns
`row.valueJson ?? row.valueText`.

The arity constraint — a single-select field must not receive several values —
lives in `validateOptions`, not in `validateAllowMultiple`, because a disabled
rule is ABSENT from `rules[]` and its own validator therefore never runs.

## Consequences

- **Positive:** every existing single-select row keeps the exact storage it has
  always had. No migration, no backfill, and no change to the shape of any
  value already written.
- **Positive:** a field toggled between single and multiple degrades gracefully
  in both directions. `SelectInput` coerces a stored array to its first item in
  single mode, and `validateAllowMultiple` now accepts a lone string, so
  turning the switch on does not invalidate every card that already has a value.
- **Positive:** text filters cover both columns through one shared predicate
  (`src/lib/dal/field-value-sql.ts`), used by the card list and by `/history`.
  `equals_text` on a multi-select reads as CONTAINMENT — "cards whose Zona
  includes Lisboa" — which is the useful question.
- **Negative / trade-offs:** `select` is now the only field type whose value can
  arrive in two shapes, so every consumer that formats a value has to handle an
  array. Four did (`SelectRenderer`, and the three independent `formatValue`
  helpers in `HistoryTableRow`, `ActivityFeedEntryRow` and `ActiveCardZone`) and
  all four were updated; a fifth would fail as `"a,b"` rather than as an error.
- **Negative / trade-offs:** the two columns are not mutually exclusive at the
  schema level. Nothing writes both — `mapValueToColumn` always nulls the rest —
  but a hand-written UPDATE could, and `value_json` would silently win.
- **Follow-ups:** an emptied multi-select clears the row rather than storing
  `[]`, so "no selection" keeps one representation all the way down.

Snapshots freeze the selection as a **sorted** `string[]`. A multi-select is a
set, so click order carries no meaning — but the content hash is taken over
those bytes, and an unsorted array would make the same selection dedupe as a
different state. `diffSnapshots` gained `sameValue`, since `===` on two arrays
compares references and would have reported every scan as a change.

## Alternatives considered

- **Thread the field's rules into `mapValueToColumn` / `extractValue`.**
  Rejected: it changes a signature used by five write paths and the external
  API so one field type can ask one question, and it makes the storage column
  depend on configuration that an admin can flip after the fact — the stored
  rows would then disagree with the rule that produced them.
- **JSON-encode the array into `value_text`.** Rejected: it puts a serialised
  array where every existing reader expects a plain string, and the text filters
  would match on the JSON punctuation. Encoding also has to survive an option
  value that itself contains a quote or a bracket.
- **A delimiter inside `value_text`.** Rejected outright — commas became legal
  inside an option value the same day (ADR
  `2026-09-08-select-options-are-configuration.md`), and there is no separator
  an operator cannot type.
- **Drop `allowMultiple` instead of implementing it.** The other half of the
  open question in `modules/fields.md`. Rejected because the feature was asked
  for; the rule and its validator already existed, so what was missing was the
  storage decision above and a multi-value input.

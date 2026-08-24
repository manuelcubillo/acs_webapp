# ADR: Scan validations skip empty optional fields

**Date**: 2026-08-15
**Status**: accepted
**Modules affected**: validations, fields, scanning, cards

## Context

Every scan-rule evaluator in `src/lib/validation/scan-validator.ts` is written as a positive type guard (`typeof v === "number" && v > target`, `if (!current) return false`, `v === true`). A field with no value therefore failed **every** rule attached to it, at `error` severity, which blocked the operational scan or opened the override modal — for a field the tenant had explicitly declared non-mandatory. A rule can only be attached to a `boolean`, `number` or `date` field, and on any of those an empty value is a legitimate state when `is_required = false`.

The mandatory flag was not reachable from inside the engine. `EnrichedFieldValue` carries `isRequired`, but `enrichFieldValues` maps over `field_values` **rows**, and a field left blank at card creation has no row at all (`insertFieldValues` skips null/undefined). The most common empty case is therefore a field that is simply absent from the array — its `isRequired` unreachable. A field emptied on a later edit is the other shape: the row survives with its typed column nulled, because `updateCard` upserts nulls.

## Decision

A scan validation whose target field is optional and holds no value is **skipped** — reported as `passed: true` with a `skipped: true` marker — instead of being evaluated. The same rule on a **required** field still fails: that is the anomaly the rule exists to catch. To make the flag reachable regardless of which empty shape occurred, `is_required` travels with the **rule** (`ScanValidationWithField.fieldIsRequired`, joined in the DAL) rather than with the value.

Empty means `undefined`, `null` or `""`. It is deliberately not a truthiness test: `false` and `0` are real values and are still evaluated.

## Consequences

- **Positive:** an optional field left blank no longer denies a scan or triggers the override modal. The rule reaches all five `validateScan` call sites (informational lookup, operational scan, post-action re-validations, resume) with no call-site change, and costs no extra query — `getScanValidationsByCardType` already inner-joins `field_definitions`.
- **Negative / trade-offs:** the semantic is global, not configurable. A tenant that wants "blank is a violation" must mark the field required, which also makes it mandatory in the card form — the two knobs are not independent. Making the field required later retroactively turns previously-skipped checks into failures on existing cards.
- **Follow-ups:** if per-rule control is ever needed, add a `skip_when_empty` flag to `scan_validations.value` and let it override this default; the skip is a single guard at the top of the evaluation loop, so the extension point is one condition wide. Constraint #9 (validations inform, never block) is untouched. The synthetic lifecycle check is unaffected — it carries no `fieldDefinitionId` and never enters this loop.

## Alternatives considered

- **Read `isRequired` from `EnrichedFieldValue`, treating an absent field as optional.** Rejected: it silently passes a *required* field that has no row, which is exactly the data-integrity case worth surfacing (legacy imports, or a field flipped to required after cards existed).
- **Pass the card type's field definitions as a third argument to `validateScan`.** Rejected: five call sites would each need an extra fetch or plumbing, for information the rule query already had in hand.
- **Per-rule `skip_when_empty` opt-in.** Rejected for now: needs a migration plus wizard UI, and the mandatory flag already expresses the intent the operator has in mind. Kept as the documented escape hatch above.

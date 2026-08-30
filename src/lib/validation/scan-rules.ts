/**
 * Scan Validation - Rule Catalogue
 *
 * Single source of truth for the scan-validation rule identifiers: which field
 * type each one targets, the shape of its stored `value` JSONB payload, and the
 * label shown to the user.
 *
 * Three layers read this catalogue and previously kept their own copy of the
 * list: the wizard step that configures a rule, the read-only summaries that
 * render a configured rule, and the DAL guard that refuses a rule attached to
 * an incompatible field type. The evaluators themselves live in
 * `scan-validator.ts` and are keyed by the same identifiers.
 */

import type { FieldType } from "@/lib/dal/types";

/** Shape of the JSONB `value` payload a rule expects. */
export type ScanRuleValueShape = "none" | "number" | "number_range" | "date";

/** Everything a UI layer needs to render and configure one scan rule. */
export interface ScanRuleMeta {
  /** Label shown in the condition selector and in read-only rule summaries. */
  label: string;
  /** The only field type this rule can be attached to. */
  fieldType: FieldType;
  /** Shape of the JSONB `value` payload the rule expects. */
  valueShape: ScanRuleValueShape;
}

/**
 * All supported scan validation rules.
 *
 * ⚠️ The two date comparisons are INCLUSIVE of the reference day, even though
 * their identifiers read as strict. The identifiers are deliberately unchanged:
 * `scan_validations.rule` is a free `text` column already populated in every
 * environment, and an identifier the engine does not know fails closed
 * (`scan-validator.ts` reports `passed: false` at error severity) while
 * `assertRuleCompatible` would reject it on the next card-type save. Renaming
 * would therefore need a data backfill plus permanent legacy aliases, for no
 * user-visible gain — the label carries the meaning. See ADR
 * `2026-08-29-inclusive-date-scan-validations.md`.
 */
export const SCAN_RULE_META: Record<string, ScanRuleMeta> = {
  boolean_is_true:  { label: "es Sí (verdadero)",            fieldType: "boolean", valueShape: "none" },
  boolean_is_false: { label: "es No (falso)",                fieldType: "boolean", valueShape: "none" },
  number_eq:        { label: "es igual a",                   fieldType: "number",  valueShape: "number" },
  number_gt:        { label: "es mayor que",                 fieldType: "number",  valueShape: "number" },
  number_lt:        { label: "es menor que",                 fieldType: "number",  valueShape: "number" },
  number_gte:       { label: "es mayor o igual que",         fieldType: "number",  valueShape: "number" },
  number_lte:       { label: "es menor o igual que",         fieldType: "number",  valueShape: "number" },
  number_between:   { label: "está entre (mín y máx)",       fieldType: "number",  valueShape: "number_range" },
  date_before:      { label: "es anterior o igual a",        fieldType: "date",    valueShape: "date" },
  date_after:       { label: "es posterior o igual a",       fieldType: "date",    valueShape: "date" },
  date_equals:      { label: "es igual a",                   fieldType: "date",    valueShape: "date" },
};

/**
 * Human-readable label for a rule identifier.
 *
 * Falls back to the raw identifier so a row written by a newer deploy still
 * renders something rather than blanking the summary.
 *
 * @param rule - The rule identifier stored in `scan_validations.rule`.
 * @returns The configured label, or the identifier itself when unknown.
 */
export function getScanRuleLabel(rule: string): string {
  return SCAN_RULE_META[rule]?.label ?? rule;
}

/**
 * The rule identifiers that can be attached to a given field type.
 *
 * @param fieldType - The target field's type.
 * @returns Rule identifiers, in catalogue order.
 */
export function getScanRulesForFieldType(fieldType: FieldType): string[] {
  return Object.entries(SCAN_RULE_META)
    .filter(([, meta]) => meta.fieldType === fieldType)
    .map(([rule]) => rule);
}

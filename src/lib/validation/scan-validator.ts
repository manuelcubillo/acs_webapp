/**
 * Scan Validator
 *
 * Pure TypeScript engine for evaluating scan validation rules at scan time.
 * No DB or React dependencies — safe to use on server, edge, or in tests.
 *
 * Supported rules:
 *   boolean_is_true   – field value must be true
 *   boolean_is_false  – field value must be false
 *   number_eq         – field value === target
 *   number_gt         – field value > target
 *   number_lt         – field value < target
 *   number_gte        – field value >= target
 *   number_lte        – field value <= target
 *   number_between    – min ≤ field value ≤ max
 *   date_before       – field date < target (calendar day)
 *   date_after        – field date > target (calendar day)
 *   date_equals       – field date === target (calendar day)
 *
 * Rule value shapes (stored as JSONB):
 *   boolean_*       : null / any  (value not used)
 *   number_eq/gt/…  : { target: number }
 *   number_between  : { min: number, max: number }
 *   date_*          : { target: string }  |  { relative: "today" }
 */

import type { EnrichedFieldValue, ScanValidationWithField } from "@/lib/dal/types";

// ─── Output types ─────────────────────────────────────────────────────────────

/** Result of evaluating a single scan validation rule against a card. */
export interface ScanValidationCheck {
  scanValidationId: string;
  fieldDefinitionId: string;
  fieldLabel: string;
  rule: string;
  /** Whether the rule is satisfied (i.e. NOT a problem). */
  passed: boolean;
  severity: "error" | "warning";
  /**
   * The error message to display when passed === false.
   * Empty string when passed === true.
   */
  message: string;
}

/**
 * Full result of running all scan validations for a card.
 * `passed` is true only when every single rule is satisfied.
 * Use per-check `severity` to decide whether to surface errors vs warnings.
 */
export interface ScanValidationResult {
  /** True only when ALL checks pass (errors + warnings). */
  passed: boolean;
  results: ScanValidationCheck[];
}

// ─── Date helpers ──────────────────────────────────────────────────────────────

/**
 * Resolve a date rule config to a midnight-normalised Date.
 *
 * Accepts:
 *   { relative: "today" }   — resolves to today at 00:00 local time
 *   { target: "2025-12-31" } — resolves to that calendar date at 00:00
 *
 * Returns null if the config is malformed.
 */
function resolveTargetDate(config: unknown): Date | null {
  if (config === null || typeof config !== "object") return null;
  const c = config as Record<string, unknown>;

  if (c.relative === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  if (typeof c.target === "string" && c.target.length > 0) {
    const d = new Date(c.target);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }

  return null;
}

/**
 * Normalise a Date (or ISO string / Date object from a DB row) to midnight.
 * Returns null when the value cannot be parsed.
 */
function toCalendarDay(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? new Date(value) : new Date(value as string);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── Rule evaluators ───────────────────────────────────────────────────────────

type RuleEvaluator = (currentValue: unknown, ruleValue: unknown) => boolean;

const SCAN_RULE_EVALUATORS: Record<string, RuleEvaluator> = {
  // ── Boolean ──────────────────────────────────────────────────────────────────
  boolean_is_true:  (v) => v === true,
  boolean_is_false: (v) => v === false,

  // ── Number ───────────────────────────────────────────────────────────────────
  number_eq: (v, rv) => {
    const c = rv as { target?: unknown };
    return typeof v === "number" && typeof c?.target === "number" && v === c.target;
  },
  number_gt: (v, rv) => {
    const c = rv as { target?: unknown };
    return typeof v === "number" && typeof c?.target === "number" && v > c.target;
  },
  number_lt: (v, rv) => {
    const c = rv as { target?: unknown };
    return typeof v === "number" && typeof c?.target === "number" && v < c.target;
  },
  number_gte: (v, rv) => {
    const c = rv as { target?: unknown };
    return typeof v === "number" && typeof c?.target === "number" && v >= c.target;
  },
  number_lte: (v, rv) => {
    const c = rv as { target?: unknown };
    return typeof v === "number" && typeof c?.target === "number" && v <= c.target;
  },
  number_between: (v, rv) => {
    if (typeof v !== "number") return false;
    const c = rv as Record<string, unknown>;
    const min = typeof c?.min === "number" ? c.min : null;
    const max = typeof c?.max === "number" ? c.max : null;
    if (min === null || max === null) return false;
    return v >= min && v <= max;
  },

  // ── Date ─────────────────────────────────────────────────────────────────────
  date_before: (v, rv) => {
    const current = toCalendarDay(v);
    const target  = resolveTargetDate(rv);
    if (!current || !target) return false;
    return current.getTime() < target.getTime();
  },
  date_after: (v, rv) => {
    const current = toCalendarDay(v);
    const target  = resolveTargetDate(rv);
    if (!current || !target) return false;
    return current.getTime() > target.getTime();
  },
  date_equals: (v, rv) => {
    const current = toCalendarDay(v);
    const target  = resolveTargetDate(rv);
    if (!current || !target) return false;
    return current.getTime() === target.getTime();
  },
};

// ─── Main function ─────────────────────────────────────────────────────────────

/**
 * Evaluate all active scan validations against the card's current field values.
 *
 * This function is side-effect free and can be called in any environment
 * (Server Action, API route, test). It never throws — unknown rules produce
 * a failed check rather than an exception.
 *
 * @param fieldValues     - Enriched field values for the card.
 * @param scanValidations - Active scan validation rules for the card type,
 *                          ordered by position.
 * @returns ScanValidationResult — overall pass/fail and per-rule check details.
 */
export function validateScan(
  fieldValues: EnrichedFieldValue[],
  scanValidations: ScanValidationWithField[],
): ScanValidationResult {
  // Build lookup: fieldDefinitionId → current value
  const valueByFieldId = new Map<string, unknown>();
  for (const fv of fieldValues) {
    valueByFieldId.set(fv.fieldDefinitionId, fv.value);
  }

  const results: ScanValidationCheck[] = [];

  for (const sv of scanValidations) {
    const currentValue = valueByFieldId.get(sv.fieldDefinitionId);
    const evaluator    = SCAN_RULE_EVALUATORS[sv.rule];

    let passed: boolean;
    if (!evaluator) {
      // Unknown rule — safe fallback: fail the check
      passed = false;
    } else {
      try {
        passed = evaluator(currentValue, sv.value);
      } catch {
        passed = false;
      }
    }

    results.push({
      scanValidationId: sv.id,
      fieldDefinitionId: sv.fieldDefinitionId,
      fieldLabel: sv.fieldLabel,
      rule: sv.rule,
      passed,
      severity: sv.severity as "error" | "warning",
      message: passed ? "" : sv.errorMessage,
    });
  }

  return {
    passed: results.every((r) => r.passed),
    results,
  };
}

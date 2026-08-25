/**
 * Scan validator tests
 *
 * Pins the empty-value contract of `validateScan`: a rule whose target field is
 * OPTIONAL and carries no value is skipped and reported as passed, while the
 * same rule on a REQUIRED field still fails.
 *
 * Regression guard: every rule evaluator is a positive type guard
 * (`typeof v === "number" && …`, `if (!current) return false`), so before the
 * skip existed the mere ABSENCE of a value produced an error-level failure —
 * blocking the scan, or opening the override modal, on a field the tenant had
 * explicitly declared non-mandatory.
 *
 * The two empty shapes are both covered, because they arise from different
 * write paths: a field left blank on creation has no `field_values` row at all
 * (`insertFieldValues` skips null/undefined), so it is missing from the card's
 * enriched values; a field emptied on a later edit keeps its row with the typed
 * column nulled (`updateCard` upserts nulls).
 *
 * `false` and `0` are NOT empty — they are values a rule must still evaluate.
 */

import { describe, it, expect } from "vitest";
import { validateScan, hasErrorLevelFailures } from "../scan-validator";
import type { EnrichedFieldValue, ScanValidationWithField } from "@/lib/dal/types";
import type { FieldType } from "../types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FIELD_ID = "11111111-1111-1111-1111-111111111111";

/** Build a scan validation rule targeting FIELD_ID. */
function rule(
  overrides: Partial<ScanValidationWithField> & { rule: string },
): ScanValidationWithField {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    cardTypeId: "33333333-3333-3333-3333-333333333333",
    fieldDefinitionId: FIELD_ID,
    value: null,
    errorMessage: "Regla incumplida",
    severity: "error",
    position: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    fieldName: "campo",
    fieldLabel: "Campo",
    fieldType: "number",
    fieldIsRequired: false,
    ...overrides,
  };
}

/**
 * Build the enriched value row for FIELD_ID.
 * `raw` is never read by the engine, so a minimal cast keeps the fixture honest
 * about what the function under test actually consumes.
 */
function value(
  v: unknown,
  fieldType: FieldType = "number",
  isRequired = false,
): EnrichedFieldValue {
  return {
    fieldDefinitionId: FIELD_ID,
    name: "campo",
    label: "Campo",
    fieldType,
    isRequired,
    isSystem: false,
    value: v,
    raw: {} as EnrichedFieldValue["raw"],
  };
}

/** Every rule the engine supports, paired with a well-formed rule value. */
const ALL_RULES: Array<{ rule: string; value: unknown; fieldType: FieldType }> = [
  { rule: "boolean_is_true",  value: null,                       fieldType: "boolean" },
  { rule: "boolean_is_false", value: null,                       fieldType: "boolean" },
  { rule: "number_eq",        value: { target: 5 },              fieldType: "number"  },
  { rule: "number_gt",        value: { target: 0 },              fieldType: "number"  },
  { rule: "number_lt",        value: { target: 10 },             fieldType: "number"  },
  { rule: "number_gte",       value: { target: 1 },              fieldType: "number"  },
  { rule: "number_lte",       value: { target: 9 },              fieldType: "number"  },
  { rule: "number_between",   value: { min: 1, max: 9 },         fieldType: "number"  },
  { rule: "date_before",      value: { relative: "today" },      fieldType: "date"    },
  { rule: "date_after",       value: { relative: "today" },      fieldType: "date"    },
  { rule: "date_equals",      value: { target: "2026-01-01" },   fieldType: "date"    },
];

// ─── Empty value on an OPTIONAL field → skipped ──────────────────────────────

describe("validateScan — empty value on an optional field", () => {
  it.each(ALL_RULES)(
    "skips $rule when the field has no field_values row at all",
    ({ rule: name, value: ruleValue, fieldType }) => {
      const result = validateScan(
        [], // field absent entirely — blank on create
        [rule({ rule: name, value: ruleValue, fieldType, fieldIsRequired: false })],
      );

      expect(result.passed).toBe(true);
      expect(result.results[0].passed).toBe(true);
      expect(result.results[0].skipped).toBe(true);
      expect(result.results[0].message).toBe("");
      expect(hasErrorLevelFailures(result)).toBe(false);
    },
  );

  it.each(ALL_RULES)(
    "skips $rule when the row exists with a null value",
    ({ rule: name, value: ruleValue, fieldType }) => {
      const result = validateScan(
        [value(null, fieldType)], // row kept, column cleared on edit
        [rule({ rule: name, value: ruleValue, fieldType, fieldIsRequired: false })],
      );

      expect(result.passed).toBe(true);
      expect(result.results[0].skipped).toBe(true);
    },
  );

  it("treats an empty string as empty", () => {
    const result = validateScan(
      [value("", "number")],
      [rule({ rule: "number_gt", value: { target: 0 }, fieldIsRequired: false })],
    );

    expect(result.passed).toBe(true);
    expect(result.results[0].skipped).toBe(true);
  });

  it("skips a warning-severity rule the same way", () => {
    const result = validateScan(
      [],
      [rule({ rule: "number_gt", value: { target: 0 }, severity: "warning" })],
    );

    expect(result.passed).toBe(true);
    expect(result.results[0].skipped).toBe(true);
  });

  it("skips only the empty field, still evaluating the others", () => {
    const otherId = "44444444-4444-4444-4444-444444444444";
    const result = validateScan(
      [{ ...value(0), fieldDefinitionId: otherId }],
      [
        rule({ rule: "number_gt", value: { target: 0 } }),
        rule({
          id: "55555555-5555-5555-5555-555555555555",
          fieldDefinitionId: otherId,
          rule: "number_gt",
          value: { target: 0 },
        }),
      ],
    );

    expect(result.results[0].skipped).toBe(true);
    expect(result.results[0].passed).toBe(true);
    expect(result.results[1].skipped).toBeUndefined();
    expect(result.results[1].passed).toBe(false); // 0 > 0 is false
    expect(result.passed).toBe(false);
  });
});

// ─── Empty value on a REQUIRED field → still fails ───────────────────────────

describe("validateScan — empty value on a required field", () => {
  it.each(ALL_RULES)(
    "still fails $rule when the field is required and has no row",
    ({ rule: name, value: ruleValue, fieldType }) => {
      const result = validateScan(
        [],
        [rule({ rule: name, value: ruleValue, fieldType, fieldIsRequired: true })],
      );

      expect(result.passed).toBe(false);
      expect(result.results[0].passed).toBe(false);
      expect(result.results[0].skipped).toBeUndefined();
      expect(result.results[0].message).toBe("Regla incumplida");
      expect(hasErrorLevelFailures(result)).toBe(true);
    },
  );

  it("still fails when the required field's row exists with a null value", () => {
    const result = validateScan(
      [value(null, "boolean", true)],
      [
        rule({
          rule: "boolean_is_true",
          fieldType: "boolean",
          fieldIsRequired: true,
        }),
      ],
    );

    expect(result.results[0].passed).toBe(false);
  });
});

// ─── Falsy-but-present values are NOT empty ──────────────────────────────────

describe("validateScan — falsy values are still evaluated", () => {
  it("fails boolean_is_true on an optional field holding false", () => {
    const result = validateScan(
      [value(false, "boolean")],
      [rule({ rule: "boolean_is_true", fieldType: "boolean" })],
    );

    expect(result.results[0].passed).toBe(false);
    expect(result.results[0].skipped).toBeUndefined();
  });

  it("passes boolean_is_false on an optional field holding false", () => {
    const result = validateScan(
      [value(false, "boolean")],
      [rule({ rule: "boolean_is_false", fieldType: "boolean" })],
    );

    expect(result.results[0].passed).toBe(true);
    expect(result.results[0].skipped).toBeUndefined();
  });

  it("fails number_gt on an optional field holding 0", () => {
    const result = validateScan(
      [value(0)],
      [rule({ rule: "number_gt", value: { target: 0 } })],
    );

    expect(result.results[0].passed).toBe(false);
    expect(result.results[0].skipped).toBeUndefined();
  });

  it("passes number_lt on an optional field holding 0", () => {
    const result = validateScan(
      [value(0)],
      [rule({ rule: "number_lt", value: { target: 10 } })],
    );

    expect(result.results[0].passed).toBe(true);
  });
});

// ─── Unrelated behaviour preserved ───────────────────────────────────────────

describe("validateScan — unchanged behaviour", () => {
  it("fails an unknown rule on a field that holds a value", () => {
    const result = validateScan(
      [value(5)],
      [rule({ rule: "number_is_prime" })],
    );

    expect(result.results[0].passed).toBe(false);
  });

  it("skips an unknown rule on a blank optional field", () => {
    // The skip is evaluated before the rule lookup: with nothing to check,
    // the rule name is irrelevant.
    const result = validateScan([], [rule({ rule: "number_is_prime" })]);

    expect(result.results[0].passed).toBe(true);
    expect(result.results[0].skipped).toBe(true);
  });

  it("returns passed=true with no rules configured", () => {
    expect(validateScan([value(5)], []).passed).toBe(true);
  });
});

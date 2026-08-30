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
 *
 * Also pins the calendar-day boundary of the date rules: `date_before` and
 * `date_after` INCLUDE the reference day even though their identifiers read as
 * strict (ADR `2026-08-29-inclusive-date-scan-validations.md`). Nothing else in
 * the suite asserts the comparison itself, so a revert to `<` / `>` would
 * otherwise go unnoticed.
 */

import { describe, it, expect } from "vitest";
import {
  validateScan,
  hasErrorLevelFailures,
  SCAN_RULE_EVALUATORS,
} from "../scan-validator";
import { SCAN_RULE_META } from "../scan-rules";
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

// ─── Date rules — calendar-day boundary ──────────────────────────────────────

/**
 * The reference day is INCLUDED by both `date_before` and `date_after`. The
 * identifiers read as strict for historical reasons (see `scan-rules.ts`), so
 * these cases are the only thing pinning the actual semantics — without them a
 * silent revert to `<` / `>` would pass the whole suite.
 */
describe("validateScan — date rules include the reference day", () => {
  const TARGET = { target: "2026-01-01" };
  const dateValue = (iso: string) => value(new Date(`${iso}T00:00:00`), "date");

  const cases: Array<{ rule: string; day: string; passes: boolean }> = [
    { rule: "date_before", day: "2025-12-31", passes: true  },
    { rule: "date_before", day: "2026-01-01", passes: true  }, // the boundary
    { rule: "date_before", day: "2026-01-02", passes: false },
    { rule: "date_after",  day: "2025-12-31", passes: false },
    { rule: "date_after",  day: "2026-01-01", passes: true  }, // the boundary
    { rule: "date_after",  day: "2026-01-02", passes: true  },
    { rule: "date_equals", day: "2025-12-31", passes: false },
    { rule: "date_equals", day: "2026-01-01", passes: true  },
    { rule: "date_equals", day: "2026-01-02", passes: false },
  ];

  it.each(cases)(
    "$rule against 2026-01-01 on $day → passed=$passes",
    ({ rule: name, day, passes }) => {
      const result = validateScan(
        [dateValue(day)],
        [rule({ rule: name, value: TARGET, fieldType: "date" })],
      );

      expect(result.results[0].passed).toBe(passes);
    },
  );
});

describe("validateScan — date rules include today under { relative: \"today\" }", () => {
  const TODAY = { relative: "today" };

  /** A Date at local midnight, `offsetDays` away from today. */
  function dayOffset(offsetDays: number): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    return d;
  }

  const cases: Array<{ rule: string; offset: number; passes: boolean }> = [
    { rule: "date_before", offset: -1, passes: true  },
    { rule: "date_before", offset:  0, passes: true  }, // the boundary
    { rule: "date_before", offset:  1, passes: false },
    { rule: "date_after",  offset: -1, passes: false },
    { rule: "date_after",  offset:  0, passes: true  }, // the boundary
    { rule: "date_after",  offset:  1, passes: true  },
  ];

  it.each(cases)(
    "$rule against today with offset $offset → passed=$passes",
    ({ rule: name, offset, passes }) => {
      const result = validateScan(
        [value(dayOffset(offset), "date")],
        [rule({ rule: name, value: TODAY, fieldType: "date" })],
      );

      expect(result.results[0].passed).toBe(passes);
    },
  );

  it("stops alerting on a card whose date is exactly today", () => {
    // The alert fires when the rule does NOT pass, so an inclusive comparison
    // means a carnet expiring today no longer raises an error-level failure.
    const result = validateScan(
      [value(dayOffset(0), "date")],
      [rule({ rule: "date_after", value: TODAY, fieldType: "date" })],
    );

    expect(hasErrorLevelFailures(result)).toBe(false);
  });
});

// ─── Catalogue / evaluator consistency ───────────────────────────────────────

describe("scan rule catalogue", () => {
  it("declares exactly the rules the engine can evaluate", () => {
    // A rule offered by the UI with no evaluator would fail closed at scan
    // time; an evaluator missing from the catalogue is unreachable and would
    // also be rejected by the DAL's field-type guard.
    expect(Object.keys(SCAN_RULE_META).sort()).toEqual(
      Object.keys(SCAN_RULE_EVALUATORS).sort(),
    );
  });
});

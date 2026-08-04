/**
 * Select options extraction tests
 *
 * Pins the contract between the layer that WRITES a select field's options
 * (the CardType wizard, via RULES_BY_FIELD_TYPE.select) and the three layers
 * that READ them (the card form input, the shared field-filter builder, the
 * validator).
 *
 * Regression guard: each reader previously hard-coded its own access pattern
 * and two of them were wrong — one looked up a rule named "allowedValues",
 * the other read `validationRules.options` instead of walking `rules[]`. Both
 * failure modes returned an empty array rather than throwing, so they surfaced
 * as silently empty dropdowns: a select field could not be assigned on card
 * creation, nor filtered in the card list or the history view.
 */

import { describe, it, expect } from "vitest";
import {
  getSelectOptions,
  getRulesForFieldType,
  SELECT_OPTIONS_RULE,
} from "../rules";
import { VALIDATOR_REGISTRY } from "../validators";

/** The exact JSONB shape persisted by ValidationRulesEditor for a select field. */
const STORED = {
  rules: [
    { rule: "options", value: ["Av.Madrid", "Lisboa", "Veredillas"] },
  ],
};

describe("getSelectOptions", () => {
  it("extracts options from the stored validation_rules shape", () => {
    expect(getSelectOptions(STORED)).toEqual([
      "Av.Madrid",
      "Lisboa",
      "Veredillas",
    ]);
  });

  it("finds the options rule regardless of its position in rules[]", () => {
    const rules = {
      rules: [
        { rule: "allowMultiple", value: true },
        { rule: "options", value: ["a", "b"] },
      ],
    };
    expect(getSelectOptions(rules)).toEqual(["a", "b"]);
  });

  it("returns an empty array for a select with no options configured", () => {
    expect(getSelectOptions({ rules: [] })).toEqual([]);
  });

  it("tolerates null, undefined and non-object payloads", () => {
    expect(getSelectOptions(null)).toEqual([]);
    expect(getSelectOptions(undefined)).toEqual([]);
    expect(getSelectOptions("nonsense")).toEqual([]);
    expect(getSelectOptions(42)).toEqual([]);
  });

  it("tolerates a malformed rules payload", () => {
    expect(getSelectOptions({ rules: "not-an-array" })).toEqual([]);
    expect(getSelectOptions({ rules: [null, 7] })).toEqual([]);
    expect(getSelectOptions({ rules: [{ rule: "options" }] })).toEqual([]);
    expect(
      getSelectOptions({ rules: [{ rule: "options", value: "not-an-array" }] }),
    ).toEqual([]);
  });

  it("drops non-string entries from the options list", () => {
    const rules = { rules: [{ rule: "options", value: ["a", 3, null, "b"] }] };
    expect(getSelectOptions(rules)).toEqual(["a", "b"]);
  });

  it("does NOT read options from the top level of validation_rules", () => {
    // The shape the field-filter builder used to expect. It never existed.
    expect(getSelectOptions({ options: ["a", "b"] })).toEqual([]);
  });
});

describe("select options rule name is single-sourced", () => {
  it("matches the rule the wizard offers for select fields", () => {
    const ruleNames = getRulesForFieldType("select").map((r) => r.rule);
    expect(ruleNames).toContain(SELECT_OPTIONS_RULE);
  });

  it("matches a registered validator", () => {
    expect(VALIDATOR_REGISTRY[SELECT_OPTIONS_RULE]).toBeTypeOf("function");
  });

  it("extracts options stored under that exact rule name", () => {
    const rules = { rules: [{ rule: SELECT_OPTIONS_RULE, value: ["x"] }] };
    expect(getSelectOptions(rules)).toEqual(["x"]);
  });
});

/**
 * Field-configuration vs validation-rule split
 *
 * A `select` field's option list and its multiplicity are stored inside
 * `validation_rules` for storage reasons only — they configure what the field
 * IS, they do not constrain what someone typed into it. The card-type wizard
 * therefore edits them in a dedicated section and the "Reglas de validación"
 * configurator must never offer them.
 *
 * These tests pin both halves of that split, because getting either wrong is
 * silent: a configuration rule leaking back into the configurator would show
 * up as the exact UI this separation removed, and a rule dropping out of
 * RULES_BY_FIELD_TYPE would stop being ENFORCED without any error.
 */

import { describe, it, expect } from "vitest";
import {
  ALLOW_MULTIPLE_RULE,
  countValidationRules,
  FIELD_CONFIGURATION_RULES,
  getAllowMultiple,
  getRulesForFieldType,
  getValidationRulesForFieldType,
  removeRule,
  SELECT_OPTIONS_RULE,
  upsertRule,
} from "../rules";
import { VALIDATOR_REGISTRY } from "../validators";
import type { FieldType, ValidationRule } from "../types";

const ALL_FIELD_TYPES: FieldType[] = [
  "text",
  "number",
  "boolean",
  "date",
  "photo",
  "select",
];

describe("FIELD_CONFIGURATION_RULES", () => {
  it("stays enforceable — every configuration rule has a validator", () => {
    for (const rule of FIELD_CONFIGURATION_RULES) {
      expect(VALIDATOR_REGISTRY[rule]).toBeTypeOf("function");
    }
  });

  it("stays declared — every configuration rule is still in the catalogue", () => {
    const declared = ALL_FIELD_TYPES.flatMap((t) =>
      getRulesForFieldType(t).map((d) => d.rule),
    );
    for (const rule of FIELD_CONFIGURATION_RULES) {
      expect(declared).toContain(rule);
    }
  });
});

describe("getValidationRulesForFieldType", () => {
  it("hides both select configuration rules from the rules configurator", () => {
    expect(getValidationRulesForFieldType("select")).toEqual([]);
  });

  it("never returns a configuration rule for any field type", () => {
    for (const fieldType of ALL_FIELD_TYPES) {
      const names = getValidationRulesForFieldType(fieldType).map((d) => d.rule);
      for (const rule of FIELD_CONFIGURATION_RULES) {
        expect(names).not.toContain(rule);
      }
    }
  });

  it("leaves the other field types untouched", () => {
    for (const fieldType of ALL_FIELD_TYPES.filter((t) => t !== "select")) {
      expect(getValidationRulesForFieldType(fieldType)).toEqual(
        getRulesForFieldType(fieldType),
      );
    }
  });
});

describe("rules hidden from the configurator", () => {
  // Taken out of RULES_BY_FIELD_TYPE on 2026-09-08 to shorten the operator's
  // screen. Their validators stay registered ON PURPOSE, so a field definition
  // that already stores one keeps being enforced — deleting a validator here
  // would silently stop validating existing cards.
  const HIDDEN = ["mustBeTrue", "pastOnly", "futureOnly", "maxSizeKb", "allowedFormats"];

  it("are absent from every field type's catalogue", () => {
    const declared = ALL_FIELD_TYPES.flatMap((t) =>
      getRulesForFieldType(t).map((d) => d.rule),
    );
    for (const rule of HIDDEN) {
      expect(declared).not.toContain(rule);
    }
  });

  it("keep their validators registered", () => {
    for (const rule of HIDDEN) {
      expect(VALIDATOR_REGISTRY[rule]).toBeTypeOf("function");
    }
  });

  it("leaves boolean and photo with no configurable rules at all", () => {
    expect(getRulesForFieldType("boolean")).toEqual([]);
    expect(getRulesForFieldType("photo")).toEqual([]);
  });
});

describe("every offered rule is presented in Spanish, by variable", () => {
  it("carries a non-empty label and description", () => {
    for (const fieldType of ALL_FIELD_TYPES) {
      for (const def of getRulesForFieldType(fieldType)) {
        expect(def.label.trim().length).toBeGreaterThan(0);
        expect(def.description.trim().length).toBeGreaterThan(0);
        // The configurator renders `label`, never the identifier — a label that
        // is just the key means someone added a rule and skipped the wording.
        expect(def.label).not.toBe(def.rule);
      }
    }
  });
});

describe("getAllowMultiple", () => {
  it("reads the rule when enabled", () => {
    const stored = { rules: [{ rule: ALLOW_MULTIPLE_RULE, value: true }] };
    expect(getAllowMultiple(stored)).toBe(true);
  });

  it("is false when the rule is absent", () => {
    expect(getAllowMultiple({ rules: [{ rule: "options", value: ["a"] }] })).toBe(false);
  });

  it("is false when the rule is present but disabled", () => {
    expect(getAllowMultiple({ rules: [{ rule: ALLOW_MULTIPLE_RULE, value: false }] })).toBe(
      false,
    );
  });

  it("is false for malformed payloads", () => {
    expect(getAllowMultiple(null)).toBe(false);
    expect(getAllowMultiple(undefined)).toBe(false);
    expect(getAllowMultiple("nonsense")).toBe(false);
    expect(getAllowMultiple({ rules: "not-an-array" })).toBe(false);
    expect(getAllowMultiple({ allowMultiple: true })).toBe(false);
  });
});

describe("countValidationRules", () => {
  it("does not count a select's options as a validation rule", () => {
    const stored = {
      rules: [
        { rule: SELECT_OPTIONS_RULE, value: ["a", "b"] },
        { rule: ALLOW_MULTIPLE_RULE, value: true },
      ],
    };
    expect(countValidationRules(stored)).toBe(0);
  });

  it("counts genuine validation rules", () => {
    const stored = {
      rules: [
        { rule: "minLength", value: 3 },
        { rule: "maxLength", value: 10 },
        { rule: SELECT_OPTIONS_RULE, value: ["a"] },
      ],
    };
    expect(countValidationRules(stored)).toBe(2);
  });

  it("is zero for malformed or absent payloads", () => {
    expect(countValidationRules(null)).toBe(0);
    expect(countValidationRules({ rules: [null, 7, { value: 1 }] })).toBe(0);
  });
});

describe("upsertRule / removeRule", () => {
  const base: ValidationRule[] = [{ rule: "minLength", value: 3 }];

  it("appends a rule that is not present yet", () => {
    expect(upsertRule(base, SELECT_OPTIONS_RULE, ["a"])).toEqual([
      { rule: "minLength", value: 3 },
      { rule: SELECT_OPTIONS_RULE, value: ["a"] },
    ]);
  });

  it("replaces the value of a rule already present, in place", () => {
    const withOptions = upsertRule(base, SELECT_OPTIONS_RULE, ["a"]);
    expect(upsertRule(withOptions, SELECT_OPTIONS_RULE, ["a", "b"])).toEqual([
      { rule: "minLength", value: 3 },
      { rule: SELECT_OPTIONS_RULE, value: ["a", "b"] },
    ]);
  });

  it("preserves a rule's custom message when updating its value", () => {
    const withMessage: ValidationRule[] = [
      { rule: "max", value: 10, message: "Demasiado alto" },
    ];
    expect(upsertRule(withMessage, "max", 20)).toEqual([
      { rule: "max", value: 20, message: "Demasiado alto" },
    ]);
  });

  it("does not mutate the input array", () => {
    upsertRule(base, SELECT_OPTIONS_RULE, ["a"]);
    expect(base).toEqual([{ rule: "minLength", value: 3 }]);
  });

  it("removes only the named rule", () => {
    const rules = upsertRule(base, SELECT_OPTIONS_RULE, ["a"]);
    expect(removeRule(rules, SELECT_OPTIONS_RULE)).toEqual([
      { rule: "minLength", value: 3 },
    ]);
  });

  it("is a no-op when removing an absent rule", () => {
    expect(removeRule(base, ALLOW_MULTIPLE_RULE)).toEqual(base);
  });
});

describe("options containing a comma", () => {
  it("survives a round trip — the old comma-separated input could not store one", () => {
    const options = ["Portal 1, bajo A", "Portal 2, bajo B"];
    const rules = upsertRule([], SELECT_OPTIONS_RULE, options);
    expect(rules).toEqual([{ rule: SELECT_OPTIONS_RULE, value: options }]);
  });
});

/**
 * Validation Engine Tests
 *
 * Pure unit tests — no DB, no mocks needed.
 * Covers the three layers:
 *  1. Individual validators
 *  2. validateField (single field)
 *  3. validateCard (multiple fields)
 */

import { describe, it, expect } from "vitest";
import { validateField, validateCard } from "../engine";
import { resolveMessage } from "../messages";
import {
  validateRequired,
  validateMinLength,
  validateMaxLength,
  validatePattern,
  validateMin,
  validateMax,
  validateInteger,
  validateMustBeTrue,
  validateMinDate,
  validateMaxDate,
  validatePastOnly,
  validateFutureOnly,
  validateOptions,
  validateAllowedFormats,
} from "../validators";
import type { FieldDefinitionShape, FieldValidationContext } from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeField(
  overrides: Partial<FieldDefinitionShape> = {},
): FieldDefinitionShape {
  return {
    id: "fd-1",
    name: "test_field",
    label: "Test Field",
    fieldType: "text",
    isRequired: false,
    validationRules: null,
    ...overrides,
  };
}

function makeContext(
  value: unknown,
  fieldOverrides: Partial<FieldDefinitionShape> = {},
): FieldValidationContext {
  return { fieldDefinition: makeField(fieldOverrides), value };
}

// ─── 1. Individual validators ────────────────────────────────────────────────

describe("validateRequired", () => {
  const ctx = makeContext(null);
  it("fails on null", () => expect(validateRequired(null, true, ctx)).toBe(false));
  it("fails on undefined", () => expect(validateRequired(undefined, true, ctx)).toBe(false));
  it("fails on empty string", () => expect(validateRequired("", true, ctx)).toBe(false));
  it("fails on empty array", () => expect(validateRequired([], true, ctx)).toBe(false));
  it("passes on non-empty string", () => expect(validateRequired("hello", true, ctx)).toBe(true));
  it("passes on 0 (zero is a valid number)", () => expect(validateRequired(0, true, ctx)).toBe(true));
  it("passes on false (valid boolean)", () => expect(validateRequired(false, true, ctx)).toBe(true));
});

describe("validateMinLength", () => {
  const ctx = makeContext("test");
  it("passes when length equals min", () => expect(validateMinLength("abc", 3, ctx)).toBe(true));
  it("passes when length exceeds min", () => expect(validateMinLength("abcde", 3, ctx)).toBe(true));
  it("fails when length is below min", () => expect(validateMinLength("ab", 3, ctx)).toBe(false));
  it("fails for non-string", () => expect(validateMinLength(42, 3, ctx)).toBe(false));
});

describe("validateMaxLength", () => {
  const ctx = makeContext("test");
  it("passes when length equals max", () => expect(validateMaxLength("abc", 3, ctx)).toBe(true));
  it("passes when length is below max", () => expect(validateMaxLength("ab", 3, ctx)).toBe(true));
  it("fails when length exceeds max", () => expect(validateMaxLength("abcd", 3, ctx)).toBe(false));
});

describe("validatePattern — raw regex", () => {
  const ctx = makeContext("test");
  it("passes when string matches pattern", () =>
    expect(validatePattern("abc123", "^[a-z0-9]+$", ctx)).toBe(true));
  it("fails when string does not match", () =>
    expect(validatePattern("ABC!", "^[a-z0-9]+$", ctx)).toBe(false));
});

describe("validatePattern — presets", () => {
  const ctx = makeContext("test");

  it("email preset: valid email passes", () =>
    expect(validatePattern("user@example.com", "email", ctx)).toBe(true));
  it("email preset: invalid email fails", () =>
    expect(validatePattern("not-an-email", "email", ctx)).toBe(false));

  it("phone preset: valid phone passes", () =>
    expect(validatePattern("+34 612 345 678", "phone", ctx)).toBe(true));
  it("phone preset: short string fails", () =>
    expect(validatePattern("123", "phone", ctx)).toBe(false));

  it("url preset: valid URL passes", () =>
    expect(validatePattern("https://example.com", "url", ctx)).toBe(true));
  it("url preset: plain text fails", () =>
    expect(validatePattern("not a url", "url", ctx)).toBe(false));

  it("alphanumeric preset: passes on letters+numbers", () =>
    expect(validatePattern("abc123", "alphanumeric", ctx)).toBe(true));
  it("alphanumeric preset: fails on special chars", () =>
    expect(validatePattern("abc-123", "alphanumeric", ctx)).toBe(false));

  it("no_special_chars preset: passes on alphanumeric + spaces", () =>
    expect(validatePattern("hello world", "no_special_chars", ctx)).toBe(true));
  it("no_special_chars preset: fails on @", () =>
    expect(validatePattern("hello@world", "no_special_chars", ctx)).toBe(false));
});

describe("validateMin / validateMax", () => {
  const ctx = makeContext(5);
  it("min: passes when value equals min", () => expect(validateMin(5, 5, ctx)).toBe(true));
  it("min: fails when value is below min", () => expect(validateMin(4, 5, ctx)).toBe(false));
  it("max: passes when value equals max", () => expect(validateMax(10, 10, ctx)).toBe(true));
  it("max: fails when value exceeds max", () => expect(validateMax(11, 10, ctx)).toBe(false));
  it("min: fails for non-number", () => expect(validateMin("5", 5, ctx)).toBe(false));
});

describe("validateInteger", () => {
  const ctx = makeContext(3);
  it("passes for integer", () => expect(validateInteger(3, true, ctx)).toBe(true));
  it("fails for float", () => expect(validateInteger(3.5, true, ctx)).toBe(false));
  it("passes when rule is disabled (false)", () => expect(validateInteger(3.5, false, ctx)).toBe(true));
});

describe("validateMustBeTrue", () => {
  const ctx = makeContext(false);
  it("passes when value is true", () => expect(validateMustBeTrue(true, true, ctx)).toBe(true));
  it("fails when value is false", () => expect(validateMustBeTrue(false, true, ctx)).toBe(false));
  it("passes when rule is disabled", () => expect(validateMustBeTrue(false, false, ctx)).toBe(true));
});

describe("validateMinDate / validateMaxDate", () => {
  const ctx = makeContext(new Date("2024-06-15"));
  it("minDate: passes when date is after min", () =>
    expect(validateMinDate(new Date("2024-06-15"), "2024-01-01", ctx)).toBe(true));
  it("minDate: fails when date is before min", () =>
    expect(validateMinDate(new Date("2023-12-31"), "2024-01-01", ctx)).toBe(false));
  it("maxDate: passes when date is before max", () =>
    expect(validateMaxDate(new Date("2024-06-15"), "2030-12-31", ctx)).toBe(true));
  it("maxDate: fails when date exceeds max", () =>
    expect(validateMaxDate(new Date("2031-01-01"), "2030-12-31", ctx)).toBe(false));
  it("minDate: accepts ISO string as value", () =>
    expect(validateMinDate("2024-06-15", "2024-01-01", ctx)).toBe(true));
});

describe("validatePastOnly / validateFutureOnly", () => {
  it("pastOnly: a clearly past date passes", () =>
    expect(validatePastOnly(new Date("2000-01-01"), true, makeContext(null))).toBe(true));
  it("pastOnly: a clearly future date fails", () =>
    expect(validatePastOnly(new Date("2099-01-01"), true, makeContext(null))).toBe(false));
  it("pastOnly: disabled rule always passes", () =>
    expect(validatePastOnly(new Date("2099-01-01"), false, makeContext(null))).toBe(true));

  it("futureOnly: a clearly future date passes", () =>
    expect(validateFutureOnly(new Date("2099-01-01"), true, makeContext(null))).toBe(true));
  it("futureOnly: a clearly past date fails", () =>
    expect(validateFutureOnly(new Date("2000-01-01"), true, makeContext(null))).toBe(false));
});

describe("validateOptions", () => {
  const ctx = makeContext("a");
  it("passes when value is in options", () =>
    expect(validateOptions("a", ["a", "b", "c"], ctx)).toBe(true));
  it("fails when value is not in options", () =>
    expect(validateOptions("d", ["a", "b", "c"], ctx)).toBe(false));
  it("passes when options array is empty (no restriction)", () =>
    expect(validateOptions("anything", [], ctx)).toBe(true));
});

describe("validateAllowedFormats", () => {
  const ctx = makeContext("photo.jpg");
  it("passes for allowed extension from URL string", () =>
    expect(validateAllowedFormats("photo.jpg", ["jpg", "png"], ctx)).toBe(true));
  it("fails for disallowed extension", () =>
    expect(validateAllowedFormats("photo.gif", ["jpg", "png"], ctx)).toBe(false));
  it("passes when allowed list is empty", () =>
    expect(validateAllowedFormats("photo.gif", [], ctx)).toBe(true));
  it("handles URLs with query strings", () =>
    expect(validateAllowedFormats("photo.jpg?v=1", ["jpg"], ctx)).toBe(true));
});

// ─── 2. validateField ─────────────────────────────────────────────────────────

describe("validateField — required behaviour", () => {
  it("required field with empty value → error with rule 'required'", () => {
    const result = validateField(makeContext("", { isRequired: true }));
    expect(result.valid).toBe(false);
    expect(result.errors[0].rule).toBe("required");
  });

  it("required field with value → no error", () => {
    const result = validateField(makeContext("María", { isRequired: true }));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("optional field with empty value → valid (skip rules)", () => {
    const result = validateField(
      makeContext("", {
        isRequired: false,
        validationRules: {
          rules: [{ rule: "minLength", value: 5 }],
        },
      }),
    );
    expect(result.valid).toBe(true);
  });
});

describe("validateField — rule evaluation", () => {
  it("collects all errors (does not stop at first failure)", () => {
    const result = validateField(
      makeContext("ab", {
        isRequired: true,
        validationRules: {
          rules: [
            { rule: "minLength", value: 5 },
            { rule: "maxLength", value: 3 }, // passes (ab ≤ 3)
            { rule: "pattern", value: "^[0-9]+$" }, // fails (not digits)
          ],
        },
      }),
    );
    // minLength fails, pattern fails → 2 errors
    expect(result.valid).toBe(false);
    const rules = result.errors.map((e) => e.rule);
    expect(rules).toContain("minLength");
    expect(rules).toContain("pattern");
  });

  it("unknown rule is skipped silently", () => {
    const result = validateField(
      makeContext("hello", {
        validationRules: {
          rules: [{ rule: "nonExistentRule", value: 42 }],
        },
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("validateField — custom message overrides default", () => {
  it("uses custom message when provided in the rule", () => {
    const result = validateField(
      makeContext("ab", {
        isRequired: true,
        validationRules: {
          rules: [
            {
              rule: "minLength",
              value: 5,
              message: "El nombre es demasiado corto",
            },
          ],
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toBe("El nombre es demasiado corto");
  });

  it("uses default message when no custom message", () => {
    const result = validateField(
      makeContext("ab", {
        isRequired: true,
        validationRules: { rules: [{ rule: "minLength", value: 5 }] },
      }),
    );
    expect(result.errors[0].message).toContain("at least 5 characters");
  });
});

// ─── 3. validateCard ─────────────────────────────────────────────────────────

describe("validateCard — multiple fields", () => {
  const nameDef: FieldDefinitionShape = {
    id: "fd-name",
    name: "nombre",
    label: "Nombre",
    fieldType: "text",
    isRequired: true,
    validationRules: { rules: [{ rule: "minLength", value: 2 }] },
  };

  const ageDef: FieldDefinitionShape = {
    id: "fd-age",
    name: "edad",
    label: "Edad",
    fieldType: "number",
    isRequired: false,
    validationRules: { rules: [{ rule: "min", value: 0 }, { rule: "max", value: 120 }] },
  };

  const emailDef: FieldDefinitionShape = {
    id: "fd-email",
    name: "email",
    label: "Email",
    fieldType: "text",
    isRequired: false,
    validationRules: { rules: [{ rule: "pattern", value: "email" }] },
  };

  it("all valid → result is valid with no errors", () => {
    const result = validateCard([nameDef, ageDef, emailDef], {
      "fd-name": "Ana",
      "fd-age": 30,
      "fd-email": "ana@example.com",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("required field missing → error on that field", () => {
    const result = validateCard([nameDef, ageDef], {
      "fd-name": "",
      "fd-age": 30,
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].fieldId).toBe("fd-name");
    expect(result.errors[0].rule).toBe("required");
  });

  it("multiple fields failing → all errors reported", () => {
    const result = validateCard([nameDef, ageDef, emailDef], {
      "fd-name": "A",        // too short
      "fd-age": 200,         // exceeds max 120
      "fd-email": "bad",     // not an email
    });
    expect(result.valid).toBe(false);
    const rules = result.errors.map((e) => e.rule);
    expect(rules).toContain("minLength");
    expect(rules).toContain("max");
    expect(rules).toContain("pattern");
  });

  it("optional fields with null values → valid", () => {
    const result = validateCard([nameDef, ageDef, emailDef], {
      "fd-name": "Carlos",
      "fd-age": null,
      "fd-email": null,
    });
    expect(result.valid).toBe(true);
  });

  it("optional field with invalid value → error", () => {
    const result = validateCard([nameDef, emailDef], {
      "fd-name": "Luis",
      "fd-email": "not-an-email",
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].fieldId).toBe("fd-email");
    expect(result.errors[0].rule).toBe("pattern");
  });
});

// ─── 4. resolveMessage ───────────────────────────────────────────────────────

describe("resolveMessage", () => {
  it("uses default template with {{label}} and {{value}} replaced", () => {
    const msg = resolveMessage("minLength", "Nombre", 5);
    expect(msg).toBe("Nombre must be at least 5 characters");
  });

  it("custom message overrides default", () => {
    const msg = resolveMessage("minLength", "Nombre", 5, "Demasiado corto");
    expect(msg).toBe("Demasiado corto");
  });

  it("custom message supports {{label}} placeholder", () => {
    const msg = resolveMessage("required", "Email", null, "{{label}} es obligatorio");
    expect(msg).toBe("Email es obligatorio");
  });

  it("formats arrays as comma-separated in {{value}}", () => {
    const msg = resolveMessage("allowedFormats", "Foto", ["jpg", "png", "webp"]);
    expect(msg).toBe("Foto must be one of: jpg, png, webp");
  });

  it("returns generic fallback for unknown rule", () => {
    const msg = resolveMessage("unknownRule", "Campo", 42);
    expect(msg).toContain("unknownRule");
  });
});

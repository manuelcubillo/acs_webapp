/**
 * Multi-select — the whole path, end to end
 *
 * `allowMultiple` existed as a rule for months but was unusable: enabling it
 * made the field unsubmittable, because `validateAllowMultiple` demanded an
 * array while `mapValueToColumn` threw on anything that was not a string. Both
 * halves are now implemented, and the failure was silent in each — nothing here
 * is covered by a type.
 *
 * The pieces pinned below are the ones a future change could quietly break:
 *
 *   - storage picks the column from the value's SHAPE, so single-select rows
 *     keep the exact `value_text` storage they always had;
 *   - a single-select field still refuses several values, and the check lives
 *     in `validateOptions` because a disabled rule is absent from `rules[]` and
 *     its own validator therefore never runs;
 *   - a snapshot freezes the selection SORTED, so the same set never dedupes
 *     as two different states.
 */

import { describe, it, expect } from "vitest";
import { mapValueToColumn, extractValue } from "@/lib/dal/field-values";
import { ValidationError } from "@/lib/dal/errors";
import { validateField } from "../engine";
import { validateOptions, validateAllowMultiple } from "../validators";
import { ALLOW_MULTIPLE_RULE, SELECT_OPTIONS_RULE } from "../rules";
import { buildCardSnapshotPayload } from "@/lib/snapshots/payload";
import { diffSnapshots } from "@/lib/snapshots/diff";
import type { FieldDefinitionShape, FieldValidationContext } from "../types";
import type { FieldValue } from "@/lib/dal/types";

const OPTIONS = ["Av.Madrid", "Lisboa", "Veredillas"];

function makeSelectField(
  allowMultiple: boolean,
  overrides: Partial<FieldDefinitionShape> = {},
): FieldDefinitionShape {
  return {
    id: "fd-1",
    name: "zona",
    label: "Zona",
    fieldType: "select",
    isRequired: false,
    validationRules: {
      rules: [
        { rule: SELECT_OPTIONS_RULE, value: OPTIONS },
        ...(allowMultiple ? [{ rule: ALLOW_MULTIPLE_RULE, value: true }] : []),
      ],
    },
    ...overrides,
  };
}

function ctx(allowMultiple: boolean, value: unknown): FieldValidationContext {
  return { fieldDefinition: makeSelectField(allowMultiple), value };
}

// ─── Storage ─────────────────────────────────────────────────────────────────

describe("mapValueToColumn — select", () => {
  it("stores a single option in value_text, exactly as before", () => {
    expect(mapValueToColumn("select", "Lisboa")).toMatchObject({
      valueText: "Lisboa",
      valueJson: null,
    });
  });

  it("stores several options in value_json", () => {
    expect(mapValueToColumn("select", ["Lisboa", "Veredillas"])).toMatchObject({
      valueText: null,
      valueJson: ["Lisboa", "Veredillas"],
    });
  });

  it("clears the row for an empty selection rather than storing []", () => {
    expect(mapValueToColumn("select", [])).toMatchObject({
      valueText: null,
      valueJson: null,
    });
  });

  it("rejects an array holding a non-string", () => {
    expect(() => mapValueToColumn("select", ["Lisboa", 7])).toThrow(ValidationError);
  });

  it("rejects a value that is neither a string nor an array", () => {
    expect(() => mapValueToColumn("select", { a: 1 })).toThrow(ValidationError);
  });
});

describe("extractValue — select", () => {
  const row = {
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    valueDate: null,
    valueJson: null,
  } as unknown as FieldValue;

  it("round-trips a multi-select through both helpers", () => {
    const stored = mapValueToColumn("select", ["Lisboa", "Veredillas"]);
    expect(extractValue({ ...row, ...stored } as FieldValue, "select")).toEqual([
      "Lisboa",
      "Veredillas",
    ]);
  });

  it("round-trips a single select through both helpers", () => {
    const stored = mapValueToColumn("select", "Lisboa");
    expect(extractValue({ ...row, ...stored } as FieldValue, "select")).toBe("Lisboa");
  });
});

// ─── Validation ──────────────────────────────────────────────────────────────

describe("validateOptions — arity", () => {
  it("accepts several values when allowMultiple is on", () => {
    expect(validateOptions(["Lisboa", "Veredillas"], OPTIONS, ctx(true, null))).toBe(true);
  });

  it("refuses several values when allowMultiple is off", () => {
    expect(validateOptions(["Lisboa", "Veredillas"], OPTIONS, ctx(false, null))).toBe(false);
  });

  it("accepts a single-item array even when allowMultiple is off", () => {
    // The arity rule is about how MANY, not about the wrapper.
    expect(validateOptions(["Lisboa"], OPTIONS, ctx(false, null))).toBe(true);
  });

  it("still refuses an unconfigured option inside an array", () => {
    expect(validateOptions(["Lisboa", "Oporto"], OPTIONS, ctx(true, null))).toBe(false);
  });
});

describe("validateAllowMultiple", () => {
  it("accepts an array whose items are all configured options", () => {
    expect(
      validateAllowMultiple(["Lisboa", "Veredillas"], true, ctx(true, null)),
    ).toBe(true);
  });

  it("rejects an array holding an unconfigured option", () => {
    expect(validateAllowMultiple(["Oporto"], true, ctx(true, null))).toBe(false);
  });

  it("accepts a lone string — turning the rule on must not invalidate existing cards", () => {
    // This is the regression: it used to require Array.isArray and fail here.
    expect(validateAllowMultiple("Lisboa", true, ctx(true, null))).toBe(true);
  });

  it("passes when the rule is disabled", () => {
    expect(validateAllowMultiple(["anything"], false, ctx(false, null))).toBe(true);
  });
});

describe("validateField — a multi-select field is submittable", () => {
  it("accepts a multiple selection", () => {
    const result = validateField(ctx(true, ["Lisboa", "Veredillas"]));
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("reports the offending rule for an unconfigured option", () => {
    const result = validateField(ctx(true, ["Oporto"]));
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.rule)).toContain(SELECT_OPTIONS_RULE);
  });

  it("treats an empty selection on an optional field as no value", () => {
    expect(validateField(ctx(true, []))).toEqual({ valid: true, errors: [] });
  });

  it("treats an empty selection on a REQUIRED field as missing", () => {
    const result = validateField({
      fieldDefinition: makeSelectField(true, { isRequired: true }),
      value: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].rule).toBe("required");
  });
});

// ─── Snapshots ───────────────────────────────────────────────────────────────

function snapshotWith(value: unknown) {
  return buildCardSnapshotPayload({
    code: "A-1",
    cardTypeId: "ct-1",
    cardTypeName: "Residente",
    fields: [
      {
        fieldDefinitionId: "fd-1",
        name: "zona",
        label: "Zona",
        type: "select",
        isSystem: false,
        value,
      },
    ],
  });
}

describe("card snapshots — multi-select", () => {
  it("freezes the selection as an array, not as a JSON string", () => {
    expect(snapshotWith(["Lisboa", "Veredillas"]).fields[0].value).toEqual([
      "Lisboa",
      "Veredillas",
    ]);
  });

  it("sorts the selection, so click order cannot fork the content hash", () => {
    expect(snapshotWith(["Veredillas", "Lisboa"]).fields[0].value).toEqual([
      "Lisboa",
      "Veredillas",
    ]);
  });

  it("reports no change between two snapshots of the same selection", () => {
    const a = snapshotWith(["Lisboa", "Veredillas"]);
    const b = snapshotWith(["Veredillas", "Lisboa"]);
    // Distinct array instances: `===` would call this a change on every scan.
    expect(diffSnapshots(a, b)).toEqual([]);
  });

  it("reports a change when the selection actually differs", () => {
    const changes = diffSnapshots(snapshotWith(["Lisboa"]), snapshotWith(["Lisboa", "Veredillas"]));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      before: ["Lisboa"],
      after: ["Lisboa", "Veredillas"],
    });
  });

  it("reports a change from a single value to a multiple one", () => {
    const changes = diffSnapshots(snapshotWith("Lisboa"), snapshotWith(["Lisboa", "Veredillas"]));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ before: "Lisboa", after: ["Lisboa", "Veredillas"] });
  });
});

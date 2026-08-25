/**
 * Pins the `toggle` value contract.
 *
 * The NULL case is the load-bearing one: a card created before its card type
 * gained a boolean field — or one whose field is excluded from the create form,
 * as the presence field is — has no `field_values` row at all. If NULL did not
 * read as false, the first scan of every such card would compute `!undefined`
 * by accident or throw, and presence would start inverted.
 */

import { describe, it, expect } from "vitest";
import { computeNewValue } from "../compute-new-value";
import { buildToggleStates } from "@/lib/fields/toggle-state";

describe("computeNewValue — toggle", () => {
  it("turns a missing value into true (first toggle = entry)", () => {
    expect(computeNewValue("toggle", null, 1)).toBe(true);
    expect(computeNewValue("toggle", undefined, 1)).toBe(true);
  });

  it("flips both ways", () => {
    expect(computeNewValue("toggle", false, 1)).toBe(true);
    expect(computeNewValue("toggle", true, 1)).toBe(false);
  });

  it("ignores the amount config", () => {
    expect(computeNewValue("toggle", true, 99)).toBe(false);
    expect(computeNewValue("toggle", false, 0)).toBe(true);
  });

  it("leaves the other action types alone", () => {
    expect(computeNewValue("increment", 5, 2)).toBe(7);
    expect(computeNewValue("decrement", 5, 2)).toBe(3);
    expect(computeNewValue("check", false, 1)).toBe(true);
    expect(computeNewValue("uncheck", true, 1)).toBe(false);
  });
});

describe("buildToggleStates", () => {
  const toggleAction = { id: "a1", actionType: "toggle", targetFieldDefinitionId: "f1" };
  const buttonAction = { id: "a2", actionType: "increment", targetFieldDefinitionId: "f2" };

  it("reads the target field's current value", () => {
    const states = buildToggleStates(
      [toggleAction],
      [{ fieldDefinitionId: "f1", value: true }],
    );
    expect(states).toEqual({ a1: true });
  });

  it("reads a missing value row as false, matching computeNewValue", () => {
    expect(buildToggleStates([toggleAction], [])).toEqual({ a1: false });
    expect(
      buildToggleStates([toggleAction], [{ fieldDefinitionId: "f1", value: null }]),
    ).toEqual({ a1: false });
  });

  it("omits non-toggle actions — they render as buttons and have no state", () => {
    const states = buildToggleStates(
      [toggleAction, buttonAction],
      [
        { fieldDefinitionId: "f1", value: false },
        { fieldDefinitionId: "f2", value: 7 },
      ],
    );
    expect(states).toEqual({ a1: false });
  });

  it("does not treat a truthy non-boolean as on", () => {
    const states = buildToggleStates(
      [toggleAction],
      [{ fieldDefinitionId: "f1", value: "true" }],
    );
    expect(states).toEqual({ a1: false });
  });
});

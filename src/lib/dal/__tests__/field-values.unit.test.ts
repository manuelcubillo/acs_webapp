/**
 * Unit tests for field-values helpers (mapValueToColumn, extractValue).
 *
 * These are pure functions with no DB dependency, so they can run
 * without any mocking or database connection.
 */

import { describe, it, expect } from "vitest";
import { mapValueToColumn, extractValue } from "../field-values";
import { ValidationError } from "../errors";
import type { FieldValue } from "../types";

// ─── mapValueToColumn ───────────────────────────────────────────────────────

describe("mapValueToColumn", () => {
  // --- text / photo / select → valueText ---

  it("maps text field type to valueText", () => {
    const result = mapValueToColumn("text", "hello");
    expect(result.valueText).toBe("hello");
    expect(result.valueNumber).toBeNull();
    expect(result.valueBoolean).toBeNull();
    expect(result.valueDate).toBeNull();
    expect(result.valueJson).toBeNull();
  });

  it("maps photo field type to valueText", () => {
    const result = mapValueToColumn("photo", "https://example.com/pic.jpg");
    expect(result.valueText).toBe("https://example.com/pic.jpg");
    expect(result.valueNumber).toBeNull();
  });

  it("maps select field type to valueText", () => {
    const result = mapValueToColumn("select", "option_a");
    expect(result.valueText).toBe("option_a");
    expect(result.valueNumber).toBeNull();
  });

  it("throws ValidationError when text field receives a number", () => {
    expect(() => mapValueToColumn("text", 42)).toThrow(ValidationError);
    expect(() => mapValueToColumn("text", 42)).toThrow(
      /Expected string for field type "text"/,
    );
  });

  it("throws ValidationError when photo field receives a boolean", () => {
    expect(() => mapValueToColumn("photo", true)).toThrow(ValidationError);
  });

  // --- number → valueNumber ---

  it("maps number field type to valueNumber", () => {
    const result = mapValueToColumn("number", 3.14);
    expect(result.valueNumber).toBe(3.14);
    expect(result.valueText).toBeNull();
  });

  it("throws ValidationError when number field receives a string", () => {
    expect(() => mapValueToColumn("number", "abc")).toThrow(ValidationError);
    expect(() => mapValueToColumn("number", "abc")).toThrow(
      /Expected number for field type "number"/,
    );
  });

  it("throws ValidationError when number field receives NaN", () => {
    expect(() => mapValueToColumn("number", NaN)).toThrow(ValidationError);
  });

  // --- boolean → valueBoolean ---

  it("maps boolean field type to valueBoolean", () => {
    const result = mapValueToColumn("boolean", true);
    expect(result.valueBoolean).toBe(true);
    expect(result.valueText).toBeNull();
  });

  it("maps false correctly", () => {
    const result = mapValueToColumn("boolean", false);
    expect(result.valueBoolean).toBe(false);
  });

  it("throws ValidationError when boolean field receives a string", () => {
    expect(() => mapValueToColumn("boolean", "true")).toThrow(ValidationError);
  });

  // --- date → valueDate ---

  it("maps Date object to valueDate", () => {
    const date = new Date("2024-06-15");
    const result = mapValueToColumn("date", date);
    expect(result.valueDate).toEqual(date);
    expect(result.valueText).toBeNull();
  });

  it("maps ISO string to valueDate", () => {
    const result = mapValueToColumn("date", "2024-06-15");
    expect(result.valueDate).toBeInstanceOf(Date);
    expect(result.valueDate!.toISOString()).toContain("2024-06-15");
  });

  it("throws ValidationError for invalid date string", () => {
    expect(() => mapValueToColumn("date", "not-a-date")).toThrow(
      ValidationError,
    );
    expect(() => mapValueToColumn("date", "not-a-date")).toThrow(
      /Invalid date value/,
    );
  });

  it("throws ValidationError when date field receives a number", () => {
    expect(() => mapValueToColumn("date", 12345)).toThrow(ValidationError);
  });

  // --- null / undefined → all columns null ---

  it("returns all nulls for null value", () => {
    const result = mapValueToColumn("text", null);
    expect(result.valueText).toBeNull();
    expect(result.valueNumber).toBeNull();
    expect(result.valueBoolean).toBeNull();
    expect(result.valueDate).toBeNull();
    expect(result.valueJson).toBeNull();
  });

  it("returns all nulls for undefined value", () => {
    const result = mapValueToColumn("number", undefined);
    expect(result.valueNumber).toBeNull();
  });
});

// ─── extractValue ───────────────────────────────────────────────────────────

describe("extractValue", () => {
  const baseRow: FieldValue = {
    id: "row-1",
    cardId: "card-1",
    fieldDefinitionId: "fd-1",
    valueText: "hello",
    valueNumber: 42,
    valueBoolean: true,
    valueDate: new Date("2024-01-01"),
    valueJson: { key: "val" },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("extracts valueText for text field type", () => {
    expect(extractValue(baseRow, "text")).toBe("hello");
  });

  it("extracts valueText for photo field type", () => {
    expect(extractValue(baseRow, "photo")).toBe("hello");
  });

  it("extracts valueText for select field type", () => {
    expect(extractValue(baseRow, "select")).toBe("hello");
  });

  it("extracts valueNumber for number field type", () => {
    expect(extractValue(baseRow, "number")).toBe(42);
  });

  it("extracts valueBoolean for boolean field type", () => {
    expect(extractValue(baseRow, "boolean")).toBe(true);
  });

  it("extracts valueDate for date field type", () => {
    expect(extractValue(baseRow, "date")).toEqual(new Date("2024-01-01"));
  });

  it("returns null when the matching column is null", () => {
    const row = { ...baseRow, valueText: null };
    expect(extractValue(row, "text")).toBeNull();
  });
});

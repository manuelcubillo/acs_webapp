import { describe, it, expect } from "vitest";
import { toDateInputValue } from "../date-input-value";

describe("toDateInputValue", () => {
  describe("empty values render an empty input", () => {
    it("returns an empty string for undefined", () => {
      expect(toDateInputValue(undefined)).toBe("");
    });

    it("returns an empty string for null", () => {
      expect(toDateInputValue(null)).toBe("");
    });

    it("returns an empty string for an empty string", () => {
      expect(toDateInputValue("")).toBe("");
    });
  });

  describe("Date objects (what the database hands back)", () => {
    it("formats a Date as YYYY-MM-DD", () => {
      expect(toDateInputValue(new Date(2026, 7, 27))).toBe("2026-08-27");
    });

    it("uses local calendar components, so a midnight date keeps its day", () => {
      // Under any positive UTC offset, toISOString() would move this to the
      // 26th. The value stored for a date field is exactly this shape.
      const midnight = new Date(2026, 7, 27, 0, 0, 0, 0);
      expect(toDateInputValue(midnight)).toBe("2026-08-27");
    });

    it("pads single-digit months and days", () => {
      expect(toDateInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
    });

    it("returns an empty string for an invalid Date", () => {
      expect(toDateInputValue(new Date("nope"))).toBe("");
    });
  });

  describe("strings (what the input emits back into form state)", () => {
    it("passes a plain YYYY-MM-DD through unchanged", () => {
      expect(toDateInputValue("2026-08-27")).toBe("2026-08-27");
    });

    it("takes the date part of an ISO timestamp verbatim, without converting", () => {
      expect(toDateInputValue("2026-08-27T00:00:00.000Z")).toBe("2026-08-27");
    });

    it("parses a non-ISO but valid date string", () => {
      expect(toDateInputValue("Aug 27, 2026")).toBe("2026-08-27");
    });

    it("returns an empty string for an unparseable string", () => {
      expect(toDateInputValue("basura")).toBe("");
    });
  });

  describe("anything else", () => {
    it("returns an empty string for a number", () => {
      expect(toDateInputValue(1756252800000)).toBe("");
    });

    it("returns an empty string for an object", () => {
      expect(toDateInputValue({ year: 2026 })).toBe("");
    });

    it("returns an empty string for a boolean", () => {
      expect(toDateInputValue(true)).toBe("");
    });
  });
});

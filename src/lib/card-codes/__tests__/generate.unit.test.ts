/**
 * Unit tests for generateNumericCode.
 *
 * The randomness source is injectable, so these run with no DB, no mocking of
 * globals, and — where it matters — a fully deterministic byte sequence.
 */

import { describe, it, expect } from "vitest";
import { generateNumericCode, type RandomBytes } from "../generate";
import { MAX_LENGTH, MIN_LENGTH } from "../constants";

/** A source that yields the given bytes in order, cycling if it runs out. */
function bytesFrom(sequence: number[]): RandomBytes {
  let cursor = 0;
  return (buffer) => {
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = sequence[cursor % sequence.length];
      cursor++;
    }
    return buffer;
  };
}

/** A source that yields the same byte forever. */
function constantByte(value: number): RandomBytes {
  return bytesFrom([value]);
}

describe("generateNumericCode", () => {
  // ── Shape ────────────────────────────────────────────────────────────────

  it("returns exactly the requested number of digits", () => {
    for (let length = 1; length <= MAX_LENGTH; length++) {
      expect(generateNumericCode(length)).toHaveLength(length);
    }
  });

  it("returns digits only", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateNumericCode(MIN_LENGTH)).toMatch(/^[0-9]+$/);
    }
  });

  it("returns a string, not a number", () => {
    expect(typeof generateNumericCode(MIN_LENGTH)).toBe("string");
  });

  // ── Leading zeros ────────────────────────────────────────────────────────

  it("can produce an all-zero code, preserving every leading zero", () => {
    // 0 % 10 === 0 → every digit is "0".
    expect(generateNumericCode(5, constantByte(0))).toBe("00000");
  });

  it("preserves leading zeros in a mixed code", () => {
    // 10 % 10 = 0, 20 % 10 = 0, 7 % 10 = 7, 42 % 10 = 2, 5 % 10 = 5
    const code = generateNumericCode(5, bytesFrom([10, 20, 7, 42, 5]));
    expect(code).toBe("00725");
    expect(code).toHaveLength(5);
    // The guard that matters: a code is never a number in disguise.
    expect(code).not.toBe(String(Number(code)));
  });

  it("never drops a leading zero across many random samples", () => {
    for (let i = 0; i < 2000; i++) {
      expect(generateNumericCode(MIN_LENGTH)).toHaveLength(MIN_LENGTH);
    }
  });

  // ── Bias ─────────────────────────────────────────────────────────────────

  it("discards bytes in the biased tail (250-255) instead of folding them", () => {
    // 250..255 would map to 0..5 and skew the distribution; they must be
    // skipped, so only the trailing 3 is used.
    expect(generateNumericCode(1, bytesFrom([250, 251, 255, 3]))).toBe("3");
  });

  it("distributes digits roughly uniformly (bias smoke test)", () => {
    const counts = new Array(10).fill(0);
    const samples = 4000;
    const length = MIN_LENGTH;

    for (let i = 0; i < samples; i++) {
      for (const digit of generateNumericCode(length)) {
        counts[Number(digit)]++;
      }
    }

    const total = samples * length;
    const expected = total / 10;
    // Generous band: this catches a systematic skew (e.g. modulo bias, or a
    // digit that can never appear), not ordinary sampling noise.
    for (const count of counts) {
      expect(count).toBeGreaterThan(expected * 0.8);
      expect(count).toBeLessThan(expected * 1.2);
    }
  });

  // ── Guards ───────────────────────────────────────────────────────────────

  it.each([0, -1, 1.5, NaN])("rejects an invalid length: %s", (length) => {
    expect(() => generateNumericCode(length)).toThrow(RangeError);
  });

  it("gives up instead of spinning forever on a source that only rejects", () => {
    expect(() => generateNumericCode(5, constantByte(255))).toThrow(
      /randomness source/i,
    );
  });

  it("requests bytes lazily, never more rounds than needed", () => {
    let rounds = 0;
    const source: RandomBytes = (buffer) => {
      rounds++;
      buffer.fill(1);
      return buffer;
    };

    expect(generateNumericCode(MAX_LENGTH, source)).toBe("1".repeat(MAX_LENGTH));
    expect(rounds).toBe(1);
  });
});

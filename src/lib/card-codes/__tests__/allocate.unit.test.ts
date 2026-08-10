/**
 * Unit tests for the adaptive allocation loop.
 *
 * Both the pure decision (`nextAttempt`) and the loop driving it are covered
 * with no database: the loop takes its insert attempt as a parameter, so a fake
 * that decides which codes are "taken" is enough to exercise every branch.
 */

import { describe, it, expect } from "vitest";
import {
  MAX_ATTEMPTS_PER_LENGTH,
  MAX_LENGTH,
  MIN_LENGTH,
} from "../constants";
import { FIRST_ATTEMPT, nextAttempt } from "../plan";
import { CardCodeExhaustedError, withGeneratedCode } from "../allocate";

// ─── The pure decision ───────────────────────────────────────────────────────

describe("nextAttempt", () => {
  it("starts at the minimum length", () => {
    expect(FIRST_ATTEMPT).toEqual({ length: MIN_LENGTH, attempt: 1 });
  });

  it("retries at the same length while attempts remain", () => {
    expect(nextAttempt({ length: MIN_LENGTH, attempt: 1 })).toEqual({
      length: MIN_LENGTH,
      attempt: 2,
    });
    expect(
      nextAttempt({ length: MIN_LENGTH, attempt: MAX_ATTEMPTS_PER_LENGTH - 1 }),
    ).toEqual({ length: MIN_LENGTH, attempt: MAX_ATTEMPTS_PER_LENGTH });
  });

  it("grows by one digit once the attempts at a length are exhausted", () => {
    expect(
      nextAttempt({ length: MIN_LENGTH, attempt: MAX_ATTEMPTS_PER_LENGTH }),
    ).toEqual({ length: MIN_LENGTH + 1, attempt: 1 });
  });

  it("gives up at MAX_LENGTH instead of growing further", () => {
    expect(
      nextAttempt({ length: MAX_LENGTH, attempt: MAX_ATTEMPTS_PER_LENGTH }),
    ).toBeNull();
  });

  it("still retries at MAX_LENGTH while attempts remain there", () => {
    expect(
      nextAttempt({ length: MAX_LENGTH, attempt: MAX_ATTEMPTS_PER_LENGTH - 1 }),
    ).toEqual({ length: MAX_LENGTH, attempt: MAX_ATTEMPTS_PER_LENGTH });
  });
});

// ─── The loop ────────────────────────────────────────────────────────────────

/**
 * Insert fake: refuses (`null`) every code in `taken`, otherwise "creates" it.
 * Records the codes it was offered, in order.
 */
function fakeInserter(taken: Set<string>) {
  const offered: string[] = [];
  return {
    offered,
    tryInsert: async (code: string) => {
      offered.push(code);
      return taken.has(code) ? null : { code };
    },
  };
}

/** Deterministic generator: sequential codes, zero-padded to the length asked. */
function sequentialCodes() {
  let n = 0;
  return (length: number) => String(n++).padStart(length, "0");
}

describe("withGeneratedCode", () => {
  it("returns on the first accepted code, generating exactly one", async () => {
    const { offered, tryInsert } = fakeInserter(new Set());

    const created = await withGeneratedCode(tryInsert, {
      generate: sequentialCodes(),
    });

    expect(created).toEqual({ code: "00000" });
    expect(offered).toEqual(["00000"]);
  });

  it("retries at the same length after a collision", async () => {
    const { offered, tryInsert } = fakeInserter(new Set(["00000", "00001"]));

    const created = await withGeneratedCode(tryInsert, {
      generate: sequentialCodes(),
    });

    expect(created).toEqual({ code: "00002" });
    expect(offered).toEqual(["00000", "00001", "00002"]);
    // All three still at the starting length — no premature growth.
    expect(offered.every((c) => c.length === MIN_LENGTH)).toBe(true);
  });

  it("grows the length only after exhausting the attempts at the current one", async () => {
    const lengths: number[] = [];
    // Every candidate collides until the generator is asked for a longer code.
    const tryInsert = async (code: string) => {
      lengths.push(code.length);
      return code.length > MIN_LENGTH ? { code } : null;
    };

    const created = await withGeneratedCode(tryInsert, {
      generate: sequentialCodes(),
    });

    expect(created).toEqual({ code: String(MAX_ATTEMPTS_PER_LENGTH).padStart(MIN_LENGTH + 1, "0") });
    expect(lengths).toHaveLength(MAX_ATTEMPTS_PER_LENGTH + 1);
    expect(lengths.slice(0, MAX_ATTEMPTS_PER_LENGTH)).toEqual(
      new Array(MAX_ATTEMPTS_PER_LENGTH).fill(MIN_LENGTH),
    );
    expect(lengths.at(-1)).toBe(MIN_LENGTH + 1);
  });

  it("throws once MAX_LENGTH is exhausted, without looping forever", async () => {
    const attempted: number[] = [];
    const alwaysTaken = async (code: string) => {
      attempted.push(code.length);
      return null;
    };

    await expect(
      withGeneratedCode(alwaysTaken, { generate: sequentialCodes() }),
    ).rejects.toBeInstanceOf(CardCodeExhaustedError);

    const lengthsCovered = MAX_LENGTH - MIN_LENGTH + 1;
    expect(attempted).toHaveLength(lengthsCovered * MAX_ATTEMPTS_PER_LENGTH);
    expect(attempted[0]).toBe(MIN_LENGTH);
    expect(attempted.at(-1)).toBe(MAX_LENGTH);
  });

  it("propagates a non-collision failure instead of retrying it", async () => {
    let calls = 0;
    const boom = async () => {
      calls++;
      throw new Error("connection reset");
    };

    await expect(
      withGeneratedCode(boom, { generate: sequentialCodes() }),
    ).rejects.toThrow("connection reset");
    expect(calls).toBe(1);
  });

  it("uses the real generator by default: numeric codes at the minimum length", async () => {
    const { offered, tryInsert } = fakeInserter(new Set());

    await withGeneratedCode(tryInsert);

    expect(offered).toHaveLength(1);
    expect(offered[0]).toMatch(/^[0-9]+$/);
    expect(offered[0]).toHaveLength(MIN_LENGTH);
  });
});

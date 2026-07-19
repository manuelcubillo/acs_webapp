/**
 * Unit tests for retention date maths.
 *
 * `getEffectiveRetentionDays` hits the database and is covered by
 * `lifecycle.integration.test.ts`; the pure date helpers are covered here.
 */

import { describe, it, expect } from "vitest";
import { computePurgeDueAt, daysUntilPurge } from "../retention";

describe("computePurgeDueAt", () => {
  it("adds the retention window to the archive instant", () => {
    const archivedAt = new Date("2026-07-17T10:00:00.000Z");
    expect(computePurgeDueAt(archivedAt, 30).toISOString()).toBe(
      "2026-08-16T10:00:00.000Z",
    );
  });

  it("works at the 1-day minimum", () => {
    const archivedAt = new Date("2026-07-17T10:00:00.000Z");
    expect(computePurgeDueAt(archivedAt, 1).toISOString()).toBe(
      "2026-07-18T10:00:00.000Z",
    );
  });

  it("works at the 365-day maximum", () => {
    const archivedAt = new Date("2026-07-17T10:00:00.000Z");
    expect(computePurgeDueAt(archivedAt, 365).toISOString()).toBe(
      "2027-07-17T10:00:00.000Z",
    );
  });

  it("crosses month and year boundaries", () => {
    expect(
      computePurgeDueAt(new Date("2026-12-20T00:00:00.000Z"), 30).toISOString(),
    ).toBe("2027-01-19T00:00:00.000Z");
  });

  it("handles a leap day without drifting", () => {
    expect(
      computePurgeDueAt(new Date("2028-02-28T00:00:00.000Z"), 1).toISOString(),
    ).toBe("2028-02-29T00:00:00.000Z");
  });

  it("does not mutate the input date", () => {
    const archivedAt = new Date("2026-07-17T10:00:00.000Z");
    computePurgeDueAt(archivedAt, 30);
    expect(archivedAt.toISOString()).toBe("2026-07-17T10:00:00.000Z");
  });

  it("stays in UTC regardless of the host timezone", () => {
    // setUTCDate is used rather than setDate precisely so a machine in, say,
    // Europe/Madrid does not shift the deadline by an hour across DST.
    const archivedAt = new Date("2026-03-28T23:30:00.000Z"); // eve of EU DST
    expect(computePurgeDueAt(archivedAt, 1).toISOString()).toBe(
      "2026-03-29T23:30:00.000Z",
    );
  });
});

describe("daysUntilPurge", () => {
  const archivedAt = new Date("2026-07-17T10:00:00.000Z");

  it("counts down over the window", () => {
    expect(
      daysUntilPurge(archivedAt, 30, new Date("2026-07-17T10:00:00.000Z")),
    ).toBe(30);
    expect(
      daysUntilPurge(archivedAt, 30, new Date("2026-08-06T10:00:00.000Z")),
    ).toBe(10);
  });

  it("returns 0 exactly at the deadline", () => {
    expect(
      daysUntilPurge(archivedAt, 30, new Date("2026-08-16T10:00:00.000Z")),
    ).toBe(0);
  });

  it("goes negative once overdue — the purge job's eligibility signal", () => {
    expect(
      daysUntilPurge(archivedAt, 30, new Date("2026-08-20T10:00:00.000Z")),
    ).toBe(-4);
  });

  it("rounds up so a partial day still reads as a day remaining", () => {
    expect(
      daysUntilPurge(archivedAt, 30, new Date("2026-08-15T22:00:00.000Z")),
    ).toBe(1);
  });
});

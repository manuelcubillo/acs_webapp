/**
 * Unit tests for isUniqueViolation.
 *
 * The fixtures reproduce the error shape observed from BOTH configured drivers:
 * drizzle 0.45 throws `DrizzleQueryError`, and the SQLSTATE sits one `cause`
 * down on the driver error (`NeonDbError` for neon-http, `DatabaseError` for
 * node-postgres). Both carry `code: "23505"` plus `constraint` and `table`.
 */

import { describe, it, expect } from "vitest";
import { isUniqueViolation, PG_UNIQUE_VIOLATION } from "../pg-errors";
import { CARDS_TENANT_CODE_UNIQUE } from "../schema";

/** A driver error as thrown through drizzle: wrapped, SQLSTATE on the cause. */
function drizzleWrapped(driverError: object): Error {
  const wrapper = new Error('Failed query: insert into "cards" ...');
  wrapper.name = "DrizzleQueryError";
  return Object.assign(wrapper, { cause: driverError });
}

function driverError(code: string, constraint?: string, table = "cards") {
  return Object.assign(new Error("duplicate key value violates unique constraint"), {
    code,
    constraint,
    table,
  });
}

describe("isUniqueViolation", () => {
  it("detects 23505 through the drizzle wrapper", () => {
    const error = drizzleWrapped(
      driverError(PG_UNIQUE_VIOLATION, CARDS_TENANT_CODE_UNIQUE),
    );

    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation(error, CARDS_TENANT_CODE_UNIQUE)).toBe(true);
  });

  it("detects 23505 on an unwrapped driver error", () => {
    const error = driverError(PG_UNIQUE_VIOLATION, CARDS_TENANT_CODE_UNIQUE);

    expect(isUniqueViolation(error, CARDS_TENANT_CODE_UNIQUE)).toBe(true);
  });

  it("rejects a unique violation on a DIFFERENT constraint", () => {
    const error = drizzleWrapped(
      driverError(PG_UNIQUE_VIOLATION, "field_values_card_field_unique", "field_values"),
    );

    expect(isUniqueViolation(error, CARDS_TENANT_CODE_UNIQUE)).toBe(false);
    // Still a unique violation in general — only the narrowing rejects it.
    expect(isUniqueViolation(error)).toBe(true);
  });

  it("rejects a violation whose constraint the driver did not report", () => {
    const error = drizzleWrapped(driverError(PG_UNIQUE_VIOLATION, undefined));

    expect(isUniqueViolation(error, CARDS_TENANT_CODE_UNIQUE)).toBe(false);
  });

  it("rejects other SQLSTATEs", () => {
    // 23503 = foreign_key_violation, 23502 = not_null_violation.
    expect(isUniqueViolation(drizzleWrapped(driverError("23503")))).toBe(false);
    expect(isUniqueViolation(drizzleWrapped(driverError("23502")))).toBe(false);
  });

  it("rejects anything that is not a driver error", () => {
    expect(isUniqueViolation(new Error("connection reset"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
    expect(isUniqueViolation({ code: 23505 })).toBe(false);
  });

  it("terminates on a cyclic cause chain", () => {
    const a: Record<string, unknown> = { name: "A" };
    const b: Record<string, unknown> = { name: "B", cause: a };
    a.cause = b;

    expect(isUniqueViolation(a, CARDS_TENANT_CODE_UNIQUE)).toBe(false);
  });
});

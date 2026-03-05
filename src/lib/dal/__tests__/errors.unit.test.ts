/**
 * Unit tests for DAL error classes.
 *
 * Validates error hierarchy, codes, messages, and instanceof checks.
 */

import { describe, it, expect } from "vitest";
import {
  DalError,
  NotFoundError,
  ValidationError,
  ForbiddenOperationError,
  DuplicateCodeError,
} from "../errors";

describe("DalError hierarchy", () => {
  it("NotFoundError extends DalError with code NOT_FOUND", () => {
    const err = new NotFoundError("Card", "abc-123");
    expect(err).toBeInstanceOf(DalError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.name).toBe("NotFoundError");
    expect(err.message).toContain("Card not found: abc-123");
  });

  it("ValidationError extends DalError with code VALIDATION_ERROR", () => {
    const err = new ValidationError("Bad input");
    expect(err).toBeInstanceOf(DalError);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.name).toBe("ValidationError");
  });

  it("ForbiddenOperationError extends DalError with code FORBIDDEN_OPERATION", () => {
    const err = new ForbiddenOperationError("Not allowed");
    expect(err).toBeInstanceOf(DalError);
    expect(err.code).toBe("FORBIDDEN_OPERATION");
    expect(err.name).toBe("ForbiddenOperationError");
  });

  it("DuplicateCodeError includes code and tenant in message", () => {
    const err = new DuplicateCodeError("RES-001", "tenant-xyz");
    expect(err).toBeInstanceOf(DalError);
    expect(err.code).toBe("DUPLICATE_CODE");
    expect(err.name).toBe("DuplicateCodeError");
    expect(err.message).toContain("RES-001");
    expect(err.message).toContain("tenant-xyz");
  });
});

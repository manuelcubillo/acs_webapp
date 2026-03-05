/**
 * DAL Error Classes
 *
 * Custom error hierarchy for the data access layer.
 * Each error carries a machine-readable `code` for programmatic handling
 * and a human-readable `message` for logging / API responses.
 */

/** Base class for all DAL errors. */
export class DalError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "DalError";
  }
}

/** Entity not found in the database. */
export class NotFoundError extends DalError {
  constructor(entity: string, identifier: string) {
    super(`${entity} not found: ${identifier}`, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

/** Input data failed business-rule validation. */
export class ValidationError extends DalError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

/** The operation is not allowed given the current state. */
export class ForbiddenOperationError extends DalError {
  constructor(message: string) {
    super(message, "FORBIDDEN_OPERATION");
    this.name = "ForbiddenOperationError";
  }
}

/** A card code already exists within the same tenant. */
export class DuplicateCodeError extends DalError {
  constructor(code: string, tenantId: string) {
    super(
      `Card code "${code}" already exists for tenant ${tenantId}`,
      "DUPLICATE_CODE",
    );
    this.name = "DuplicateCodeError";
  }
}

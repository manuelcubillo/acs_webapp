/**
 * API Layer - Error Types
 *
 * Application-level error classes used by the API layer (Server Actions and
 * Route Handlers) to produce typed, user-friendly error responses.
 *
 * These extend the DAL errors where appropriate but are separate so the API
 * layer can augment them with HTTP semantics without coupling the DAL to HTTP.
 */

// ─── Application Errors ───────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number = 500,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** 401 — no valid session. */
export class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super(message, "UNAUTHENTICATED", 401);
    this.name = "AuthenticationError";
  }
}

/** 403 — session exists but the user lacks permission. */
export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, "UNAUTHORIZED", 403);
    this.name = "AuthorizationError";
  }
}

/** 422 — request is well-formed but fails business logic validation. */
export class UnprocessableError extends AppError {
  constructor(message: string) {
    super(message, "UNPROCESSABLE", 422);
    this.name = "UnprocessableError";
  }
}

// ─── ActionResult — return type for Server Actions ────────────────────────────

/**
 * Discriminated union returned by every Server Action.
 *
 * Server Actions cannot throw across the network boundary, so errors must be
 * returned as data. Consumers check `result.success` before accessing
 * `result.data` or `result.error`.
 *
 * @example
 *   const result = await createCardAction(input);
 *   if (!result.success) {
 *     console.error(result.error);
 *     return;
 *   }
 *   console.log(result.data);
 */
export type ActionResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      /** Machine-readable error code (matches AppError.code or DAL error codes). */
      code?: string;
      /** Per-field validation errors (Zod field errors). */
      fieldErrors?: Record<string, string[]>;
    };

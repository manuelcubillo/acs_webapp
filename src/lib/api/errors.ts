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

// ─── Lifecycle gate errors (phase 2 — scan / action behaviour by status) ──────

/**
 * 403 — the card is archived (in the trash). Scanning or acting on it is a hard
 * denial that never passes through the override flow, even when the tenant has
 * `allow_override_on_error = true`.
 */
export class CardArchivedError extends AppError {
  constructor(message: string) {
    super(message, "CARD_ARCHIVED", 403);
    this.name = "CardArchivedError";
  }
}

/**
 * 422 — the card is switched off (inactive/expired) and the tenant does not
 * allow overriding, so the action is blocked with no confirmation path.
 */
export class LifecycleBlockedError extends AppError {
  constructor(message: string) {
    super(message, "LIFECYCLE_BLOCKED", 422);
    this.name = "LifecycleBlockedError";
  }
}

/**
 * 422 — the card is switched off (inactive/expired) and the tenant allows
 * overriding, but the caller did not pass `operatorOverride`. The client should
 * surface the override modal and retry the action with the flag set.
 */
export class OverrideRequiredError extends AppError {
  constructor(message: string) {
    super(message, "OVERRIDE_REQUIRED", 422);
    this.name = "OverrideRequiredError";
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

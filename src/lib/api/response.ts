/**
 * API Layer - Response Helpers
 *
 * Two sets of helpers:
 *
 * 1. `actionHandler` — wraps a Server Action callback and normalises any
 *    thrown error (DAL, Zod, AppError, unknown) into an `ActionResult<T>`.
 *
 * 2. `routeHandler` / `apiSuccess` / `apiError` — for Next.js Route Handlers
 *    (external REST API). Returns `NextResponse` with the correct HTTP status
 *    and a consistent `{ success, data|error }` JSON body.
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  NotFoundError,
  ValidationError,
  ForbiddenOperationError,
  DuplicateCodeError,
} from "@/lib/dal/errors";
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  type ActionResult,
} from "./errors";

// ─── Server Action helper ─────────────────────────────────────────────────────

/**
 * Wraps a Server Action callback, catching and normalising errors.
 *
 * Usage:
 * ```ts
 * export async function myAction(input: unknown): Promise<ActionResult<Card>> {
 *   return actionHandler(async () => {
 *     const data = MySchema.parse(input);
 *     return createCard(data);
 *   });
 * }
 * ```
 */
export async function actionHandler<T>(
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (err) {
    return normaliseActionError(err);
  }
}

function normaliseActionError(err: unknown): ActionResult<never> {
  // Zod validation error — extract per-field messages.
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_root";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return {
      success: false,
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      fieldErrors,
    };
  }

  // Known AppError subclasses.
  if (err instanceof AppError) {
    return { success: false, error: err.message, code: err.code };
  }

  // DAL errors — map to user-facing messages.
  if (err instanceof NotFoundError) {
    return { success: false, error: err.message, code: "NOT_FOUND" };
  }
  if (err instanceof DuplicateCodeError) {
    return { success: false, error: err.message, code: "DUPLICATE_CODE" };
  }
  if (err instanceof ValidationError) {
    return { success: false, error: err.message, code: "VALIDATION_ERROR" };
  }
  if (err instanceof ForbiddenOperationError) {
    return { success: false, error: err.message, code: "FORBIDDEN_OPERATION" };
  }

  // Unknown — don't leak internals in production.
  console.error("[actionHandler] Unhandled error:", err);
  return {
    success: false,
    error: "An unexpected error occurred",
    code: "INTERNAL_ERROR",
  };
}

// ─── Route Handler helpers ────────────────────────────────────────────────────

type ApiSuccessBody<T> = { success: true; data: T };
type ApiErrorBody = { success: false; error: string; code?: string };

export function apiSuccess<T>(data: T, status = 200): NextResponse<ApiSuccessBody<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

export function apiError(
  message: string,
  status: number,
  code?: string,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ success: false, error: message, code }, { status });
}

/**
 * Wraps a Route Handler callback, mapping errors to HTTP responses.
 *
 * Usage:
 * ```ts
 * export async function GET(request: NextRequest, { params }: ...) {
 *   return routeHandler(async () => {
 *     const card = await getCardByCode(params.code, tenantId);
 *     return apiSuccess(card);
 *   });
 * }
 * ```
 */
export async function routeHandler(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AuthenticationError) {
      return apiError(err.message, 401, err.code);
    }
    if (err instanceof AuthorizationError) {
      return apiError(err.message, 403, err.code);
    }
    if (err instanceof AppError) {
      return apiError(err.message, err.httpStatus, err.code);
    }
    if (err instanceof NotFoundError) {
      return apiError(err.message, 404, "NOT_FOUND");
    }
    if (err instanceof DuplicateCodeError) {
      return apiError(err.message, 409, "DUPLICATE_CODE");
    }
    if (err instanceof ValidationError) {
      return apiError(err.message, 422, "VALIDATION_ERROR");
    }
    if (err instanceof ForbiddenOperationError) {
      return apiError(err.message, 422, "FORBIDDEN_OPERATION");
    }
    if (err instanceof ZodError) {
      return apiError("Validation failed", 422, "VALIDATION_ERROR");
    }

    console.error("[routeHandler] Unhandled error:", err);
    return apiError("Internal server error", 500, "INTERNAL_ERROR");
  }
}

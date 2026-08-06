/**
 * Postgres driver error inspection.
 *
 * Both drivers configured in `./index.ts` report SQLSTATE the same way, and
 * drizzle 0.45 wraps whatever they throw:
 *
 *   DrizzleQueryError            ← what a DAL call actually catches
 *     └─ cause: NeonDbError      (neon-http)   code "23505", constraint, table
 *              | DatabaseError   (node-postgres, same fields)
 *
 * So the SQLSTATE never sits on the caught error itself — it is one `cause`
 * down, and a future driver or drizzle version could nest it deeper. Hence the
 * walk rather than a single property read.
 */

/** SQLSTATE for `unique_violation`. */
export const PG_UNIQUE_VIOLATION = "23505";

/** Depth limit for the `cause` walk — guards against a cyclic chain. */
const MAX_CAUSE_DEPTH = 8;

/** The subset of a driver error this module reads. */
interface PgErrorLike {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
}

/**
 * Whether `error` is a Postgres unique-constraint violation.
 *
 * Pass `constraintName` to narrow it to one specific index: a violation of any
 * OTHER unique constraint then returns `false` and the error keeps propagating,
 * which is what makes a retry loop safe to build on top of this.
 *
 * @param error          - Anything caught from a drizzle call.
 * @param constraintName - Optional constraint the violation must be on.
 * @returns `true` only for SQLSTATE 23505 (on that constraint, when given).
 */
export function isUniqueViolation(
  error: unknown,
  constraintName?: string,
): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (current === null || typeof current !== "object") return false;

    const candidate = current as PgErrorLike;
    if (candidate.code === PG_UNIQUE_VIOLATION) {
      return (
        constraintName === undefined || candidate.constraint === constraintName
      );
    }

    current = candidate.cause;
  }

  return false;
}

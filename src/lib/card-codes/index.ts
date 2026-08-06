/**
 * Card code generation.
 *
 * Self-contained and side-effect free: no database access, no session, no
 * environment reads. The caller supplies the insert attempt; this module owns
 * only the candidate codes and the adaptive length policy.
 *
 * Usage:
 *   import { withGeneratedCode } from "@/lib/card-codes";
 */

export {
  MIN_LENGTH,
  MAX_LENGTH,
  MAX_ATTEMPTS_PER_LENGTH,
} from "./constants";

export { generateNumericCode, type RandomBytes } from "./generate";

export { FIRST_ATTEMPT, nextAttempt, type CodeAttempt } from "./plan";

export {
  withGeneratedCode,
  CardCodeExhaustedError,
  type TryInsertWithCode,
  type WithGeneratedCodeOptions,
} from "./allocate";

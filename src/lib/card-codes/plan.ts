/**
 * The adaptive length policy, expressed as a pure state transition.
 *
 * Extracted from the allocation loop so the decision — "this candidate was
 * taken, what do we try next?" — is testable on its own, with no database and
 * no randomness involved.
 */

import {
  MAX_ATTEMPTS_PER_LENGTH,
  MAX_LENGTH,
  MIN_LENGTH,
} from "./constants";

/** One position in the attempt sequence. */
export interface CodeAttempt {
  /** Number of digits the candidate code will have. */
  readonly length: number;
  /** 1-based attempt index **at this length**. Resets when the length grows. */
  readonly attempt: number;
}

/** Where every allocation starts: first try at the minimum length. */
export const FIRST_ATTEMPT: CodeAttempt = {
  length: MIN_LENGTH,
  attempt: 1,
};

/**
 * Decide what to try after `current` collided.
 *
 * Retries at the same length until `MAX_ATTEMPTS_PER_LENGTH` is spent, then
 * adds a digit and starts over. Returns `null` once `MAX_LENGTH` is exhausted,
 * which the caller must treat as a hard failure — never as "keep going".
 *
 * @param current - The attempt that just collided.
 * @returns The next attempt to make, or `null` if the policy is exhausted.
 */
export function nextAttempt(current: CodeAttempt): CodeAttempt | null {
  if (current.attempt < MAX_ATTEMPTS_PER_LENGTH) {
    return { length: current.length, attempt: current.attempt + 1 };
  }
  if (current.length < MAX_LENGTH) {
    return { length: current.length + 1, attempt: 1 };
  }
  return null;
}

/**
 * Canonical value computation for the built-in action types.
 *
 * This is the switch that historically lived (privately) inside
 * `executeAction`. It was relocated here verbatim so it can be the single
 * source of truth shared by `executeAction` (via the standard strategy) and any
 * custom strategy that wants to fall back to the default numeric/boolean
 * behavior. The logic is unchanged — the standard path produces byte-identical
 * results.
 */

import type { ActionType } from "@/lib/dal/types";

/**
 * Compute the new field value after applying a built-in action.
 *
 * - increment: numeric add of `amount` (missing/non-numeric current value → 0)
 * - decrement: numeric subtract of `amount` (missing/non-numeric current value → 0)
 * - check:     always true
 * - uncheck:   always false
 *
 * @param actionType   - The built-in action type.
 * @param currentValue - The target field's current value (may be null/unset).
 * @param amount       - Delta for increment/decrement (ignored by check/uncheck).
 * @returns The computed new value.
 */
export function computeNewValue(
  actionType: ActionType,
  currentValue: unknown,
  amount: number,
): unknown {
  switch (actionType) {
    case "increment": {
      const cur = typeof currentValue === "number" ? currentValue : 0;
      return cur + amount;
    }
    case "decrement": {
      const cur = typeof currentValue === "number" ? currentValue : 0;
      return cur - amount;
    }
    case "check":
      return true;
    case "uncheck":
      return false;
  }
}

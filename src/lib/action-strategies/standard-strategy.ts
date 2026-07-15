/**
 * Standard Action Strategy
 *
 * The default strategy for every tenant. It reproduces the historical
 * `executeAction` behavior EXACTLY: read the action's `amount` from config
 * (default 1) and delegate to the canonical `computeNewValue` switch.
 *
 * Any tenant whose `scan_strategy` is `"standard"` (the column default) resolves
 * to this strategy, so the built-in path stays byte-for-byte identical to the
 * pre-seam implementation. Do NOT add tenant-specific logic here — put that in a
 * dedicated strategy and register it in the resolver.
 */

import type {
  ActionStrategyContext,
  ActionStrategyResult,
  TenantActionStrategy,
} from "./types";
import { computeNewValue } from "./compute-new-value";

export const StandardActionStrategy: TenantActionStrategy = {
  key: "standard",

  async handleAction(
    ctx: ActionStrategyContext,
  ): Promise<ActionStrategyResult> {
    // Mirror the original executeAction computation verbatim: amount defaults
    // to 1 for numeric actions; check/uncheck ignore it.
    const cfg = ctx.action.config as { amount?: number } | null;
    const amount = cfg?.amount ?? 1;

    const newValue = computeNewValue(
      ctx.action.actionType,
      ctx.currentValue,
      amount,
    );

    return { newValue };
  },
};

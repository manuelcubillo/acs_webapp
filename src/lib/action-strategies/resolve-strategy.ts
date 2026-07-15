/**
 * Action Strategy Resolver
 *
 * Maps a tenant's `scan_strategy` column value to a concrete strategy instance.
 * Unknown or missing values fall back to the standard strategy, so a tenant is
 * never left without a handler and the default behavior always applies.
 */

import type { ScanStrategyKey, TenantActionStrategy } from "./types";
import { StandardActionStrategy } from "./standard-strategy";
import { InvitationActionStrategy } from "./invitation-strategy";

/**
 * Registry of available strategies, keyed by their `scan_strategy` value.
 * Add new custom strategies here (and to `ScanStrategyKey` in ./types).
 */
const STRATEGY_REGISTRY: Record<ScanStrategyKey, TenantActionStrategy> = {
  standard: StandardActionStrategy,
  invitation: InvitationActionStrategy,
};

/**
 * Resolve the action strategy for a tenant.
 *
 * @param scanStrategy - The tenant's `tenants.scan_strategy` value.
 * @returns The matching strategy, or the standard strategy when the value is
 *          null/undefined or not a registered key.
 */
export function resolveActionStrategy(
  scanStrategy: string | null | undefined,
): TenantActionStrategy {
  if (scanStrategy && scanStrategy in STRATEGY_REGISTRY) {
    return STRATEGY_REGISTRY[scanStrategy as ScanStrategyKey];
  }
  return StandardActionStrategy;
}

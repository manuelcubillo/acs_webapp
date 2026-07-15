/**
 * Tenant Action Strategies — Barrel Export
 *
 * The seam that lets ONE tenant route action execution to custom code while
 * every other tenant keeps the standard increment/decrement/check/uncheck path.
 *
 * Selection is driven by the `tenants.scan_strategy` column and resolved inside
 * `executeAction` (`src/lib/dal/actions.ts`) via `resolveActionStrategy`.
 *
 * Usage (from the dispatch point):
 *   import {
 *     resolveActionStrategy,
 *     createActionStrategyContext,
 *   } from "@/lib/action-strategies";
 */

export * from "./types";
export { computeNewValue } from "./compute-new-value";
export { StandardActionStrategy } from "./standard-strategy";
export { InvitationActionStrategy } from "./invitation-strategy";
export { resolveActionStrategy } from "./resolve-strategy";
export { createActionStrategyContext } from "./context";

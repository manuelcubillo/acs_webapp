/**
 * Tenant Action Strategy — Types
 *
 * A "tenant action strategy" is the piece of code that decides what an action
 * execution does for a given tenant. It sits behind `executeAction`
 * (`src/lib/dal/actions.ts`), which resolves the tenant's strategy from the
 * `tenants.scan_strategy` column and delegates the value computation to it.
 *
 * The default `"standard"` strategy reproduces the historical behavior exactly
 * (increment / decrement / check / uncheck). A custom strategy can be assigned
 * to ONE tenant to implement bespoke logic while every other tenant keeps the
 * standard path untouched.
 *
 * These are pure type declarations — no runtime dependencies — so they can be
 * imported from anywhere (DAL, strategies, tests) without creating cycles.
 */

import type { ActionType, Card, FieldType } from "@/lib/dal/types";

/**
 * Known strategy keys. Each value must correspond to a possible value of the
 * `tenants.scan_strategy` column and to a registered strategy in the resolver.
 */
export type ScanStrategyKey = "standard" | "invitation";

/**
 * Lightweight view of the field an action reads/writes, handed to the strategy
 * so it can branch on the target field without a second query.
 */
export interface StrategyTargetField {
  /** field_definitions.id of the target field. */
  id: string;
  /** Internal field name (snake_case). */
  name: string;
  /** User-facing label. */
  label: string;
  /** Field value type — determines which typed column stores the value. */
  fieldType: FieldType;
}

/**
 * The action the operator invoked. This is the TRIGGER a strategy branches on:
 * the custom function inspects `actionType` / `id` / `config` to decide what to
 * do. Built from the already-loaded action definition — no extra query.
 */
export interface StrategyAction {
  /** action_definitions.id of the invoked action. */
  id: string;
  /** increment | decrement | check | uncheck. */
  actionType: ActionType;
  /**
   * Raw action config (jsonb). For the built-in numeric actions this is
   * `{ amount: number }`; custom actions may store any shape.
   */
  config: Record<string, unknown> | null;
  /** The field this action reads/writes. */
  targetField: StrategyTargetField;
}

/**
 * A single prior `action_logs` row, decoded into the shape a strategy needs to
 * reconstruct history (e.g. "when did the last entry happen?"). The before/after
 * values and action type are lifted out of the log's `metadata` jsonb.
 */
export interface ActionHistoryRecord {
  /** action_logs.id. */
  id: string;
  /** "scan" (no field mutation) | "action" (a field was mutated). */
  logType: "scan" | "action";
  /** action_definitions.id for action rows; null for scan rows. */
  actionDefinitionId: string | null;
  /** action_type from metadata; null for scans / rows that predate the field. */
  actionType: ActionType | null;
  /** target_field (internal name) from metadata; null when not recorded. */
  targetField: string | null;
  /** Value before the action ran (from metadata.before_value). */
  beforeValue: unknown;
  /** Value after the action ran (from metadata.after_value). */
  afterValue: unknown;
  /** True when the action was executed via the operator-override flow. */
  operatorOverride: boolean;
  /** When the entry was recorded. */
  executedAt: Date;
  /** Auth user id who executed it (null for system / unattributed). */
  executedBy: string | null;
  /** Full raw metadata for anything not surfaced by the fields above. */
  metadata: Record<string, unknown> | null;
}

/** Filters for {@link ActionStrategyHelpers.getCardActionHistory}. */
export interface GetCardActionHistoryOptions {
  /** Max rows to return (default 100). */
  limit?: number;
  /** Rows to skip (default 0). */
  offset?: number;
  /** Restrict to a single log type. */
  logType?: "scan" | "action";
  /** Restrict to a single action definition. */
  actionDefinitionId?: string;
}

/**
 * Read/write helpers made available to a strategy. They are scoped to the card
 * being acted on (the card id is captured when the context is built), so the
 * strategy never has to pass it around.
 */
export interface ActionStrategyHelpers {
  /**
   * Read the card's prior action log, newest first. Use this to reconstruct
   * temporal facts ("last entry at…", "how many times checked…").
   */
  getCardActionHistory(
    options?: GetCardActionHistoryOptions,
  ): Promise<ActionHistoryRecord[]>;

  /**
   * Read the current value of ANY field on this card (not just the target).
   * Returns null when the field has no stored value. Uses the same
   * type-aware extraction as the rest of the DAL.
   */
  readField(fieldDefinitionId: string): Promise<unknown>;

  /**
   * Write a value to a field on this card directly.
   *
   * Prefer returning `{ newValue }` for the action's TARGET field — that write
   * goes through `executeAction`'s standard upsert AND is captured in the audit
   * log. Use `setFieldValue` only for AUXILIARY fields the strategy needs to
   * update as a side effect.
   *
   * Atomicity caveat: the Neon HTTP driver has no interactive transactions, so
   * this is a standalone write that is NOT wrapped with the target-field write
   * or the action log. A failure between writes can leave partial state — the
   * same trade-off documented on `executeAction`. It is also NOT logged, so
   * side-effect writes won't appear in the action history on their own.
   */
  setFieldValue(fieldDefinitionId: string, value: unknown): Promise<void>;
}

/**
 * Everything a strategy receives for a single action execution. Constructed once
 * per dispatch by `createActionStrategyContext` and passed into `handleAction`.
 */
export interface ActionStrategyContext extends ActionStrategyHelpers {
  /** Tenant this execution belongs to (from the authenticated session). */
  tenantId: string;
  /** The card being acted on (base row: id, code, cardTypeId, tenantId, status). */
  card: Card;
  /** The invoked action definition — the trigger to branch on. */
  action: StrategyAction;
  /** Current value of the target field (null when unset). */
  currentValue: unknown;
  /** Auth user id executing the action (optional; e.g. system / external API). */
  executedBy?: string;
}

/**
 * What a strategy returns. `newValue` is persisted to the TARGET field through
 * `executeAction`'s existing typed upsert and recorded in the audit log.
 * Returning `{ newValue: ctx.currentValue }` is an explicit no-op on the target.
 */
export interface ActionStrategyResult {
  /** New value for the action's target field. */
  newValue: unknown;
  /**
   * Optional extra key/values merged into the `action_logs.metadata` for this
   * execution (on top of the standard before/after/action_type keys). Use it to
   * record why the strategy computed what it did.
   */
  metadata?: Record<string, unknown>;
}

/**
 * A tenant action strategy. Implementations are stateless singletons registered
 * in the resolver and selected by `tenants.scan_strategy`.
 */
export interface TenantActionStrategy {
  /** Stable key; MUST equal one of the `tenants.scan_strategy` values. */
  readonly key: ScanStrategyKey;
  /**
   * Compute (and optionally side-effect) the result of one action execution.
   * This REPLACES the built-in value computation for the routed tenant — it is
   * the value computation, not a wrapper around increment/decrement.
   */
  handleAction(ctx: ActionStrategyContext): Promise<ActionStrategyResult>;
}

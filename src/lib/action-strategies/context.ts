                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          /**
 * Action Strategy Context — builder + helpers
 *
 * Constructs the `ActionStrategyContext` passed into a strategy's `handleAction`.
 * The read/write helpers are implemented here (plumbing, not tenant behavior) so
 * a strategy can lean on them with full autocomplete and without repeating the
 * card id on every call.
 *
 * Imports are from the concrete DAL files (`field-values`, `types`), NOT the
 * `@/lib/dal` barrel, to avoid an import cycle with `dal/actions.ts` (which
 * imports this module).
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { actionLogs, fieldDefinitions, fieldValues } from "@/lib/db/schema";
import { extractValue, mapValueToColumn } from "@/lib/dal/field-values";
import type { ActionType, Card, FieldType } from "@/lib/dal/types";
import type {
  ActionHistoryRecord,
  ActionStrategyContext,
  GetCardActionHistoryOptions,
  StrategyAction,
} from "./types";

// ─── Helper implementations ───────────────────────────────────────────────────

/** Decode a raw action_logs row into the strategy-facing history shape. */
function decodeLogRow(row: typeof actionLogs.$inferSelect): ActionHistoryRecord {
  const md = (row.metadata ?? null) as Record<string, unknown> | null;
  return {
    id: row.id,
    // Safe: getCardActionHistory filters to scan|action before decoding.
    logType: row.logType as "scan" | "action",
    actionDefinitionId: row.actionDefinitionId,
    actionType: (md?.action_type as ActionType | undefined) ?? null,
    targetField: (md?.target_field as string | undefined) ?? null,
    beforeValue: md?.before_value ?? null,
    afterValue: md?.after_value ?? null,
    operatorOverride: md?.operator_override === true,
    executedAt: row.executedAt,
    executedBy: row.executedBy,
    metadata: md,
  };
}

/** Read a card's action log (newest first), optionally filtered. */
async function getCardActionHistory(
  cardId: string,
  options: GetCardActionHistoryOptions = {},
): Promise<ActionHistoryRecord[]> {
  // Strategies reason about scans and action executions only. Lifecycle rows
  // (activate / deactivate / archive / restore) are audit-only and would
  // corrupt answers to questions like "when did the last entry happen?".
  const conditions = [
    eq(actionLogs.cardId, cardId),
    inArray(actionLogs.logType, ["scan", "action"]),
  ];
  if (options.logType) {
    conditions.push(eq(actionLogs.logType, options.logType));
  }
  if (options.actionDefinitionId) {
    conditions.push(
      eq(actionLogs.actionDefinitionId, options.actionDefinitionId),
    );
  }

  const rows = await db
    .select()
    .from(actionLogs)
    .where(and(...conditions))
    .orderBy(desc(actionLogs.executedAt))
    .limit(options.limit ?? 100)
    .offset(options.offset ?? 0);

  return rows.map(decodeLogRow);
}

/** Look up a field definition's value type (needed to pick the typed column). */
async function getFieldType(
  fieldDefinitionId: string,
): Promise<FieldType | null> {
  const [fd] = await db
    .select({ fieldType: fieldDefinitions.fieldType })
    .from(fieldDefinitions)
    .where(eq(fieldDefinitions.id, fieldDefinitionId))
    .limit(1);
  return fd ? (fd.fieldType as FieldType) : null;
}

/** Read the current value of a field on a card (null when unset/unknown). */
async function readField(
  cardId: string,
  fieldDefinitionId: string,
): Promise<unknown> {
  const fieldType = await getFieldType(fieldDefinitionId);
  if (!fieldType) return null;

  const [fv] = await db
    .select()
    .from(fieldValues)
    .where(
      and(
        eq(fieldValues.cardId, cardId),
        eq(fieldValues.fieldDefinitionId, fieldDefinitionId),
      ),
    )
    .limit(1);

  return fv ? extractValue(fv, fieldType) : null;
}

/**
 * Write a value to a field on a card. Standalone, non-transactional, and NOT
 * logged — see the caveat on `ActionStrategyHelpers.setFieldValue`.
 */
async function setFieldValue(
  cardId: string,
  fieldDefinitionId: string,
  value: unknown,
): Promise<void> {
  const fieldType = await getFieldType(fieldDefinitionId);
  if (!fieldType) {
    throw new Error(
      `setFieldValue: field definition "${fieldDefinitionId}" not found.`,
    );
  }

  const typedPayload = mapValueToColumn(fieldType, value);
  await db
    .insert(fieldValues)
    .values({ cardId, fieldDefinitionId, ...typedPayload })
    .onConflictDoUpdate({
      target: [fieldValues.cardId, fieldValues.fieldDefinitionId],
      set: { ...typedPayload, updatedAt: new Date() },
    });
}

// ─── Context builder ────────────────────────────────────────────────────────

/**
 * Build the per-dispatch context handed to `TenantActionStrategy.handleAction`.
 * The helpers are pre-bound to this card so the strategy never repeats the id.
 *
 * @param params.tenantId     - Tenant owning this execution (from the session).
 * @param params.card         - The card being acted on (base row).
 * @param params.action       - The invoked action definition (the trigger).
 * @param params.currentValue - Current value of the target field.
 * @param params.executedBy   - Auth user id performing the action (optional).
 */
export function createActionStrategyContext(params: {
  tenantId: string;
  card: Card;
  action: StrategyAction;
  currentValue: unknown;
  executedBy?: string;
}): ActionStrategyContext {
  const { tenantId, card, action, currentValue, executedBy } = params;

  return {
    tenantId,
    card,
    action,
    currentValue,
    executedBy,
    getCardActionHistory: (options) => getCardActionHistory(card.id, options),
    readField: (fieldDefinitionId) => readField(card.id, fieldDefinitionId),
    setFieldValue: (fieldDefinitionId, value) =>
      setFieldValue(card.id, fieldDefinitionId, value),
  };
}

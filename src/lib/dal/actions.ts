/**
 * Actions DAL
 *
 * Management of action definitions and atomic execution with real field mutation.
 *
 * Action definitions describe operations that modify a specific card field:
 *   - increment / decrement: add/subtract `config.amount` from a numeric field
 *   - check / uncheck:       set a boolean field to true / false
 *
 * executeAction runs the full sequence atomically inside a DB transaction:
 *   read current field value → compute new value → write new value → write log
 */

import { eq, and, desc, count, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  actionDefinitions,
  actionLogs,
  fieldDefinitions,
  fieldValues,
  cards,
} from "@/lib/db/schema";
import { NotFoundError, ValidationError } from "./errors";
import { mapValueToColumn, extractValue } from "./field-values";
import type {
  ActionDefinitionWithField,
  ActionExecutionResult,
  CreateActionDefinitionInput,
  UpdateActionDefinitionInput,
  ExecuteActionInput,
  ActionLog,
  PaginationOptions,
  PaginatedResult,
  FieldType,
} from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Validate that an action type is compatible with a field type. */
function assertCompatible(
  actionType: "increment" | "decrement" | "check" | "uncheck",
  fieldType: FieldType,
): void {
  if (
    (actionType === "increment" || actionType === "decrement") &&
    fieldType !== "number"
  ) {
    throw new ValidationError(
      `Action type "${actionType}" requires a number field, but target field type is "${fieldType}".`,
    );
  }
  if (
    (actionType === "check" || actionType === "uncheck") &&
    fieldType !== "boolean"
  ) {
    throw new ValidationError(
      `Action type "${actionType}" requires a boolean field, but target field type is "${fieldType}".`,
    );
  }
}

/** Compute the new field value after applying an action. */
function computeNewValue(
  actionType: "increment" | "decrement" | "check" | "uncheck",
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

// ─── Action Definition CRUD ──────────────────────────────────────────────────

/**
 * Create a new action definition for a card type.
 *
 * Validates:
 *   1. The target field belongs to the same card type.
 *   2. The field type is compatible with the action type.
 *   3. For increment/decrement, config.amount must be a positive number.
 *
 * @param cardTypeId - The card type UUID.
 * @param input      - Action definition data.
 * @returns The created action definition enriched with field info.
 */
export async function createActionDefinition(
  cardTypeId: string,
  input: CreateActionDefinitionInput,
): Promise<ActionDefinitionWithField> {
  // Validate target field belongs to this card type
  const [targetField] = await db
    .select()
    .from(fieldDefinitions)
    .where(
      and(
        eq(fieldDefinitions.id, input.targetFieldDefinitionId),
        eq(fieldDefinitions.cardTypeId, cardTypeId),
        eq(fieldDefinitions.isActive, true),
      ),
    )
    .limit(1);

  if (!targetField) {
    throw new ValidationError(
      `Field definition "${input.targetFieldDefinitionId}" not found or does not belong to card type "${cardTypeId}".`,
    );
  }

  assertCompatible(input.actionType, targetField.fieldType);

  // Validate amount for increment/decrement
  if (input.actionType === "increment" || input.actionType === "decrement") {
    const amount = (input.config as { amount?: number } | null)?.amount ?? 1;
    if (typeof amount !== "number" || amount <= 0) {
      throw new ValidationError(
        `config.amount must be a positive number for action type "${input.actionType}".`,
      );
    }
  }

  // Auto-calculate position as last
  const [countRow] = await db
    .select({ cnt: count() })
    .from(actionDefinitions)
    .where(eq(actionDefinitions.cardTypeId, cardTypeId));

  const position = input.position ?? Number(countRow?.cnt ?? 0);

  const [created] = await db
    .insert(actionDefinitions)
    .values({
      cardTypeId,
      name: input.name,
      actionType: input.actionType,
      targetFieldDefinitionId: input.targetFieldDefinitionId,
      config: input.config ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      position,
    })
    .returning();

  return {
    ...created,
    targetFieldName: targetField.name,
    targetFieldLabel: targetField.label,
    targetFieldType: targetField.fieldType,
  };
}

/**
 * Update an existing action definition.
 *
 * Does NOT allow changing targetFieldDefinitionId if action_logs exist.
 *
 * @param id    - Action definition UUID.
 * @param input - Fields to update.
 * @returns The updated action definition enriched with field info.
 */
export async function updateActionDefinition(
  id: string,
  input: UpdateActionDefinitionInput,
): Promise<ActionDefinitionWithField> {
  const [existing] = await db
    .select()
    .from(actionDefinitions)
    .where(eq(actionDefinitions.id, id))
    .limit(1);

  if (!existing) throw new NotFoundError("ActionDefinition", id);

  const [targetField] = await db
    .select()
    .from(fieldDefinitions)
    .where(eq(fieldDefinitions.id, existing.targetFieldDefinitionId))
    .limit(1);

  if (!targetField) throw new NotFoundError("FieldDefinition", existing.targetFieldDefinitionId);

  // Validate amount if config is updated
  if (
    input.config !== undefined &&
    (existing.actionType === "increment" || existing.actionType === "decrement")
  ) {
    const amount = (input.config as { amount?: number } | null)?.amount ?? 1;
    if (typeof amount !== "number" || amount <= 0) {
      throw new ValidationError(
        `config.amount must be a positive number for action type "${existing.actionType}".`,
      );
    }
  }

  const [updated] = await db
    .update(actionDefinitions)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.config !== undefined && { config: input.config }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.position !== undefined && { position: input.position }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(actionDefinitions.id, id))
    .returning();

  return {
    ...updated,
    targetFieldName: targetField.name,
    targetFieldLabel: targetField.label,
    targetFieldType: targetField.fieldType,
  };
}

/**
 * Deactivate an action definition (soft delete).
 *
 * @param id - Action definition UUID.
 */
export async function deactivateActionDefinition(id: string): Promise<void> {
  const [existing] = await db
    .select({ id: actionDefinitions.id })
    .from(actionDefinitions)
    .where(eq(actionDefinitions.id, id))
    .limit(1);

  if (!existing) throw new NotFoundError("ActionDefinition", id);

  await db
    .update(actionDefinitions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(actionDefinitions.id, id));
}

/**
 * Get all active action definitions for a card type, enriched with target field info.
 *
 * @param cardTypeId - The card type UUID.
 * @returns Active action definitions ordered by position, with field metadata.
 */
export async function getActionsForCardType(
  cardTypeId: string,
): Promise<ActionDefinitionWithField[]> {
  return db
    .select({
      id: actionDefinitions.id,
      cardTypeId: actionDefinitions.cardTypeId,
      name: actionDefinitions.name,
      actionType: actionDefinitions.actionType,
      targetFieldDefinitionId: actionDefinitions.targetFieldDefinitionId,
      config: actionDefinitions.config,
      icon: actionDefinitions.icon,
      color: actionDefinitions.color,
      position: actionDefinitions.position,
      isActive: actionDefinitions.isActive,
      createdAt: actionDefinitions.createdAt,
      updatedAt: actionDefinitions.updatedAt,
      targetFieldName: fieldDefinitions.name,
      targetFieldLabel: fieldDefinitions.label,
      targetFieldType: fieldDefinitions.fieldType,
    })
    .from(actionDefinitions)
    .innerJoin(
      fieldDefinitions,
      eq(actionDefinitions.targetFieldDefinitionId, fieldDefinitions.id),
    )
    .where(
      and(
        eq(actionDefinitions.cardTypeId, cardTypeId),
        eq(actionDefinitions.isActive, true),
      ),
    )
    .orderBy(asc(actionDefinitions.position));
}

/**
 * Get the field definitions from a card type that are compatible with a given action type.
 *
 * - increment / decrement → fields of type 'number'
 * - check / uncheck       → fields of type 'boolean'
 *
 * @param cardTypeId - Card type UUID.
 * @param actionType - The action type to check compatibility for.
 * @returns Array of compatible, active field definitions ordered by position.
 */
export async function getCompatibleFieldsForAction(
  cardTypeId: string,
  actionType: "increment" | "decrement" | "check" | "uncheck",
) {
  const compatibleType: FieldType =
    actionType === "increment" || actionType === "decrement" ? "number" : "boolean";

  return db
    .select()
    .from(fieldDefinitions)
    .where(
      and(
        eq(fieldDefinitions.cardTypeId, cardTypeId),
        eq(fieldDefinitions.fieldType, compatibleType),
        eq(fieldDefinitions.isActive, true),
      ),
    )
    .orderBy(asc(fieldDefinitions.position));
}

// ─── Action Execution ────────────────────────────────────────────────────────

/**
 * Execute an action on a card atomically.
 *
 * Transaction steps:
 *   1. Load action definition + target field (type, name, label)
 *   2. Read current field value for this card
 *   3. Compute new value (increment/decrement/check/uncheck)
 *   4. Upsert field value with new value
 *   5. Insert action log with rich metadata { action_type, target_field, before_value, after_value }
 *
 * @param input - Execution payload.
 * @returns Audit log + before/after values.
 */
export async function executeAction(
  input: ExecuteActionInput,
): Promise<ActionExecutionResult> {
  return db.transaction(async (tx) => {
    // 1. Load action definition joined with target field
    const [actionDef] = await tx
      .select({
        id: actionDefinitions.id,
        actionType: actionDefinitions.actionType,
        targetFieldDefinitionId: actionDefinitions.targetFieldDefinitionId,
        config: actionDefinitions.config,
        fieldName: fieldDefinitions.name,
        fieldLabel: fieldDefinitions.label,
        fieldType: fieldDefinitions.fieldType,
      })
      .from(actionDefinitions)
      .innerJoin(
        fieldDefinitions,
        eq(actionDefinitions.targetFieldDefinitionId, fieldDefinitions.id),
      )
      .where(
        and(
          eq(actionDefinitions.id, input.actionDefinitionId),
          eq(actionDefinitions.isActive, true),
        ),
      )
      .limit(1);

    if (!actionDef) {
      throw new NotFoundError("ActionDefinition", input.actionDefinitionId);
    }

    // 2. Read current field value
    const [existingFv] = await tx
      .select()
      .from(fieldValues)
      .where(
        and(
          eq(fieldValues.cardId, input.cardId),
          eq(fieldValues.fieldDefinitionId, actionDef.targetFieldDefinitionId),
        ),
      )
      .limit(1);

    const previousValue = existingFv
      ? extractValue(existingFv, actionDef.fieldType as FieldType)
      : null;

    // 3. Compute new value
    const cfg = actionDef.config as { amount?: number } | null;
    const amount = cfg?.amount ?? 1;
    const newValue = computeNewValue(
      actionDef.actionType as "increment" | "decrement" | "check" | "uncheck",
      previousValue,
      amount,
    );

    // 4. Upsert field value
    const typedPayload = mapValueToColumn(actionDef.fieldType as FieldType, newValue);
    await tx
      .insert(fieldValues)
      .values({
        cardId: input.cardId,
        fieldDefinitionId: actionDef.targetFieldDefinitionId,
        ...typedPayload,
      })
      .onConflictDoUpdate({
        target: [fieldValues.cardId, fieldValues.fieldDefinitionId],
        set: { ...typedPayload, updatedAt: new Date() },
      });

    // 5. Write audit log
    const [log] = await tx
      .insert(actionLogs)
      .values({
        cardId: input.cardId,
        actionDefinitionId: input.actionDefinitionId,
        executedBy: input.executedBy ?? null,
        metadata: {
          action_type: actionDef.actionType,
          target_field: actionDef.fieldName,
          before_value: previousValue,
          after_value: newValue,
        },
      })
      .returning();

    return {
      log,
      previousValue,
      newValue,
      targetFieldName: actionDef.fieldName,
      targetFieldLabel: actionDef.fieldLabel,
    };
  });
}

// ─── Action Logs ─────────────────────────────────────────────────────────────

/**
 * Get the action log history for a specific card, newest first.
 *
 * @param cardId  - The card's internal UUID.
 * @param options - Pagination options.
 * @returns Paginated action logs.
 */
export async function getActionLogs(
  cardId: string,
  options: PaginationOptions = {},
): Promise<PaginatedResult<ActionLog>> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const [{ total }] = await db
    .select({ total: count() })
    .from(actionLogs)
    .where(eq(actionLogs.cardId, cardId));

  const data = await db
    .select()
    .from(actionLogs)
    .where(eq(actionLogs.cardId, cardId))
    .orderBy(desc(actionLogs.executedAt))
    .limit(limit)
    .offset(offset);

  return { data, total, limit, offset };
}

/**
 * Get the most recent actions executed across a tenant (for dashboard).
 *
 * @param tenantId - Tenant UUID.
 * @param limit    - Max number of logs to return (default 20).
 * @returns Array of recent action logs.
 */
export async function getRecentActions(
  tenantId: string,
  limit = 20,
): Promise<ActionLog[]> {
  return db
    .select({
      id: actionLogs.id,
      cardId: actionLogs.cardId,
      actionDefinitionId: actionLogs.actionDefinitionId,
      executedAt: actionLogs.executedAt,
      executedBy: actionLogs.executedBy,
      metadata: actionLogs.metadata,
    })
    .from(actionLogs)
    .innerJoin(cards, eq(actionLogs.cardId, cards.id))
    .where(eq(cards.tenantId, tenantId))
    .orderBy(desc(actionLogs.executedAt))
    .limit(limit);
}

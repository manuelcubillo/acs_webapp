/**
 * Server Actions — Action Definitions & Execution
 *
 * Manage action definitions attached to card types, and record action
 * executions as audit log entries.
 *
 * Role matrix:
 *   OPERATOR: view action definitions, execute actions, view logs
 *   ADMIN:    (inherits operator — no additional action-definition permissions)
 *   MASTER:   above + create/edit/deactivate action definitions
 */

"use server";

import { z } from "zod";
import {
  actionHandler,
  requireOperator,
  requireMaster,
  type ActionResult,
} from "@/lib/api";
import {
  createActionDefinition,
  updateActionDefinition,
  deactivateActionDefinition,
  getActionsForCardType,
  getCompatibleFieldsForAction,
  executeAction,
  getActionLogs,
  getRecentActions,
} from "@/lib/dal";
import type {
  ActionDefinitionWithField,
  ActionExecutionResult,
  ActionLog,
  FieldDefinition,
  PaginatedResult,
} from "@/lib/dal";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const ActionTypeSchema = z.enum(["increment", "decrement", "check", "uncheck"]);

const CreateActionDefinitionSchema = z.object({
  name: z.string().min(1).max(200),
  actionType: ActionTypeSchema,
  /** The field this action will modify. */
  targetFieldDefinitionId: z.string().uuid(),
  /** increment/decrement: { amount: number }; check/uncheck: null */
  config: z.object({ amount: z.number().positive().optional() }).nullable().optional(),
  /** lucide-react icon name (optional) */
  icon: z.string().max(100).nullable().optional(),
  /** Tailwind / hex color key (optional) */
  color: z.string().max(50).nullable().optional(),
  position: z.number().int().min(0).optional(),
  /** When true, this action is triggered automatically on every operational scan. */
  isAutoExecute: z.boolean().optional(),
});

const UpdateActionDefinitionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  config: z.object({ amount: z.number().positive().optional() }).nullable().optional(),
  icon: z.string().max(100).nullable().optional(),
  color: z.string().max(50).nullable().optional(),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  isAutoExecute: z.boolean().optional(),
});

const ExecuteActionSchema = z.object({
  cardId: z.string().uuid(),
  actionDefinitionId: z.string().uuid(),
  /** When true, executes despite error-level validation failures (operator override). */
  operatorOverride: z.boolean().optional(),
  /** Validation error messages being overridden — stored in audit log metadata. */
  overrideValidationErrors: z.array(z.string()).optional(),
});

const GetActionLogsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

// ─── OPERATOR actions (read + execute) ────────────────────────────────────────

/**
 * List active action definitions for a card type (enriched with field info).
 * @role operator | admin | master
 */
export async function getActionsForCardTypeAction(
  cardTypeId: string,
): Promise<ActionResult<ActionDefinitionWithField[]>> {
  return actionHandler(async () => {
    await requireOperator();
    return getActionsForCardType(cardTypeId);
  });
}

/**
 * Get field definitions compatible with a given action type.
 * Used to populate the target-field selector in the wizard.
 * @role master
 */
export async function getCompatibleFieldsForActionAction(
  cardTypeId: string,
  actionType: string,
): Promise<ActionResult<FieldDefinition[]>> {
  return actionHandler(async () => {
    await requireMaster();
    const parsed = ActionTypeSchema.parse(actionType);
    return getCompatibleFieldsForAction(cardTypeId, parsed);
  });
}

/**
 * Execute an action on a card.
 * The `executedBy` and `tenantId` fields are set server-side from the session.
 * Returns before/after field values alongside the log entry.
 * @role operator | admin | master
 */
export async function executeActionAction(
  input: unknown,
): Promise<ActionResult<ActionExecutionResult>> {
  return actionHandler(async () => {
    const { userId, tenantId } = await requireOperator();
    const data = ExecuteActionSchema.parse(input);
    return executeAction({
      cardId: data.cardId,
      actionDefinitionId: data.actionDefinitionId,
      tenantId,
      executedBy: userId,
      operatorOverride: data.operatorOverride,
      overrideValidationErrors: data.overrideValidationErrors,
    });
  });
}

/**
 * Get paginated action logs for a card.
 * @role operator | admin | master
 */
export async function getActionLogsAction(
  cardId: string,
  input: unknown,
): Promise<ActionResult<PaginatedResult<ActionLog>>> {
  return actionHandler(async () => {
    await requireOperator();
    const data = GetActionLogsSchema.parse(input ?? {});
    return getActionLogs(cardId, data);
  });
}

/**
 * Get the most recent actions across the current tenant (for dashboard).
 * @role operator | admin | master
 */
export async function getRecentActionsAction(
  limit = 20,
): Promise<ActionResult<ActionLog[]>> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    return getRecentActions(tenantId, limit);
  });
}

// ─── MASTER actions — Action Definition management ────────────────────────────

/**
 * Create an action definition for a card type.
 * @role master
 */
export async function createActionDefinitionAction(
  cardTypeId: string,
  input: unknown,
): Promise<ActionResult<ActionDefinitionWithField>> {
  return actionHandler(async () => {
    await requireMaster();
    const data = CreateActionDefinitionSchema.parse(input);
    return createActionDefinition(cardTypeId, {
      name: data.name,
      actionType: data.actionType,
      targetFieldDefinitionId: data.targetFieldDefinitionId,
      config: data.config,
      icon: data.icon,
      color: data.color,
      position: data.position,
      isAutoExecute: data.isAutoExecute,
    });
  });
}

/**
 * Update an action definition.
 * @role master
 */
export async function updateActionDefinitionAction(
  id: string,
  input: unknown,
): Promise<ActionResult<ActionDefinitionWithField>> {
  return actionHandler(async () => {
    await requireMaster();
    const data = UpdateActionDefinitionSchema.parse(input);
    return updateActionDefinition(id, data);
  });
}

/**
 * Deactivate (soft-delete) an action definition.
 * @role master
 */
export async function deactivateActionDefinitionAction(
  id: string,
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    await requireMaster();
    await deactivateActionDefinition(id);
  });
}

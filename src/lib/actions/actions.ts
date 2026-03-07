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
  executeAction,
  getActionLogs,
  getRecentActions,
} from "@/lib/dal";
import type {
  ActionDefinition,
  ActionLog,
  PaginatedResult,
} from "@/lib/dal";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const ActionTypeSchema = z.enum(["guest_entry", "guest_exit"]);

const CreateActionDefinitionSchema = z.object({
  name: z.string().min(1).max(200),
  actionType: ActionTypeSchema,
  config: z.record(z.string(), z.unknown()).nullable().optional(),
});

const UpdateActionDefinitionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  config: z.record(z.string(), z.unknown()).nullable().optional(),
  isActive: z.boolean().optional(),
});

const ExecuteActionSchema = z.object({
  cardId: z.string().uuid(),
  actionDefinitionId: z.string().uuid(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const GetActionLogsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

// ─── OPERATOR actions (read + execute) ────────────────────────────────────────

/**
 * List active action definitions for a card type.
 * @role operator | admin | master
 */
export async function getActionsForCardTypeAction(
  cardTypeId: string,
): Promise<ActionResult<ActionDefinition[]>> {
  return actionHandler(async () => {
    await requireOperator();
    return getActionsForCardType(cardTypeId);
  });
}

/**
 * Execute an action on a card (creates an audit log entry).
 * The `executedBy` field is automatically set to the current user's ID.
 * @role operator | admin | master
 */
export async function executeActionAction(
  input: unknown,
): Promise<ActionResult<ActionLog>> {
  return actionHandler(async () => {
    const { userId } = await requireOperator();
    const data = ExecuteActionSchema.parse(input);
    return executeAction({
      cardId: data.cardId,
      actionDefinitionId: data.actionDefinitionId,
      executedBy: userId,
      metadata: data.metadata,
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
): Promise<ActionResult<ActionDefinition>> {
  return actionHandler(async () => {
    await requireMaster();
    const data = CreateActionDefinitionSchema.parse(input);
    return createActionDefinition(cardTypeId, {
      name: data.name,
      actionType: data.actionType,
      config: data.config,
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
): Promise<ActionResult<ActionDefinition>> {
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

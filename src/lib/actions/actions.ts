/**
 * Server Actions — Action Definitions & Execution
 *
 * Manage action definitions attached to card types, and record action
 * executions as audit log entries.
 */

"use server";

import { z } from "zod";
import { actionHandler, requireTenant, type ActionResult } from "@/lib/api";
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

// ─── Action Definition management ────────────────────────────────────────────

/**
 * Create an action definition for a card type.
 */
export async function createActionDefinitionAction(
  cardTypeId: string,
  input: unknown,
): Promise<ActionResult<ActionDefinition>> {
  return actionHandler(async () => {
    await requireTenant();
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
 */
export async function updateActionDefinitionAction(
  id: string,
  input: unknown,
): Promise<ActionResult<ActionDefinition>> {
  return actionHandler(async () => {
    await requireTenant();
    const data = UpdateActionDefinitionSchema.parse(input);
    return updateActionDefinition(id, data);
  });
}

/**
 * Deactivate (soft-delete) an action definition.
 */
export async function deactivateActionDefinitionAction(
  id: string,
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    await requireTenant();
    await deactivateActionDefinition(id);
  });
}

/**
 * List active action definitions for a card type.
 */
export async function getActionsForCardTypeAction(
  cardTypeId: string,
): Promise<ActionResult<ActionDefinition[]>> {
  return actionHandler(async () => {
    await requireTenant();
    return getActionsForCardType(cardTypeId);
  });
}

// ─── Action execution ─────────────────────────────────────────────────────────

/**
 * Execute an action on a card (creates an audit log entry).
 *
 * The `executedBy` field is automatically set to the current user's ID.
 */
export async function executeActionAction(
  input: unknown,
): Promise<ActionResult<ActionLog>> {
  return actionHandler(async () => {
    const { userId } = await requireTenant();
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
 */
export async function getActionLogsAction(
  cardId: string,
  input: unknown,
): Promise<ActionResult<PaginatedResult<ActionLog>>> {
  return actionHandler(async () => {
    await requireTenant();
    const data = GetActionLogsSchema.parse(input ?? {});
    return getActionLogs(cardId, data);
  });
}

/**
 * Get the most recent actions across the current tenant (for dashboard).
 */
export async function getRecentActionsAction(
  limit = 20,
): Promise<ActionResult<ActionLog[]>> {
  return actionHandler(async () => {
    const { tenantId } = await requireTenant();
    return getRecentActions(tenantId, limit);
  });
}

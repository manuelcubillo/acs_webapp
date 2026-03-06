/**
 * Actions DAL
 *
 * Management of action definitions and execution logging.
 * Action definitions describe what actions can be performed on a card type.
 * Action logs record an immutable audit trail of executed actions.
 */

import { eq, and, desc, count } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  actionDefinitions,
  actionLogs,
  cards,
} from "@/lib/db/schema";
import { NotFoundError } from "./errors";
import type {
  ActionDefinition,
  ActionLog,
  CreateActionDefinitionInput,
  UpdateActionDefinitionInput,
  ExecuteActionInput,
  PaginationOptions,
  PaginatedResult,
} from "./types";

// ─── Action Definition CRUD ──────────────────────────────────────────────────

/**
 * Create a new action definition for a card type.
 *
 * @param cardTypeId - The card type UUID.
 * @param input      - Action definition data.
 * @returns The created action definition.
 */
export async function createActionDefinition(
  cardTypeId: string,
  input: CreateActionDefinitionInput,
): Promise<ActionDefinition> {
  const [created] = await db
    .insert(actionDefinitions)
    .values({
      cardTypeId,
      name: input.name,
      actionType: input.actionType,
      config: input.config ?? null,
    })
    .returning();

  return created;
}

/**
 * Update an existing action definition.
 *
 * @param id    - Action definition UUID.
 * @param input - Fields to update.
 * @returns The updated action definition.
 * @throws {NotFoundError} If not found.
 */
export async function updateActionDefinition(
  id: string,
  input: UpdateActionDefinitionInput,
): Promise<ActionDefinition> {
  const [existing] = await db
    .select()
    .from(actionDefinitions)
    .where(eq(actionDefinitions.id, id))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("ActionDefinition", id);
  }

  const [updated] = await db
    .update(actionDefinitions)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.config !== undefined && { config: input.config }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(actionDefinitions.id, id))
    .returning();

  return updated;
}

/**
 * Deactivate an action definition (soft delete).
 *
 * @param id - Action definition UUID.
 * @throws {NotFoundError} If not found.
 */
export async function deactivateActionDefinition(id: string): Promise<void> {
  const [existing] = await db
    .select({ id: actionDefinitions.id })
    .from(actionDefinitions)
    .where(eq(actionDefinitions.id, id))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("ActionDefinition", id);
  }

  await db
    .update(actionDefinitions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(actionDefinitions.id, id));
}

/**
 * Get all active action definitions for a card type.
 *
 * @param cardTypeId - The card type UUID.
 * @returns Array of active action definitions.
 */
export async function getActionsForCardType(
  cardTypeId: string,
): Promise<ActionDefinition[]> {
  return db
    .select()
    .from(actionDefinitions)
    .where(
      and(
        eq(actionDefinitions.cardTypeId, cardTypeId),
        eq(actionDefinitions.isActive, true),
      ),
    );
}

/**
 * Log the execution of an action on a card.
 *
 * This only creates the audit log entry — no business logic is executed.
 * The actual side effects of each action type will be implemented at a
 * higher layer (service / API route).
 *
 * @param input - Action execution payload.
 * @returns The created action log row.
 * @throws {NotFoundError} If the action definition doesn't exist.
 */
export async function executeAction(
  input: ExecuteActionInput,
): Promise<ActionLog> {
  // Verify action definition exists and is active.
  const [actionDef] = await db
    .select()
    .from(actionDefinitions)
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

  const [log] = await db
    .insert(actionLogs)
    .values({
      cardId: input.cardId,
      actionDefinitionId: input.actionDefinitionId,
      executedBy: input.executedBy ?? null,
      metadata: input.metadata ?? null,
    })
    .returning();

  return log;
}

/**
 * Get the action log history for a specific card.
 *
 * @param cardId  - The card's internal UUID.
 * @param options - Pagination options.
 * @returns Paginated action logs, newest first.
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
 * Get the most recent actions executed across a tenant.
 *
 * Joins through cards to filter by tenant, ordered by execution time desc.
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

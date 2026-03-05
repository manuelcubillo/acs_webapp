/**
 * Card Types DAL
 *
 * CRUD operations for card type templates.
 * Card types define the schema (field definitions + action definitions)
 * that cards of this type will follow.
 */

import { eq, and, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cardTypes,
  fieldDefinitions,
  actionDefinitions,
} from "@/lib/db/schema";
import { NotFoundError } from "./errors";
import { addFieldDefinition } from "./field-definitions";
import type {
  CardType,
  CreateCardTypeInput,
  UpdateCardTypeInput,
  CardTypeWithFields,
  CardTypeWithFullSchema,
  FieldDefinition,
  ActionDefinition,
} from "./types";

/**
 * Create a new card type for a tenant.
 *
 * Optionally accepts initial field definitions which are created
 * alongside the card type. Because neon-http doesn't support interactive
 * transactions, fields are inserted sequentially after the card type.
 *
 * @param tenantId - The owning tenant UUID.
 * @param data     - Card type creation payload, optionally including field definitions.
 * @returns The newly created card type row.
 */
export async function createCardType(
  tenantId: string,
  data: CreateCardTypeInput,
): Promise<CardTypeWithFields> {
  const [cardType] = await db
    .insert(cardTypes)
    .values({
      tenantId,
      name: data.name,
      description: data.description ?? null,
    })
    .returning();

  // Create initial field definitions if provided.
  const fds: FieldDefinition[] = [];
  if (data.fieldDefinitions?.length) {
    for (let i = 0; i < data.fieldDefinitions.length; i++) {
      const fdInput = data.fieldDefinitions[i];
      const fd = await addFieldDefinition(cardType.id, {
        ...fdInput,
        position: fdInput.position ?? i,
      });
      fds.push(fd);
    }
  }

  return { ...cardType, fieldDefinitions: fds };
}

/**
 * Get a card type by ID with its active field definitions.
 *
 * Always scoped to a tenant for multi-tenant isolation.
 *
 * @param id       - Card type UUID.
 * @param tenantId - Tenant UUID.
 * @returns The card type with active field definitions sorted by position.
 * @throws {NotFoundError} If no card type matches within the tenant.
 */
export async function getCardTypeById(
  id: string,
  tenantId: string,
): Promise<CardTypeWithFields> {
  const [cardType] = await db
    .select()
    .from(cardTypes)
    .where(and(eq(cardTypes.id, id), eq(cardTypes.tenantId, tenantId)))
    .limit(1);

  if (!cardType) {
    throw new NotFoundError("CardType", id);
  }

  const fds = await db
    .select()
    .from(fieldDefinitions)
    .where(
      and(
        eq(fieldDefinitions.cardTypeId, id),
        eq(fieldDefinitions.isActive, true),
      ),
    )
    .orderBy(asc(fieldDefinitions.position));

  return { ...cardType, fieldDefinitions: fds };
}

/**
 * Get a card type with its full schema: field definitions + action definitions.
 *
 * @param id       - Card type UUID.
 * @param tenantId - Tenant UUID.
 * @returns The card type with active field and action definitions.
 * @throws {NotFoundError} If no card type matches within the tenant.
 */
export async function getCardTypeWithFullSchema(
  id: string,
  tenantId: string,
): Promise<CardTypeWithFullSchema> {
  const cardType = await getCardTypeById(id, tenantId);

  const actions: ActionDefinition[] = await db
    .select()
    .from(actionDefinitions)
    .where(
      and(
        eq(actionDefinitions.cardTypeId, id),
        eq(actionDefinitions.isActive, true),
      ),
    );

  return { ...cardType, actionDefinitions: actions };
}

/**
 * Update a card type's mutable fields.
 *
 * @param id       - Card type UUID.
 * @param tenantId - Tenant UUID for multi-tenant isolation.
 * @param data     - Partial update payload.
 * @returns The updated card type row.
 * @throws {NotFoundError} If no card type matches within the tenant.
 */
export async function updateCardType(
  id: string,
  tenantId: string,
  data: UpdateCardTypeInput,
): Promise<CardType> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) set.name = data.name;
  if (data.description !== undefined) set.description = data.description;
  if (data.isActive !== undefined) set.isActive = data.isActive;

  const [updated] = await db
    .update(cardTypes)
    .set(set)
    .where(and(eq(cardTypes.id, id), eq(cardTypes.tenantId, tenantId)))
    .returning();

  if (!updated) {
    throw new NotFoundError("CardType", id);
  }

  return updated;
}

/**
 * List active card types for a tenant.
 *
 * @param tenantId - Tenant UUID.
 * @returns Array of active card types ordered by name.
 */
export async function listCardTypes(tenantId: string): Promise<CardType[]> {
  return db
    .select()
    .from(cardTypes)
    .where(
      and(eq(cardTypes.tenantId, tenantId), eq(cardTypes.isActive, true)),
    )
    .orderBy(asc(cardTypes.name));
}

/**
 * Soft-delete a card type by setting `is_active = false`.
 *
 * @param id       - Card type UUID.
 * @param tenantId - Tenant UUID.
 * @returns The deactivated card type row.
 * @throws {NotFoundError} If no card type matches within the tenant.
 */
export async function deactivateCardType(
  id: string,
  tenantId: string,
): Promise<CardType> {
  return updateCardType(id, tenantId, { isActive: false });
}

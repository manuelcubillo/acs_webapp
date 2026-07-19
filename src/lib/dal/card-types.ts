/**
 * Card Types DAL
 *
 * CRUD operations for card type templates.
 * Card types define the schema (field definitions + action definitions)
 * that cards of this type will follow.
 */

import { eq, and, asc, desc, count, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cardTypes,
  cards,
  fieldDefinitions,
  user,
} from "@/lib/db/schema";
import { NotFoundError } from "./errors";
import { tenantCardTypesNotArchived, onlyArchived } from "./scopes";
import { addFieldDefinition } from "./field-definitions";
import { getActionsForCardType } from "./actions";
import { getScanValidationsByCardType } from "./scan-validations";
import type {
  CardType,
  CreateCardTypeInput,
  UpdateCardTypeInput,
  CardTypeWithFields,
  CardTypeWithFullSchema,
  FieldDefinition,
  ArchivedCardTypeListItem,
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

  const [actionDefinitions, scanValidations] = await Promise.all([
    getActionsForCardType(id),
    getScanValidationsByCardType(id),
  ]);

  return { ...cardType, actionDefinitions, scanValidations };
}

/**
 * Update a card type's mutable descriptive fields (name, description).
 *
 * `status` is deliberately NOT settable here — every lifecycle transition goes
 * through `src/lib/server/lifecycle/card-types.ts`, which validates the
 * transition, keeps the trash metadata coherent and cascades to cards.
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
 * List a tenant's card types for management views.
 *
 * Excludes archived (trashed) types. `inactive` types ARE included: they are
 * operationally switched off, not deleted.
 *
 * Note: before the lifecycle migration this returned only `is_active = true`
 * rows, so deactivated types were hidden entirely. They are now visible, which
 * is the intended semantics of the three-state model. See ADR
 * 2026-07-17-card-lifecycle-archiving.md.
 *
 * @param tenantId - Tenant UUID.
 * @returns Array of non-archived card types ordered by name.
 */
export async function listCardTypes(tenantId: string): Promise<CardType[]> {
  return db
    .select()
    .from(cardTypes)
    .where(tenantCardTypesNotArchived(tenantId))
    .orderBy(asc(cardTypes.name));
}

/**
 * List a tenant's archived (trashed) card types for the "Archived" view (phase 4).
 *
 * Returns only `status = 'archived'` types, newest first, each resolved to the
 * display name of whoever archived it (LEFT join — `archived_by` is
 * `ON DELETE SET NULL`, so the actor may be gone) and to `cardCount`: how many
 * cards a hard delete of the type would cascade away. For an archived type every
 * one of its cards is archived too (individual restore is blocked while the type
 * is in the trash), so the count is simply every card of the type.
 *
 * @param tenantId - Tenant UUID (scopes the query).
 * @returns Archived card types, ordered by archive time (most recent first).
 */
export async function listArchivedCardTypes(
  tenantId: string,
): Promise<ArchivedCardTypeListItem[]> {
  const rows = await db
    .select({
      id: cardTypes.id,
      name: cardTypes.name,
      archivedAt: cardTypes.archivedAt,
      archivedByName: user.name,
    })
    .from(cardTypes)
    .leftJoin(user, eq(cardTypes.archivedBy, user.id))
    .where(and(eq(cardTypes.tenantId, tenantId), onlyArchived(cardTypes.status)))
    .orderBy(desc(cardTypes.archivedAt));

  if (rows.length === 0) return [];

  // One grouped count for the cascade size of every listed type (avoids N+1).
  const typeIds = rows.map((r) => r.id);
  const counts = await db
    .select({ cardTypeId: cards.cardTypeId, total: count() })
    .from(cards)
    .where(and(eq(cards.tenantId, tenantId), inArray(cards.cardTypeId, typeIds)))
    .groupBy(cards.cardTypeId);

  const countByType = new Map(counts.map((c) => [c.cardTypeId, c.total]));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    cardCount: countByType.get(r.id) ?? 0,
    // Non-null for archived rows, guaranteed by card_types_archive_metadata_ck.
    archivedAt: r.archivedAt as Date,
    archivedByName: r.archivedByName ?? null,
  }));
}

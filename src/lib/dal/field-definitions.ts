/**
 * Field Definitions DAL
 *
 * Management of dynamic field schemas attached to card types.
 * Field definitions are soft-deleted (is_active = false), never hard-deleted,
 * to preserve referential integrity with existing field values.
 */

import { eq, and, asc, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { fieldDefinitions, fieldValues } from "@/lib/db/schema";
import {
  NotFoundError,
  ValidationError,
  ForbiddenOperationError,
} from "./errors";
import type {
  FieldDefinition,
  CreateFieldDefinitionInput,
  UpdateFieldDefinitionInput,
} from "./types";

/**
 * Check whether a field definition already has stored field values.
 *
 * Used to enforce the rule that `field_type` cannot be changed once
 * values exist.
 *
 * @param fieldDefinitionId - The field definition UUID.
 * @returns true if at least one field_values row references this definition.
 */
export async function hasExistingValues(
  fieldDefinitionId: string,
): Promise<boolean> {
  const [result] = await db
    .select({ total: count() })
    .from(fieldValues)
    .where(eq(fieldValues.fieldDefinitionId, fieldDefinitionId))
    .limit(1);

  return (result?.total ?? 0) > 0;
}

/**
 * Get all active field definitions for a card type, ordered by position.
 *
 * @param cardTypeId - The card type UUID.
 * @returns Array of active field definitions sorted by position ascending.
 */
export async function getFieldDefinitionsByCardType(
  cardTypeId: string,
): Promise<FieldDefinition[]> {
  return db
    .select()
    .from(fieldDefinitions)
    .where(
      and(
        eq(fieldDefinitions.cardTypeId, cardTypeId),
        eq(fieldDefinitions.isActive, true),
      ),
    )
    .orderBy(asc(fieldDefinitions.position));
}

/**
 * Add a new field definition to a card type.
 *
 * If `position` is not provided, it is auto-calculated as the next
 * position after the current highest.
 *
 * @param cardTypeId - The card type to attach the field to.
 * @param data       - Field definition creation payload.
 * @returns The newly created field definition row.
 */
export async function addFieldDefinition(
  cardTypeId: string,
  data: CreateFieldDefinitionInput,
): Promise<FieldDefinition> {
  let { position } = data;

  if (position === undefined) {
    // Auto-calculate as max(position) + 1 among active fields.
    const existing = await getFieldDefinitionsByCardType(cardTypeId);
    position =
      existing.length > 0
        ? Math.max(...existing.map((fd) => fd.position)) + 1
        : 0;
  }

  const [fd] = await db
    .insert(fieldDefinitions)
    .values({
      cardTypeId,
      name: data.name,
      label: data.label,
      fieldType: data.fieldType,
      isRequired: data.isRequired ?? false,
      position,
      defaultValue: data.defaultValue ?? null,
      validationRules: data.validationRules ?? null,
    })
    .returning();

  return fd;
}

/**
 * Update mutable fields of a field definition.
 *
 * **Critical rule:** if `fieldType` is included in the update and the
 * definition already has stored field values, the operation is rejected
 * with a {@link ForbiddenOperationError}.
 *
 * @param id   - The field definition UUID.
 * @param data - Partial update payload.
 * @returns The updated field definition row.
 * @throws {NotFoundError} If the definition doesn't exist.
 * @throws {ForbiddenOperationError} If attempting to change fieldType with existing values.
 */
export async function updateFieldDefinition(
  id: string,
  data: UpdateFieldDefinitionInput,
): Promise<FieldDefinition> {
  // Fetch current state.
  const [current] = await db
    .select()
    .from(fieldDefinitions)
    .where(eq(fieldDefinitions.id, id))
    .limit(1);

  if (!current) {
    throw new NotFoundError("FieldDefinition", id);
  }

  // Enforce type immutability when values exist.
  if (data.fieldType && data.fieldType !== current.fieldType) {
    const hasValues = await hasExistingValues(id);
    if (hasValues) {
      throw new ForbiddenOperationError(
        `Cannot change field_type of definition "${current.name}" (${id}) ` +
          `from "${current.fieldType}" to "${data.fieldType}" because it ` +
          `already has stored field values. Deactivate this field and create ` +
          `a new one instead.`,
      );
    }
  }

  // Build the SET clause, omitting undefined keys.
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.label !== undefined) set.label = data.label;
  if (data.isRequired !== undefined) set.isRequired = data.isRequired;
  if (data.position !== undefined) set.position = data.position;
  if (data.defaultValue !== undefined) set.defaultValue = data.defaultValue;
  if (data.validationRules !== undefined)
    set.validationRules = data.validationRules;
  if (data.isActive !== undefined) set.isActive = data.isActive;
  if (data.fieldType !== undefined) set.fieldType = data.fieldType;

  const [updated] = await db
    .update(fieldDefinitions)
    .set(set)
    .where(eq(fieldDefinitions.id, id))
    .returning();

  return updated;
}

/**
 * Soft-delete a field definition by setting `is_active = false`.
 *
 * @param id - The field definition UUID.
 * @returns The deactivated field definition row.
 * @throws {NotFoundError} If the definition doesn't exist.
 */
export async function deactivateFieldDefinition(
  id: string,
): Promise<FieldDefinition> {
  return updateFieldDefinition(id, { isActive: false });
}

/**
 * Reorder field definitions within a card type.
 *
 * Receives an array of field definition IDs in the desired order and
 * assigns sequential positions (0, 1, 2, …) in a single transaction.
 *
 * @param cardTypeId - The card type UUID (used for validation only).
 * @param orderedIds - Array of field definition IDs in the desired order.
 * @throws {ValidationError} If any ID doesn't belong to the given card type.
 */
export async function reorderFieldDefinitions(
  cardTypeId: string,
  orderedIds: string[],
): Promise<void> {
  // Validate all IDs belong to this card type.
  const existing = await db
    .select({ id: fieldDefinitions.id })
    .from(fieldDefinitions)
    .where(
      and(
        eq(fieldDefinitions.cardTypeId, cardTypeId),
        eq(fieldDefinitions.isActive, true),
      ),
    );

  const existingIds = new Set(existing.map((r) => r.id));
  const invalid = orderedIds.filter((id) => !existingIds.has(id));
  if (invalid.length > 0) {
    throw new ValidationError(
      `Field definition IDs do not belong to card type ${cardTypeId}: ${invalid.join(", ")}`,
    );
  }

  // Update positions sequentially. neon-http doesn't support interactive
  // transactions, so we issue individual updates — the unique constraint
  // on (card_type_id, name) won't conflict since we're only changing position.
  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .update(fieldDefinitions)
        .set({ position: index, updatedAt: new Date() })
        .where(eq(fieldDefinitions.id, id)),
    ),
  );
}

/**
 * Field Values DAL
 *
 * Helpers for mapping dynamic field values to/from their typed database
 * columns, plus CRUD operations on individual field values.
 */

import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { fieldValues, fieldDefinitions } from "@/lib/db/schema";
import { NotFoundError, ValidationError } from "./errors";
import type { FieldType, FieldValue } from "./types";

// ─── Type → column mapping ─────────────────────────────────────────────────

/** Column payload shape written to the `field_values` table. */
interface TypedColumnPayload {
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueDate?: Date | null;
  valueJson?: unknown;
}

/**
 * Map a runtime value to the correct typed database column
 * based on the field definition's `fieldType`.
 *
 * @param fieldType - The field type from the definition.
 * @param value     - The runtime value to persist.
 * @returns An object with exactly one typed column set and the rest nulled.
 * @throws {ValidationError} If the value doesn't match the expected type.
 */
export function mapValueToColumn(
  fieldType: FieldType,
  value: unknown,
): TypedColumnPayload {
  // Start with all columns null to ensure clean writes.
  const base: TypedColumnPayload = {
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    valueDate: null,
    valueJson: null,
  };

  // Allow explicit null / undefined — clears the value.
  if (value === null || value === undefined) {
    return base;
  }

  switch (fieldType) {
    case "text":
    case "photo":
    case "select": {
      if (typeof value !== "string") {
        throw new ValidationError(
          `Expected string for field type "${fieldType}", got ${typeof value}`,
        );
      }
      return { ...base, valueText: value };
    }
    case "number": {
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw new ValidationError(
          `Expected number for field type "number", got ${typeof value}`,
        );
      }
      return { ...base, valueNumber: value };
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        throw new ValidationError(
          `Expected boolean for field type "boolean", got ${typeof value}`,
        );
      }
      return { ...base, valueBoolean: value };
    }
    case "date": {
      if (!(value instanceof Date) && typeof value !== "string") {
        throw new ValidationError(
          `Expected Date or ISO string for field type "date", got ${typeof value}`,
        );
      }
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new ValidationError(`Invalid date value: ${String(value)}`);
      }
      return { ...base, valueDate: date };
    }
    default: {
      // Fallback: store as JSON.
      return { ...base, valueJson: value };
    }
  }
}

/**
 * Extract the meaningful value from a field_values row based on its field type.
 *
 * @param row       - The field_values database row.
 * @param fieldType - The field type that dictates which column holds the value.
 * @returns The extracted value (string | number | boolean | Date | unknown | null).
 */
export function extractValue(row: FieldValue, fieldType: FieldType): unknown {
  switch (fieldType) {
    case "text":
    case "photo":
    case "select":
      return row.valueText;
    case "number":
      return row.valueNumber;
    case "boolean":
      return row.valueBoolean;
    case "date":
      return row.valueDate;
    default:
      return row.valueJson;
  }
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

/**
 * Set (upsert) a single field value for a card.
 *
 * Looks up the field definition to determine the correct typed column,
 * then inserts or updates the value using the unique constraint
 * `(card_id, field_definition_id)`.
 *
 * @param cardId            - The card's internal UUID.
 * @param fieldDefinitionId - The field definition UUID.
 * @param value             - The value to persist.
 * @returns The upserted field_values row.
 * @throws {NotFoundError} If the field definition doesn't exist.
 */
export async function setFieldValue(
  cardId: string,
  fieldDefinitionId: string,
  value: unknown,
): Promise<FieldValue> {
  // Fetch field definition to know the type.
  const [fd] = await db
    .select()
    .from(fieldDefinitions)
    .where(eq(fieldDefinitions.id, fieldDefinitionId))
    .limit(1);

  if (!fd) {
    throw new NotFoundError("FieldDefinition", fieldDefinitionId);
  }

  const typed = mapValueToColumn(fd.fieldType, value);

  const [result] = await db
    .insert(fieldValues)
    .values({
      cardId,
      fieldDefinitionId,
      ...typed,
    })
    .onConflictDoUpdate({
      target: [fieldValues.cardId, fieldValues.fieldDefinitionId],
      set: {
        ...typed,
        updatedAt: new Date(),
      },
    })
    .returning();

  return result;
}

/**
 * Get all field values for a card.
 *
 * @param cardId - The card's internal UUID.
 * @returns Array of field_values rows.
 */
export async function getFieldValues(cardId: string): Promise<FieldValue[]> {
  return db
    .select()
    .from(fieldValues)
    .where(eq(fieldValues.cardId, cardId));
}

/**
 * Delete all field values for a card.
 * Used internally when rebuilding a card's values in a transaction.
 *
 * @param cardId - The card's internal UUID.
 */
export async function deleteFieldValues(cardId: string): Promise<void> {
  await db.delete(fieldValues).where(eq(fieldValues.cardId, cardId));
}

/**
 * Check whether a specific field value exists for a card + definition pair.
 *
 * @param cardId            - The card's internal UUID.
 * @param fieldDefinitionId - The field definition UUID.
 * @returns true if a row exists.
 */
export async function fieldValueExists(
  cardId: string,
  fieldDefinitionId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: fieldValues.id })
    .from(fieldValues)
    .where(
      and(
        eq(fieldValues.cardId, cardId),
        eq(fieldValues.fieldDefinitionId, fieldDefinitionId),
      ),
    )
    .limit(1);

  return !!row;
}

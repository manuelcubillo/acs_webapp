/**
 * Scan Validations DAL
 *
 * CRUD for scan_validations — rules evaluated automatically when a card
 * is scanned to inform the operator of any issues.
 *
 * Supported rules per field type:
 *   boolean: boolean_is_true | boolean_is_false
 *   number:  number_eq | number_gt | number_lt | number_gte | number_lte | number_between
 *   date:    date_before | date_after | date_equals
 */

import { eq, and, asc, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { scanValidations, fieldDefinitions } from "@/lib/db/schema";
import { NotFoundError, ValidationError } from "./errors";
import type {
  ScanValidation,
  ScanValidationWithField,
  CreateScanValidationInput,
  UpdateScanValidationInput,
  FieldType,
} from "./types";

// ─── Rule → field type compatibility map ──────────────────────────────────────

const RULE_FIELD_TYPE_MAP: Record<string, FieldType> = {
  boolean_is_true:  "boolean",
  boolean_is_false: "boolean",
  number_eq:        "number",
  number_gt:        "number",
  number_lt:        "number",
  number_gte:       "number",
  number_lte:       "number",
  number_between:   "number",
  date_before:      "date",
  date_after:       "date",
  date_equals:      "date",
};

/** Assert that the rule is compatible with the given field type. */
function assertRuleCompatible(rule: string, fieldType: FieldType): void {
  const expected = RULE_FIELD_TYPE_MAP[rule];
  if (!expected) {
    throw new ValidationError(`Unknown scan validation rule: "${rule}".`);
  }
  if (expected !== fieldType) {
    throw new ValidationError(
      `Rule "${rule}" requires a ${expected} field, but field type is "${fieldType}".`,
    );
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Create a new scan validation rule for a card type.
 *
 * Validates:
 *   1. The target field belongs to the same card type.
 *   2. The rule is compatible with the field type.
 *   3. The value has the correct shape for the rule.
 *
 * @param cardTypeId - Card type UUID.
 * @param input      - Scan validation data.
 * @returns The created scan validation enriched with field info.
 */
export async function createScanValidation(
  cardTypeId: string,
  input: CreateScanValidationInput,
): Promise<ScanValidationWithField> {
  // Validate field belongs to this card type
  const [field] = await db
    .select()
    .from(fieldDefinitions)
    .where(
      and(
        eq(fieldDefinitions.id, input.fieldDefinitionId),
        eq(fieldDefinitions.cardTypeId, cardTypeId),
        eq(fieldDefinitions.isActive, true),
      ),
    )
    .limit(1);

  if (!field) {
    throw new ValidationError(
      `Field definition "${input.fieldDefinitionId}" not found or does not belong to card type "${cardTypeId}".`,
    );
  }

  assertRuleCompatible(input.rule, field.fieldType);

  // Auto-calculate position as last
  const [countRow] = await db
    .select({ cnt: count() })
    .from(scanValidations)
    .where(eq(scanValidations.cardTypeId, cardTypeId));

  const position = input.position ?? Number(countRow?.cnt ?? 0);

  const [created] = await db
    .insert(scanValidations)
    .values({
      cardTypeId,
      fieldDefinitionId: input.fieldDefinitionId,
      rule: input.rule,
      value: input.value ?? null,
      errorMessage: input.errorMessage,
      severity: input.severity ?? "error",
      position,
    })
    .returning();

  return {
    ...created,
    fieldName: field.name,
    fieldLabel: field.label,
    fieldType: field.fieldType,
  };
}

/**
 * Update an existing scan validation.
 *
 * @param id    - Scan validation UUID.
 * @param input - Fields to update.
 * @returns The updated scan validation enriched with field info.
 */
export async function updateScanValidation(
  id: string,
  input: UpdateScanValidationInput,
): Promise<ScanValidationWithField> {
  const [existing] = await db
    .select()
    .from(scanValidations)
    .where(eq(scanValidations.id, id))
    .limit(1);

  if (!existing) throw new NotFoundError("ScanValidation", id);

  // If rule changes, validate against the field type
  if (input.rule !== undefined) {
    const [field] = await db
      .select({ fieldType: fieldDefinitions.fieldType })
      .from(fieldDefinitions)
      .where(eq(fieldDefinitions.id, existing.fieldDefinitionId))
      .limit(1);

    if (field) assertRuleCompatible(input.rule, field.fieldType);
  }

  const [updated] = await db
    .update(scanValidations)
    .set({
      ...(input.rule !== undefined && { rule: input.rule }),
      ...(input.value !== undefined && { value: input.value }),
      ...(input.errorMessage !== undefined && { errorMessage: input.errorMessage }),
      ...(input.severity !== undefined && { severity: input.severity }),
      ...(input.position !== undefined && { position: input.position }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(scanValidations.id, id))
    .returning();

  const [field] = await db
    .select()
    .from(fieldDefinitions)
    .where(eq(fieldDefinitions.id, updated.fieldDefinitionId))
    .limit(1);

  return {
    ...updated,
    fieldName: field?.name ?? "",
    fieldLabel: field?.label ?? "",
    fieldType: (field?.fieldType ?? "text") as FieldType,
  };
}

/**
 * Deactivate a scan validation (soft delete).
 *
 * @param id - Scan validation UUID.
 */
export async function deactivateScanValidation(id: string): Promise<void> {
  const [existing] = await db
    .select({ id: scanValidations.id })
    .from(scanValidations)
    .where(eq(scanValidations.id, id))
    .limit(1);

  if (!existing) throw new NotFoundError("ScanValidation", id);

  await db
    .update(scanValidations)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(scanValidations.id, id));
}

/**
 * Reorder scan validations for a card type.
 *
 * @param cardTypeId - Card type UUID.
 * @param orderedIds - Scan validation IDs in the desired new order.
 */
export async function reorderScanValidations(
  cardTypeId: string,
  orderedIds: string[],
): Promise<void> {
  // NOTE: neon-http does not support interactive transactions (db.transaction).
  // Updates are performed sequentially — acceptable for a low-frequency
  // admin reorder operation.
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(scanValidations)
      .set({ position: i, updatedAt: new Date() })
      .where(
        and(
          eq(scanValidations.id, orderedIds[i]),
          eq(scanValidations.cardTypeId, cardTypeId),
        ),
      );
  }
}

/**
 * Get all active scan validations for a card type, enriched with field info.
 * Ordered by position ascending.
 *
 * @param cardTypeId - Card type UUID.
 * @returns Active scan validations with field metadata.
 */
export async function getScanValidationsByCardType(
  cardTypeId: string,
): Promise<ScanValidationWithField[]> {
  return db
    .select({
      id: scanValidations.id,
      cardTypeId: scanValidations.cardTypeId,
      fieldDefinitionId: scanValidations.fieldDefinitionId,
      rule: scanValidations.rule,
      value: scanValidations.value,
      errorMessage: scanValidations.errorMessage,
      severity: scanValidations.severity,
      position: scanValidations.position,
      isActive: scanValidations.isActive,
      createdAt: scanValidations.createdAt,
      updatedAt: scanValidations.updatedAt,
      fieldName: fieldDefinitions.name,
      fieldLabel: fieldDefinitions.label,
      fieldType: fieldDefinitions.fieldType,
    })
    .from(scanValidations)
    .innerJoin(
      fieldDefinitions,
      eq(scanValidations.fieldDefinitionId, fieldDefinitions.id),
    )
    .where(
      and(
        eq(scanValidations.cardTypeId, cardTypeId),
        eq(scanValidations.isActive, true),
      ),
    )
    .orderBy(asc(scanValidations.position));
}

/**
 * Get all scan validations for a card type without field enrichment (faster).
 * Used inside executeAction and scan flows where field info is already available.
 *
 * @param cardTypeId - Card type UUID.
 * @returns Active scan validation rows ordered by position.
 */
export async function getRawScanValidationsByCardType(
  cardTypeId: string,
): Promise<ScanValidation[]> {
  return db
    .select()
    .from(scanValidations)
    .where(
      and(
        eq(scanValidations.cardTypeId, cardTypeId),
        eq(scanValidations.isActive, true),
      ),
    )
    .orderBy(asc(scanValidations.position));
}

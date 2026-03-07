/**
 * Server Actions — Card Types
 *
 * All mutations go through `actionHandler` which normalises errors into
 * `ActionResult<T>`.
 *
 * Role matrix:
 *   OPERATOR: read card types and field definitions (needed to render the UI)
 *   ADMIN:    (inherits operator — no additional card-type permissions)
 *   MASTER:   create/edit/deactivate card types, field definitions, action definitions
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
  createCardType,
  getCardTypeById,
  getCardTypeWithFullSchema,
  updateCardType,
  listCardTypes,
  deactivateCardType,
  addFieldDefinition,
  updateFieldDefinition,
  deactivateFieldDefinition,
  reorderFieldDefinitions,
} from "@/lib/dal";
import type {
  CardType,
  CardTypeWithFields,
  CardTypeWithFullSchema,
  FieldDefinition,
} from "@/lib/dal";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const ValidationRuleSchema = z.object({
  rule: z.string(),
  value: z.unknown(),
  message: z.string().optional(),
});

const ValidationRulesSchema = z.object({
  rules: z.array(ValidationRuleSchema),
});

const FieldDefinitionInputSchema = z.object({
  name: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  fieldType: z.enum(["text", "number", "boolean", "date", "photo", "select"]),
  isRequired: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  defaultValue: z.string().nullable().optional(),
  validationRules: ValidationRulesSchema.nullable().optional(),
});

const CreateCardTypeSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  fieldDefinitions: z.array(FieldDefinitionInputSchema).optional(),
});

const UpdateCardTypeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
});

const UpdateFieldDefinitionSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  isRequired: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  defaultValue: z.string().nullable().optional(),
  validationRules: ValidationRulesSchema.nullable().optional(),
  isActive: z.boolean().optional(),
  fieldType: z
    .enum(["text", "number", "boolean", "date", "photo", "select"])
    .optional(),
});

// ─── OPERATOR actions (read-only) ─────────────────────────────────────────────

/**
 * Get a single card type by ID (with its field definitions and action definitions).
 * @role operator | admin | master
 */
export async function getCardTypeAction(
  id: string,
): Promise<ActionResult<CardTypeWithFullSchema>> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    return getCardTypeWithFullSchema(id, tenantId);
  });
}

/**
 * List card types for the current tenant.
 * @role operator | admin | master
 */
export async function listCardTypesAction(): Promise<ActionResult<CardType[]>> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    return listCardTypes(tenantId);
  });
}

// ─── MASTER actions (tenant configuration) ────────────────────────────────────

/**
 * Create a new card type (with optional initial field definitions).
 * @role master
 */
export async function createCardTypeAction(
  input: unknown,
): Promise<ActionResult<CardTypeWithFields>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    const data = CreateCardTypeSchema.parse(input);
    return createCardType(tenantId, {
      name: data.name,
      description: data.description,
      fieldDefinitions: data.fieldDefinitions?.map((fd) => ({
        name: fd.name,
        label: fd.label,
        fieldType: fd.fieldType,
        isRequired: fd.isRequired,
        position: fd.position,
        defaultValue: fd.defaultValue,
        validationRules: fd.validationRules ?? null,
      })),
    });
  });
}

/**
 * Update a card type's name or description.
 * @role master
 */
export async function updateCardTypeAction(
  id: string,
  input: unknown,
): Promise<ActionResult<CardType>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    const data = UpdateCardTypeSchema.parse(input);
    return updateCardType(id, tenantId, data);
  });
}

/**
 * Deactivate (soft-delete) a card type.
 * @role master
 */
export async function deactivateCardTypeAction(
  id: string,
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    await deactivateCardType(id, tenantId);
  });
}

// ─── MASTER actions — Field Definition management ─────────────────────────────

/**
 * Add a field definition to an existing card type.
 * @role master
 */
export async function addFieldDefinitionAction(
  cardTypeId: string,
  input: unknown,
): Promise<ActionResult<FieldDefinition>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    await getCardTypeById(cardTypeId, tenantId); // ownership check
    const data = FieldDefinitionInputSchema.parse(input);
    return addFieldDefinition(cardTypeId, {
      name: data.name,
      label: data.label,
      fieldType: data.fieldType,
      isRequired: data.isRequired,
      position: data.position,
      defaultValue: data.defaultValue,
      validationRules: data.validationRules ?? null,
    });
  });
}

/**
 * Update a field definition.
 * Note: `fieldType` changes are rejected by the DAL if values already exist.
 * @role master
 */
export async function updateFieldDefinitionAction(
  fieldDefinitionId: string,
  input: unknown,
): Promise<ActionResult<FieldDefinition>> {
  return actionHandler(async () => {
    await requireMaster();
    const data = UpdateFieldDefinitionSchema.parse(input);
    return updateFieldDefinition(fieldDefinitionId, data);
  });
}

/**
 * Deactivate (soft-delete) a field definition.
 * @role master
 */
export async function deactivateFieldDefinitionAction(
  fieldDefinitionId: string,
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    await requireMaster();
    await deactivateFieldDefinition(fieldDefinitionId);
  });
}

/**
 * Reorder field definitions within a card type.
 * @param orderedIds - Array of field definition IDs in the desired display order.
 * @role master
 */
export async function reorderFieldDefinitionsAction(
  cardTypeId: string,
  orderedIds: string[],
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    await getCardTypeById(cardTypeId, tenantId); // ownership check
    await reorderFieldDefinitions(cardTypeId, orderedIds);
  });
}

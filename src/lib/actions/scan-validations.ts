/**
 * Server Actions — Scan Validations
 *
 * CRUD for scan_validations — rules evaluated automatically when a card
 * is scanned to inform the operator of any field issues.
 *
 * Role matrix:
 *   OPERATOR: read scan validations
 *   MASTER:   above + create / update / deactivate / reorder
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
  createScanValidation,
  updateScanValidation,
  deactivateScanValidation,
  reorderScanValidations,
  getScanValidationsByCardType,
} from "@/lib/dal";
import type { ScanValidationWithField } from "@/lib/dal";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const SeveritySchema = z.enum(["error", "warning"]);

const CreateScanValidationSchema = z.object({
  fieldDefinitionId: z.string().uuid(),
  rule: z.string().min(1).max(100),
  /** Rule-specific config (JSONB). Shape depends on rule:
   *  boolean_*   : null
   *  number_eq/gt/lt/gte/lte : { target: number }
   *  number_between          : { min: number, max: number }
   *  date_before/after/equals: { target: string } | { relative: "today" }
   */
  value: z.unknown().optional(),
  errorMessage: z.string().min(1).max(500),
  severity: SeveritySchema.optional(),
  position: z.number().int().min(0).optional(),
});

const UpdateScanValidationSchema = z.object({
  rule: z.string().min(1).max(100).optional(),
  value: z.unknown().optional(),
  errorMessage: z.string().min(1).max(500).optional(),
  severity: SeveritySchema.optional(),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const ReorderScanValidationsSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

// ─── OPERATOR actions (read-only) ─────────────────────────────────────────────

/**
 * Get all active scan validations for a card type (with field info).
 * @role operator | admin | master
 */
export async function getScanValidationsByCardTypeAction(
  cardTypeId: string,
): Promise<ActionResult<ScanValidationWithField[]>> {
  return actionHandler(async () => {
    await requireOperator();
    return getScanValidationsByCardType(cardTypeId);
  });
}

// ─── MASTER actions — management ──────────────────────────────────────────────

/**
 * Create a scan validation rule for a card type.
 * @role master
 */
export async function createScanValidationAction(
  cardTypeId: string,
  input: unknown,
): Promise<ActionResult<ScanValidationWithField>> {
  return actionHandler(async () => {
    await requireMaster();
    const data = CreateScanValidationSchema.parse(input);
    return createScanValidation(cardTypeId, {
      fieldDefinitionId: data.fieldDefinitionId,
      rule: data.rule,
      value: data.value,
      errorMessage: data.errorMessage,
      severity: data.severity,
      position: data.position,
    });
  });
}

/**
 * Update an existing scan validation.
 * @role master
 */
export async function updateScanValidationAction(
  id: string,
  input: unknown,
): Promise<ActionResult<ScanValidationWithField>> {
  return actionHandler(async () => {
    await requireMaster();
    const data = UpdateScanValidationSchema.parse(input);
    return updateScanValidation(id, data);
  });
}

/**
 * Deactivate (soft-delete) a scan validation.
 * @role master
 */
export async function deactivateScanValidationAction(
  id: string,
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    await requireMaster();
    await deactivateScanValidation(id);
  });
}

/**
 * Reorder scan validations for a card type.
 * @role master
 */
export async function reorderScanValidationsAction(
  cardTypeId: string,
  input: unknown,
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    await requireMaster();
    const { orderedIds } = ReorderScanValidationsSchema.parse(input);
    await reorderScanValidations(cardTypeId, orderedIds);
  });
}

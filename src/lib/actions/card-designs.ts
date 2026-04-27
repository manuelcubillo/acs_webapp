/**
 * Server Actions — Card Designs
 *
 * All mutations are master-only and wrapped by actionHandler.
 * Zod validates at the boundary before calling the DAL.
 */

"use server";

import { z } from "zod";
import {
  actionHandler,
  requireMaster,
  requireOperator,
  type ActionResult,
} from "@/lib/api";
import {
  listCardDesigns,
  listDesignsForCardType,
  getCardDesignById,
  createCardDesign,
  updateCardDesign,
  archiveCardDesign,
  duplicateCardDesign,
  linkDesignToCardType,
  unlinkDesignFromCardType,
  validateDesignAgainstCardType,
} from "@/lib/dal";
import type {
  CardDesign,
  CardTypeDesign,
  ListCardDesignsOptions,
  CardDesignValidationResult,
} from "@/lib/dal";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const CreateCardDesignSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  kind: z.enum(["card", "passbook"]),
  widthUnits: z.number().positive(),
  heightUnits: z.number().positive(),
  unit: z.enum(["mm", "px"]),
});

const UpdateCardDesignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  widthUnits: z.number().positive().optional(),
  heightUnits: z.number().positive().optional(),
  unit: z.enum(["mm", "px"]).optional(),
  /** Loosely validated here; structural validation runs in validateDesignAgainstCardType. */
  layout: z.record(z.string(), z.unknown()).optional(),
});

const DuplicateCardDesignSchema = z.object({
  newName: z.string().min(1).max(200),
});

const ListCardDesignsSchema = z.object({
  kind: z.enum(["card", "passbook"]).optional(),
});

// ─── Read actions ────────────────────────────────────────────────────────────

/**
 * List active card designs linked to a card type.
 * @role operator (read-only, all roles can view)
 */
export async function listDesignsForCardTypeAction(
  cardTypeId: string,
): Promise<ActionResult<CardDesign[]>> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    return listDesignsForCardType(tenantId, cardTypeId);
  });
}

/**
 * List active card designs for the current tenant.
 * @role master
 */
export async function listCardDesignsAction(
  opts?: ListCardDesignsOptions,
): Promise<ActionResult<CardDesign[]>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    const parsed = opts ? ListCardDesignsSchema.parse(opts) : {};
    return listCardDesigns(tenantId, parsed);
  });
}

/**
 * Get a single card design by ID.
 * @role master
 */
export async function getCardDesignAction(
  id: string,
): Promise<ActionResult<CardDesign>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    return getCardDesignById(tenantId, id);
  });
}

// ─── Write actions ────────────────────────────────────────────────────────────

/**
 * Create a new card design.
 * @role master
 */
export async function createCardDesignAction(
  input: unknown,
): Promise<ActionResult<CardDesign>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    const data = CreateCardDesignSchema.parse(input);
    return createCardDesign(tenantId, {
      name: data.name,
      description: data.description,
      kind: data.kind,
      widthUnits: data.widthUnits,
      heightUnits: data.heightUnits,
      unit: data.unit,
    });
  });
}

/**
 * Update a card design's metadata and/or layout.
 * @role master
 */
export async function updateCardDesignAction(
  id: string,
  input: unknown,
): Promise<ActionResult<CardDesign>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    const data = UpdateCardDesignSchema.parse(input);
    return updateCardDesign(tenantId, id, data);
  });
}

/**
 * Archive (soft-delete) a card design and remove all its card type links.
 * @role master
 */
export async function archiveCardDesignAction(
  id: string,
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    await archiveCardDesign(tenantId, id);
  });
}

/**
 * Duplicate a card design under a new name. Card type links are NOT copied.
 * @role master
 */
export async function duplicateCardDesignAction(
  id: string,
  input: unknown,
): Promise<ActionResult<CardDesign>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    const { newName } = DuplicateCardDesignSchema.parse(input);
    return duplicateCardDesign(tenantId, id, newName);
  });
}

// ─── Linking actions ──────────────────────────────────────────────────────────

/**
 * Link a card design to a card type.
 * Rejects if the card type already has a design of the same kind.
 * @role master
 */
export async function linkDesignToCardTypeAction(
  cardDesignId: string,
  cardTypeId: string,
): Promise<ActionResult<CardTypeDesign>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    return linkDesignToCardType(tenantId, cardDesignId, cardTypeId);
  });
}

/**
 * Unlink a card design from a card type (hard-delete the join row).
 * @role master
 */
export async function unlinkDesignFromCardTypeAction(
  cardDesignId: string,
  cardTypeId: string,
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    await unlinkDesignFromCardType(tenantId, cardDesignId, cardTypeId);
  });
}

// ─── Validation action ────────────────────────────────────────────────────────

/**
 * Validate that every field-bound node in the design resolves against the
 * target card type's active field definitions.
 * @role master
 */
export async function validateDesignAgainstCardTypeAction(
  designId: string,
  cardTypeId: string,
): Promise<ActionResult<CardDesignValidationResult>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    return validateDesignAgainstCardType(tenantId, designId, cardTypeId);
  });
}

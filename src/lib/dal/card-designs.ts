/**
 * Card Designs DAL
 *
 * CRUD and linking operations for visual card design templates.
 * A design holds a serialized Konva layout (CardDesignLayout) and can be
 * linked to one or more card types. Each card type may have at most one
 * active design per kind (card | passbook).
 *
 * Hard-delete semantics for card_type_designs links (see ADR 2026-04-26-card-design-konva.md).
 * Soft-delete for card_designs themselves (isActive = false).
 */

import { eq, and, asc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { cardDesigns, cardTypeDesigns, fieldDefinitions } from "@/lib/db/schema";
import { NotFoundError, ValidationError } from "./errors";
import { getCardTypeById } from "./card-types";
import type {
  CardDesign,
  CardTypeDesign,
  CardTypeWithFields,
  CreateCardDesignInput,
  UpdateCardDesignInput,
  ListCardDesignsOptions,
  CardDesignValidationResult,
} from "./types";
import type { CardDesignLayout, LayoutNode } from "@/lib/card-designs/types";
import { isBindableNode } from "@/lib/card-designs/types";

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * List active card designs for a tenant.
 *
 * @param tenantId - Tenant UUID.
 * @param opts     - Optional filter by kind.
 */
export async function listCardDesigns(
  tenantId: string,
  opts?: ListCardDesignsOptions,
): Promise<CardDesign[]> {
  const conditions = [
    eq(cardDesigns.tenantId, tenantId),
    eq(cardDesigns.isActive, true),
  ];

  if (opts?.kind) {
    conditions.push(eq(cardDesigns.kind, opts.kind));
  }

  return db
    .select()
    .from(cardDesigns)
    .where(and(...conditions))
    .orderBy(asc(cardDesigns.name));
}

/**
 * Get a single active card design by ID.
 *
 * @throws {NotFoundError} If not found or belongs to a different tenant.
 */
export async function getCardDesignById(
  tenantId: string,
  id: string,
): Promise<CardDesign> {
  const [row] = await db
    .select()
    .from(cardDesigns)
    .where(
      and(
        eq(cardDesigns.id, id),
        eq(cardDesigns.tenantId, tenantId),
        eq(cardDesigns.isActive, true),
      ),
    )
    .limit(1);

  if (!row) throw new NotFoundError("CardDesign", id);
  return row;
}

/**
 * List all designs linked to a specific card type.
 * Used by the card detail page to resolve the export design.
 */
export async function listDesignsForCardType(
  tenantId: string,
  cardTypeId: string,
): Promise<CardDesign[]> {
  const links = await db
    .select({ designId: cardTypeDesigns.cardDesignId })
    .from(cardTypeDesigns)
    .where(
      and(
        eq(cardTypeDesigns.tenantId, tenantId),
        eq(cardTypeDesigns.cardTypeId, cardTypeId),
      ),
    );

  if (!links.length) return [];

  return db
    .select()
    .from(cardDesigns)
    .where(
      and(
        eq(cardDesigns.tenantId, tenantId),
        eq(cardDesigns.isActive, true),
        inArray(
          cardDesigns.id,
          links.map((l) => l.designId),
        ),
      ),
    )
    .orderBy(asc(cardDesigns.kind));
}

/**
 * List all card type links for a given design.
 */
export async function listLinksForDesign(
  tenantId: string,
  designId: string,
): Promise<CardTypeDesign[]> {
  return db
    .select()
    .from(cardTypeDesigns)
    .where(
      and(
        eq(cardTypeDesigns.tenantId, tenantId),
        eq(cardTypeDesigns.cardDesignId, designId),
      ),
    );
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Create a new card design.
 * The layout starts empty; use updateCardDesign to persist editor changes.
 */
export async function createCardDesign(
  tenantId: string,
  input: CreateCardDesignInput,
): Promise<CardDesign> {
  const [row] = await db
    .insert(cardDesigns)
    .values({
      tenantId,
      name: input.name,
      description: input.description ?? null,
      kind: input.kind,
      widthUnits: input.widthUnits,
      heightUnits: input.heightUnits,
      unit: input.unit,
      layout: {},
    })
    .returning();

  return row;
}

/**
 * Update mutable fields of a card design, including the serialized layout.
 *
 * @throws {NotFoundError} If not found within tenant.
 */
export async function updateCardDesign(
  tenantId: string,
  id: string,
  input: UpdateCardDesignInput,
): Promise<CardDesign> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) set.name = input.name;
  if (input.description !== undefined) set.description = input.description;
  if (input.widthUnits !== undefined) set.widthUnits = input.widthUnits;
  if (input.heightUnits !== undefined) set.heightUnits = input.heightUnits;
  if (input.unit !== undefined) set.unit = input.unit;
  if (input.layout !== undefined) set.layout = input.layout;

  const [updated] = await db
    .update(cardDesigns)
    .set(set)
    .where(
      and(
        eq(cardDesigns.id, id),
        eq(cardDesigns.tenantId, tenantId),
        eq(cardDesigns.isActive, true),
      ),
    )
    .returning();

  if (!updated) throw new NotFoundError("CardDesign", id);
  return updated;
}

/**
 * Soft-delete a card design and hard-delete all its card type links.
 *
 * @throws {NotFoundError} If not found within tenant.
 */
export async function archiveCardDesign(
  tenantId: string,
  id: string,
): Promise<CardDesign> {
  // Verify ownership before deleting links
  await getCardDesignById(tenantId, id);

  // Hard-delete all links for this design (see ADR)
  await db
    .delete(cardTypeDesigns)
    .where(eq(cardTypeDesigns.cardDesignId, id));

  const [archived] = await db
    .update(cardDesigns)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(eq(cardDesigns.id, id), eq(cardDesigns.tenantId, tenantId)),
    )
    .returning();

  if (!archived) throw new NotFoundError("CardDesign", id);
  return archived;
}

/**
 * Duplicate a card design with a new name.
 * The copy does NOT inherit card type links — start fresh.
 *
 * @throws {NotFoundError} If the source design is not found.
 */
export async function duplicateCardDesign(
  tenantId: string,
  id: string,
  newName: string,
): Promise<CardDesign> {
  const original = await getCardDesignById(tenantId, id);

  const [copy] = await db
    .insert(cardDesigns)
    .values({
      tenantId,
      name: newName,
      description: original.description,
      kind: original.kind,
      widthUnits: original.widthUnits,
      heightUnits: original.heightUnits,
      unit: original.unit,
      layout: original.layout ?? {},
    })
    .returning();

  return copy;
}

// ─── Linking ──────────────────────────────────────────────────────────────────

/**
 * Link a card design to a card type.
 *
 * Enforces: a card type may have at most one design of each kind.
 *
 * @throws {NotFoundError}   If the design is not found within tenant.
 * @throws {ValidationError} If the card type already has a design of this kind.
 */
export async function linkDesignToCardType(
  tenantId: string,
  cardDesignId: string,
  cardTypeId: string,
): Promise<CardTypeDesign> {
  const design = await getCardDesignById(tenantId, cardDesignId);

  const [existing] = await db
    .select()
    .from(cardTypeDesigns)
    .where(
      and(
        eq(cardTypeDesigns.cardTypeId, cardTypeId),
        eq(cardTypeDesigns.kind, design.kind),
      ),
    )
    .limit(1);

  if (existing) {
    throw new ValidationError(
      `Card type already has a ${design.kind} design linked (design ID: ${existing.cardDesignId}). Unlink it first.`,
    );
  }

  const [link] = await db
    .insert(cardTypeDesigns)
    .values({ tenantId, cardTypeId, cardDesignId, kind: design.kind })
    .returning();

  return link;
}

/**
 * Unlink a card design from a card type (hard-delete the join row).
 * No-op if the link does not exist.
 */
export async function unlinkDesignFromCardType(
  tenantId: string,
  cardDesignId: string,
  cardTypeId: string,
): Promise<void> {
  await db
    .delete(cardTypeDesigns)
    .where(
      and(
        eq(cardTypeDesigns.tenantId, tenantId),
        eq(cardTypeDesigns.cardDesignId, cardDesignId),
        eq(cardTypeDesigns.cardTypeId, cardTypeId),
      ),
    );
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate that every field-bound node in the design references a field that
 * exists on the target card type and has a compatible field type.
 *
 * Compatibility rules:
 *   text node     → field types: text, number, date, boolean, select
 *   image node    → field types: photo
 *   qr node       → field types: text, number, select
 *   barcode128    → field types: text, number, select
 *
 * @returns { ok, missingFieldBindings } — IDs of fields that are missing or incompatible.
 */
export async function validateDesignAgainstCardType(
  tenantId: string,
  designId: string,
  cardTypeId: string,
): Promise<CardDesignValidationResult> {
  const [design, fields] = await Promise.all([
    getCardDesignById(tenantId, designId),
    db
      .select({ id: fieldDefinitions.id, fieldType: fieldDefinitions.fieldType })
      .from(fieldDefinitions)
      .where(
        and(
          eq(fieldDefinitions.cardTypeId, cardTypeId),
          eq(fieldDefinitions.isActive, true),
        ),
      ),
  ]);

  const layout = design.layout as unknown as CardDesignLayout | null;
  if (!layout?.nodes?.length) return { ok: true, missingFieldBindings: [] };

  const fieldMap = new Map(fields.map((f) => [f.id, f.fieldType]));
  const missingFieldBindings: string[] = [];

  for (const node of layout.nodes as LayoutNode[]) {
    if (!isBindableNode(node)) continue;

    const { content } = node;
    if (content.source !== "field") continue;

    const fieldId = "fieldDefinitionId" in content ? content.fieldDefinitionId : undefined;
    if (!fieldId) continue;

    const fieldType = fieldMap.get(fieldId);
    if (!fieldType) {
      missingFieldBindings.push(fieldId);
      continue;
    }

    if (!isFieldCompatibleWithNodeType(node.type, fieldType)) {
      missingFieldBindings.push(fieldId);
    }
  }

  return { ok: missingFieldBindings.length === 0, missingFieldBindings };
}

/**
 * List card types (with their active field definitions) linked to a design.
 * Used by the editor server loader to provide field binding context.
 */
export async function listCardTypesForDesign(
  tenantId: string,
  designId: string,
): Promise<CardTypeWithFields[]> {
  const links = await listLinksForDesign(tenantId, designId);
  if (!links.length) return [];

  const results = await Promise.all(
    links.map((l) => getCardTypeById(l.cardTypeId, tenantId).catch(() => null)),
  );
  return results.filter((ct): ct is CardTypeWithFields => ct !== null);
}

/**
 * Returns a map of { designId → linked card-type count } for all designs of a
 * tenant. Used by the list page to show the count on each design tile without
 * N+1 queries.
 */
export async function getDesignLinkCounts(
  tenantId: string,
): Promise<Record<string, number>> {
  const links = await db
    .select({ designId: cardTypeDesigns.cardDesignId })
    .from(cardTypeDesigns)
    .where(eq(cardTypeDesigns.tenantId, tenantId));

  const counts: Record<string, number> = {};
  for (const link of links) {
    counts[link.designId] = (counts[link.designId] ?? 0) + 1;
  }
  return counts;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function isFieldCompatibleWithNodeType(
  nodeType: "text" | "image" | "qr" | "barcode128",
  fieldType: string,
): boolean {
  switch (nodeType) {
    case "text":
      return ["text", "number", "date", "boolean", "select"].includes(fieldType);
    case "image":
      return fieldType === "photo";
    case "qr":
    case "barcode128":
      return ["text", "number", "select"].includes(fieldType);
  }
}

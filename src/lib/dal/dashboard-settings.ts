/**
 * Dashboard Settings DAL
 *
 * Per-tenant operational dashboard configuration.
 * One row per tenant (upserted on save — never inserted twice).
 *
 * Also manages card_type_summary_fields: the fields displayed inline on
 * each activity feed entry for quick card identification.
 */

import { eq, and, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  dashboardSettings,
  cardTypeSummaryFields,
  fieldDefinitions,
} from "@/lib/db/schema";
import type {
  DashboardSettings,
  CardTypeSummaryField,
  UpsertDashboardSettingsInput,
  SetCardTypeSummaryFieldsInput,
} from "./types";

// ─── Dashboard Settings ───────────────────────────────────────────────────────

/**
 * Get dashboard settings for a tenant.
 * Returns null if no settings row exists yet (caller should use defaults).
 *
 * @param tenantId - Tenant UUID.
 */
export async function getDashboardSettings(
  tenantId: string,
): Promise<DashboardSettings | null> {
  const [row] = await db
    .select()
    .from(dashboardSettings)
    .where(eq(dashboardSettings.tenantId, tenantId))
    .limit(1);

  return row ?? null;
}

/**
 * Upsert dashboard settings for a tenant.
 * Creates the row if it doesn't exist; merges supplied fields otherwise.
 *
 * @param tenantId - Tenant UUID.
 * @param input    - Settings fields to set.
 * @returns The resulting (created or updated) settings row.
 */
export async function upsertDashboardSettings(
  tenantId: string,
  input: UpsertDashboardSettingsInput,
): Promise<DashboardSettings> {
  const now = new Date();

  const [row] = await db
    .insert(dashboardSettings)
    .values({
      tenantId,
      feedLimit: input.feedLimit ?? 20,
      showScanEntries: input.showScanEntries ?? true,
      showActionEntries: input.showActionEntries ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [dashboardSettings.tenantId],
      set: {
        ...(input.feedLimit !== undefined && { feedLimit: input.feedLimit }),
        ...(input.showScanEntries !== undefined && { showScanEntries: input.showScanEntries }),
        ...(input.showActionEntries !== undefined && { showActionEntries: input.showActionEntries }),
        updatedAt: now,
      },
    })
    .returning();

  return row;
}

// ─── Card Type Summary Fields ─────────────────────────────────────────────────

/**
 * Get the configured summary fields for a card type, ordered by position.
 *
 * @param cardTypeId - Card type UUID.
 * @returns Ordered list of summary field rows.
 */
export async function getSummaryFieldsForCardType(
  cardTypeId: string,
): Promise<CardTypeSummaryField[]> {
  return db
    .select()
    .from(cardTypeSummaryFields)
    .where(eq(cardTypeSummaryFields.cardTypeId, cardTypeId))
    .orderBy(asc(cardTypeSummaryFields.position));
}

/**
 * Get summary fields for multiple card types in a single query.
 * Returns a map keyed by cardTypeId for efficient lookup.
 *
 * @param cardTypeIds - Array of card type UUIDs.
 * @param tenantId    - Tenant UUID (for security scoping).
 * @returns Map of cardTypeId → sorted summary field rows.
 */
export async function getSummaryFieldsForCardTypes(
  cardTypeIds: string[],
  tenantId: string,
): Promise<Map<string, CardTypeSummaryField[]>> {
  if (cardTypeIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(cardTypeSummaryFields)
    .where(
      and(
        eq(cardTypeSummaryFields.tenantId, tenantId),
      ),
    )
    .orderBy(asc(cardTypeSummaryFields.cardTypeId), asc(cardTypeSummaryFields.position));

  const map = new Map<string, CardTypeSummaryField[]>();
  for (const row of rows) {
    if (!cardTypeIds.includes(row.cardTypeId)) continue;
    const existing = map.get(row.cardTypeId) ?? [];
    existing.push(row);
    map.set(row.cardTypeId, existing);
  }
  return map;
}

/**
 * Replace the summary fields for a card type with a new ordered list.
 * Deletes all existing rows for the card type, then inserts the new ones.
 *
 * @param cardTypeId - Card type UUID.
 * @param tenantId   - Tenant UUID.
 * @param input      - New ordered list of field definition IDs.
 * @returns The newly created summary field rows.
 */
export async function setCardTypeSummaryFields(
  cardTypeId: string,
  tenantId: string,
  input: SetCardTypeSummaryFieldsInput,
): Promise<CardTypeSummaryField[]> {
  // Validate that all specified fields belong to this card type and are active.
  if (input.fieldDefinitionIds.length > 0) {
    const fields = await db
      .select({ id: fieldDefinitions.id })
      .from(fieldDefinitions)
      .where(
        and(
          eq(fieldDefinitions.cardTypeId, cardTypeId),
          eq(fieldDefinitions.isActive, true),
        ),
      );

    const validIds = new Set(fields.map((f) => f.id));
    for (const fid of input.fieldDefinitionIds) {
      if (!validIds.has(fid)) {
        throw new Error(
          `Field definition "${fid}" does not belong to card type "${cardTypeId}" or is inactive.`,
        );
      }
    }
  }

  return db.transaction(async (tx) => {
    // Delete existing summary fields for this card type.
    await tx
      .delete(cardTypeSummaryFields)
      .where(eq(cardTypeSummaryFields.cardTypeId, cardTypeId));

    if (input.fieldDefinitionIds.length === 0) return [];

    // Insert new ones in order.
    const rows = await tx
      .insert(cardTypeSummaryFields)
      .values(
        input.fieldDefinitionIds.map((fid, idx) => ({
          tenantId,
          cardTypeId,
          fieldDefinitionId: fid,
          position: idx,
        })),
      )
      .returning();

    return rows;
  });
}

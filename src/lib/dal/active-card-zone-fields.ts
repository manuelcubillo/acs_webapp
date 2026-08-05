/**
 * Active Card Zone Fields DAL
 *
 * Per-card-type layout of the "last scanned card" panel (ActiveCardZone) on the
 * operator dashboard: which field goes in which cell of a 3×3 grid, and whether
 * a photo cell spans two rows.
 *
 * Kept apart from `dashboard-settings.ts` on purpose. That module owns the
 * ACTIVITY FEED's configuration (`card_type_summary_fields`), which is a
 * different surface with a different density budget — a compact inline strip of
 * up to 3 values per row. Nothing here reads or writes that table, which is what
 * makes "the feed is unchanged" verifiable rather than merely intended.
 * See ADR 2026-08-04-active-card-summary-grid.md.
 *
 * Grid model — cells are indexed 0..8:
 *   row = floor(position / 3)   col = position % 3
 * A `photo` field with rowSpan 2 occupies its cell AND the cell at
 * `position + 3`. Geometry lives in `@/lib/dashboard/active-zone-layout` and is
 * validated at the Server Action boundary, which is where field types are
 * resolved; this layer trusts what it is given and relies on the table's
 * CHECK / UNIQUE constraints as the last line of defence.
 */

import { eq, and, asc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { cardTypeActiveZoneFields, fieldDefinitions } from "@/lib/db/schema";
import type {
  CardTypeActiveZoneField,
  ActiveZoneFieldConfig,
  SetCardTypeActiveZoneFieldsInput,
} from "./types";

/**
 * Get the raw grid rows configured for a card type, ordered by cell position.
 *
 * @param cardTypeId - Card type UUID.
 * @param tenantId   - Tenant UUID (security scoping).
 * @returns Grid rows ordered by position. Empty when the card type is
 *          unconfigured — the panel then falls back to its legacy behaviour.
 */
export async function getActiveZoneFieldsForCardType(
  cardTypeId: string,
  tenantId: string,
): Promise<CardTypeActiveZoneField[]> {
  return db
    .select()
    .from(cardTypeActiveZoneFields)
    .where(
      and(
        eq(cardTypeActiveZoneFields.cardTypeId, cardTypeId),
        eq(cardTypeActiveZoneFields.tenantId, tenantId),
      ),
    )
    .orderBy(asc(cardTypeActiveZoneFields.position));
}

/**
 * Get the grid rows for several card types in one query.
 * Used by the settings page to hydrate every card type's editor at once.
 *
 * @param cardTypeIds - Card type UUIDs to fetch.
 * @param tenantId    - Tenant UUID (security scoping).
 * @returns Map of cardTypeId → rows ordered by position. Card types with no
 *          configuration are absent from the map.
 */
export async function getActiveZoneFieldsForCardTypes(
  cardTypeIds: string[],
  tenantId: string,
): Promise<Map<string, CardTypeActiveZoneField[]>> {
  if (cardTypeIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(cardTypeActiveZoneFields)
    .where(
      and(
        eq(cardTypeActiveZoneFields.tenantId, tenantId),
        inArray(cardTypeActiveZoneFields.cardTypeId, cardTypeIds),
      ),
    )
    .orderBy(asc(cardTypeActiveZoneFields.position));

  const map = new Map<string, CardTypeActiveZoneField[]>();
  for (const row of rows) {
    const existing = map.get(row.cardTypeId) ?? [];
    existing.push(row);
    map.set(row.cardTypeId, existing);
  }
  return map;
}

/**
 * The panel layout for every card type of a tenant, joined to the field
 * definitions so each cell carries its label and type.
 *
 * Shipped to the dashboard client at page load, exactly like the feed's
 * `getFeedSummaryFieldConfig`: the scan already returns the card's values, so
 * only the static selection — which field, which cell, how tall — has to travel
 * ahead of time.
 *
 * Unlike the feed's config, `photo` fields are INCLUDED. Rendering a photo is
 * the whole point of the two-row cell; the panel resolves photo values to
 * signed URLs via `signCardPhotos` on the scan path, so it never sees an object
 * key the way a feed row would.
 *
 * Inactive field definitions are excluded — deactivating a field removes it from
 * the panel without needing a config migration. The stored row is left alone so
 * that reactivating the field restores its cell.
 *
 * @param tenantId - Tenant UUID.
 * @returns Map of cardTypeId → cells ordered by position.
 */
export async function getActiveZoneFieldConfig(
  tenantId: string,
): Promise<Map<string, ActiveZoneFieldConfig[]>> {
  const rows = await db
    .select({
      cardTypeId: cardTypeActiveZoneFields.cardTypeId,
      fieldDefinitionId: cardTypeActiveZoneFields.fieldDefinitionId,
      label: fieldDefinitions.label,
      fieldType: fieldDefinitions.fieldType,
      position: cardTypeActiveZoneFields.position,
      rowSpan: cardTypeActiveZoneFields.rowSpan,
    })
    .from(cardTypeActiveZoneFields)
    .innerJoin(
      fieldDefinitions,
      eq(cardTypeActiveZoneFields.fieldDefinitionId, fieldDefinitions.id),
    )
    .where(
      and(
        eq(cardTypeActiveZoneFields.tenantId, tenantId),
        eq(fieldDefinitions.isActive, true),
      ),
    )
    .orderBy(asc(cardTypeActiveZoneFields.position));

  const map = new Map<string, ActiveZoneFieldConfig[]>();
  for (const row of rows) {
    const existing = map.get(row.cardTypeId) ?? [];
    existing.push({
      fieldDefinitionId: row.fieldDefinitionId,
      label: row.label,
      fieldType: row.fieldType,
      position: row.position,
      rowSpan: row.rowSpan,
    });
    map.set(row.cardTypeId, existing);
  }
  return map;
}

/**
 * Replace a card type's grid layout wholesale.
 *
 * Delete-then-insert rather than a per-cell diff: the layout is a small, atomic
 * arrangement, and a partial update could momentarily violate the
 * `(card_type_id, position)` unique constraint while cells swap places.
 *
 * This is configuration, not domain data — the soft-delete rule protects
 * `field_definitions` and the rows that reference them, none of which are
 * touched here. Removing a cell removes a display preference, nothing else.
 *
 * @param cardTypeId - Card type UUID.
 * @param tenantId   - Tenant UUID.
 * @param input      - The full replacement layout. Empty clears the grid.
 * @returns The newly created rows.
 * @throws {Error} If any field does not belong to the card type or is inactive.
 */
export async function setCardTypeActiveZoneFields(
  cardTypeId: string,
  tenantId: string,
  input: SetCardTypeActiveZoneFieldsInput,
): Promise<CardTypeActiveZoneField[]> {
  // Every referenced field must be an active field OF THIS CARD TYPE. Without
  // this check a caller could pin another tenant's field into the grid, and the
  // FK alone would not catch it.
  if (input.cells.length > 0) {
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
    for (const cell of input.cells) {
      if (!validIds.has(cell.fieldDefinitionId)) {
        throw new Error(
          `Field definition "${cell.fieldDefinitionId}" does not belong to card type "${cardTypeId}" or is inactive.`,
        );
      }
    }
  }

  // NOTE: neon-http has no interactive transactions (see setCardTypeSummaryFields).
  // The delete + insert is therefore not atomic. Acceptable for a master-only,
  // low-frequency settings write; the worst case is a briefly empty grid, which
  // renders as the legacy fallback rather than as an error.
  await db
    .delete(cardTypeActiveZoneFields)
    .where(
      and(
        eq(cardTypeActiveZoneFields.cardTypeId, cardTypeId),
        eq(cardTypeActiveZoneFields.tenantId, tenantId),
      ),
    );

  if (input.cells.length === 0) return [];

  return db
    .insert(cardTypeActiveZoneFields)
    .values(
      input.cells.map((cell) => ({
        tenantId,
        cardTypeId,
        fieldDefinitionId: cell.fieldDefinitionId,
        position: cell.position,
        rowSpan: cell.rowSpan,
      })),
    )
    .returning();
}

/**
 * Common Fields DAL
 *
 * Computes the "common" field definitions across one or more card types.
 * A field is "common" when it appears with the same name + fieldType in
 * ALL selected card types.
 *
 * Used by FieldFilterBuilder when multiple card types are selected, so that
 * field-level filters can target the same logical field across types using
 * an IN clause over multiple fieldDefinitionIds.
 */

import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { fieldDefinitions } from "@/lib/db/schema";
import type { CommonFieldDefinition } from "./types";

/**
 * Returns field definitions that are common across ALL given card types:
 * fields whose name + fieldType pair appears in every selected card type.
 * Photo fields are excluded (not filterable).
 *
 * - If one card type is given: returns all its active filterable fields
 *   (equivalent to getFilterableFieldDefinitions but returns CommonFieldDefinition shape).
 * - If multiple: only fields present in ALL selected card types are returned.
 *
 * The returned fieldDefinitionIds array contains the UUID for each card type,
 * in the same order as cardTypeIds. The first ID matches cardTypeIds[0], etc.
 *
 * @param cardTypeIds - One or more card type UUIDs.
 * @returns Common field definitions with per-card-type IDs.
 */
export async function getCommonFieldDefinitions(
  cardTypeIds: string[],
): Promise<CommonFieldDefinition[]> {
  if (cardTypeIds.length === 0) return [];

  const rows = await db
    .select({
      id: fieldDefinitions.id,
      name: fieldDefinitions.name,
      label: fieldDefinitions.label,
      fieldType: fieldDefinitions.fieldType,
      validationRules: fieldDefinitions.validationRules,
      cardTypeId: fieldDefinitions.cardTypeId,
      position: fieldDefinitions.position,
    })
    .from(fieldDefinitions)
    .where(
      and(
        inArray(fieldDefinitions.cardTypeId, cardTypeIds),
        eq(fieldDefinitions.isActive, true),
      ),
    )
    .orderBy(fieldDefinitions.position);

  // Exclude photo fields (not searchable)
  const filterable = rows.filter((r) => r.fieldType !== "photo");

  // Group by "name:fieldType" — the logical field identity across card types
  type GroupEntry = {
    name: string;
    label: string;
    fieldType: string;
    validationRules: unknown | null;
    // Map from cardTypeId → { id, position }
    byCardType: Map<string, { id: string; position: number }>;
  };

  const groups = new Map<string, GroupEntry>();
  for (const row of filterable) {
    const key = `${row.name}:${row.fieldType}`;
    const existing = groups.get(key);
    if (existing) {
      existing.byCardType.set(row.cardTypeId, { id: row.id, position: row.position });
    } else {
      groups.set(key, {
        name: row.name,
        label: row.label,
        fieldType: row.fieldType,
        validationRules: row.validationRules,
        byCardType: new Map([[row.cardTypeId, { id: row.id, position: row.position }]]),
      });
    }
  }

  const result: CommonFieldDefinition[] = [];
  for (const [, group] of groups) {
    // Only include fields that appear in ALL selected card types
    if (!cardTypeIds.every((id) => group.byCardType.has(id))) continue;

    // fieldDefinitionIds preserves cardTypeIds order so callers can index by position
    const fieldDefinitionIds = cardTypeIds.map((ctId) => group.byCardType.get(ctId)!.id);

    result.push({
      name: group.name,
      label: group.label,
      fieldType: group.fieldType as CommonFieldDefinition["fieldType"],
      validationRules: group.validationRules,
      fieldDefinitionIds,
    });
  }

  // Sort by the position of the first card type's field (stable ordering)
  result.sort((a, b) => {
    const aPos = groups.get(`${a.name}:${a.fieldType}`)?.byCardType.get(cardTypeIds[0])?.position ?? 0;
    const bPos = groups.get(`${b.name}:${b.fieldType}`)?.byCardType.get(cardTypeIds[0])?.position ?? 0;
    return aPos - bPos;
  });

  return result;
}

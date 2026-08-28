/**
 * Loading a card's snapshot source from the database.
 *
 * ## Why this is a query and not a projection of what the caller already holds
 *
 * The payload contract (see `payload.ts`) requires EVERY field definition of the
 * card type — system ones, soft-deleted ones, and ones the card has no value
 * for. None of the write paths hold that:
 *
 *   - the scan pipeline holds `CardWithFields`, whose `fields` come from
 *     `enrichFieldValues`, which maps over `field_values` ROWS — so a field with
 *     no value is simply absent — and whose definitions come from
 *     `getFieldDefinitionsByCardType`, which filters `is_active = true`;
 *   - `executeAction` holds one field's value, its own target;
 *   - neither holds the card type's NAME.
 *
 * Building the payload from those would make "field emptied" and "field never
 * set" indistinguishable, which is precisely the distinction A2's diff needs.
 * So this is one extra indexed query on the scan path, and one shared loader
 * rather than four hand-rolled projections that could disagree.
 *
 * It is a single statement, anchored on `cards` with LEFT JOINs outward, so a
 * card type with no field definitions still returns one row carrying the card's
 * identity.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { extractValue } from "@/lib/dal/field-values";
import type { FieldType, FieldValue } from "@/lib/dal/types";
import {
  buildCardSnapshot,
  type CardSnapshotFieldInput,
  type CardSnapshotPayload,
  type CardSnapshotSource,
} from "./payload";

/** One row of the loader query: card identity + one field definition + its value. */
interface SourceRow extends Record<string, unknown> {
  code: string;
  card_type_id: string;
  card_type_name: string;
  field_definition_id: string | null;
  field_name: string | null;
  field_label: string | null;
  field_type: FieldType | null;
  is_system: boolean | null;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: Date | null;
  value_json: unknown;
}

/**
 * Read everything needed to freeze a card's current state.
 *
 * @param tenantId - Tenant UUID, always from the session.
 * @param cardId   - Internal card UUID.
 * @returns The snapshot source, or null when the card is not in this tenant.
 */
export async function loadCardSnapshotSource(
  tenantId: string,
  cardId: string,
): Promise<CardSnapshotSource | null> {
  const result = await db.execute<SourceRow>(sql`
    SELECT
      c.code                    AS code,
      c.card_type_id            AS card_type_id,
      ct.name                   AS card_type_name,
      fd.id                     AS field_definition_id,
      fd.name                   AS field_name,
      fd.label                  AS field_label,
      fd.field_type             AS field_type,
      fd.is_system              AS is_system,
      fv.value_text             AS value_text,
      fv.value_number           AS value_number,
      fv.value_boolean          AS value_boolean,
      fv.value_date             AS value_date,
      fv.value_json             AS value_json
    FROM cards c
    JOIN card_types ct ON ct.id = c.card_type_id
    -- Every definition of the card type, INCLUDING soft-deleted (is_active =
    -- false) and system ones: a snapshot describes the card as it was, not as
    -- a configuration surface would show it.
    LEFT JOIN field_definitions fd ON fd.card_type_id = c.card_type_id
    -- LEFT, so a field the card has no value for still appears — with null.
    LEFT JOIN field_values fv
      ON fv.field_definition_id = fd.id AND fv.card_id = c.id
    WHERE c.id = ${cardId}::uuid
      AND c.tenant_id = ${tenantId}::uuid
  `);

  const rows = result.rows;
  if (rows.length === 0) return null;

  const first = rows[0];

  const fields: CardSnapshotFieldInput[] = [];
  for (const row of rows) {
    // Null when the card type has no field definitions at all — the anchor row
    // still carries the card's identity, which is the point of the LEFT JOIN.
    if (!row.field_definition_id || !row.field_type) continue;

    // Route the typed columns through the shared extractor rather than picking
    // one by hand, so the snapshot cannot disagree with every other read.
    const value = extractValue(
      {
        valueText: row.value_text,
        valueNumber: row.value_number,
        valueBoolean: row.value_boolean,
        valueDate: row.value_date,
        valueJson: row.value_json,
      } as FieldValue,
      row.field_type,
    );

    fields.push({
      fieldDefinitionId: row.field_definition_id,
      name: row.field_name ?? "",
      label: row.field_label ?? "",
      type: row.field_type,
      isSystem: row.is_system === true,
      value,
    });
  }

  return {
    code: first.code,
    cardTypeId: first.card_type_id,
    cardTypeName: first.card_type_name,
    fields,
  };
}

/**
 * Load a card's current state and build its payload + hash.
 *
 * @returns The payload and its hash, or null when the card is not in the tenant.
 */
export async function buildCardSnapshotFromDb(
  tenantId: string,
  cardId: string,
): Promise<{ payload: CardSnapshotPayload; contentHash: string } | null> {
  const source = await loadCardSnapshotSource(tenantId, cardId);
  return source ? buildCardSnapshot(source) : null;
}

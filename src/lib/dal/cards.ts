/**
 * Cards DAL
 *
 * CRUD operations for issued cards (credentials).
 * Cards are always identified externally by their `code` (tenant-scoped),
 * never by their internal UUID. The primary lookup path is (tenant_id, code).
 */

import {
  eq,
  and,
  asc,
  desc,
  like,
  count,
  sql,
  gt,
  lt,
  gte,
  lte,
} from "drizzle-orm";
import { db } from "@/lib/db";
import { cards, fieldValues, fieldDefinitions } from "@/lib/db/schema";
import {
  NotFoundError,
  ValidationError,
  DuplicateCodeError,
} from "./errors";
import { getFieldDefinitionsByCardType } from "./field-definitions";
import { mapValueToColumn, extractValue } from "./field-values";
import type {
  Card,
  CardWithFields,
  EnrichedFieldValue,
  FieldValueMap,
  FieldDefinition,
  PaginationOptions,
  PaginatedResult,
  SearchCardsInput,
  SearchFilter,
} from "./types";

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Enrich raw field value rows with their definition metadata.
 * Returns an array sorted by field definition position.
 */
async function enrichFieldValues(
  cardId: string,
  defs: FieldDefinition[],
): Promise<EnrichedFieldValue[]> {
  const rows = await db
    .select()
    .from(fieldValues)
    .where(eq(fieldValues.cardId, cardId));

  const defsMap = new Map(defs.map((d) => [d.id, d]));

  return rows
    .map((row) => {
      const def = defsMap.get(row.fieldDefinitionId);
      if (!def) return null;
      return {
        fieldDefinitionId: def.id,
        name: def.name,
        label: def.label,
        fieldType: def.fieldType,
        isRequired: def.isRequired,
        value: extractValue(row, def.fieldType),
        raw: row,
      } satisfies EnrichedFieldValue;
    })
    .filter((v): v is EnrichedFieldValue => v !== null)
    .sort((a, b) => {
      const posA = defs.find((d) => d.id === a.fieldDefinitionId)?.position ?? 0;
      const posB = defs.find((d) => d.id === b.fieldDefinitionId)?.position ?? 0;
      return posA - posB;
    });
}

/**
 * Validate field values against active field definitions.
 * Checks required fields and type compatibility.
 *
 * @throws {ValidationError} On missing required fields or type mismatches.
 */
function validateFieldValues(
  values: FieldValueMap,
  defs: FieldDefinition[],
): void {
  // Check required fields have a value.
  for (const def of defs) {
    if (def.isRequired) {
      const val = values[def.id];
      if (val === undefined || val === null || val === "") {
        throw new ValidationError(
          `Required field "${def.label}" (${def.name}) is missing a value.`,
        );
      }
    }
  }

  // Validate types by attempting to map each value to its column.
  // mapValueToColumn throws ValidationError on type mismatch.
  const defsMap = new Map(defs.map((d) => [d.id, d]));
  for (const [fdId, value] of Object.entries(values)) {
    const def = defsMap.get(fdId);
    if (!def) {
      throw new ValidationError(
        `Unknown field definition ID: ${fdId}. ` +
          `It may not belong to this card type or has been deactivated.`,
      );
    }
    if (value !== null && value !== undefined) {
      mapValueToColumn(def.fieldType, value);
    }
  }
}

/**
 * Insert field value rows for a card.
 * Skips null/undefined values.
 */
async function insertFieldValues(
  cardId: string,
  values: FieldValueMap,
  defs: FieldDefinition[],
): Promise<void> {
  const defsMap = new Map(defs.map((d) => [d.id, d]));
  const rows = Object.entries(values)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([fdId, value]) => {
      const def = defsMap.get(fdId)!;
      return {
        cardId,
        fieldDefinitionId: fdId,
        ...mapValueToColumn(def.fieldType, value),
      };
    });

  if (rows.length > 0) {
    await db.insert(fieldValues).values(rows);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Create a new card with its field values.
 *
 * Validates:
 * 1. Code uniqueness within the tenant.
 * 2. All required fields have values.
 * 3. Value types match their field definitions.
 *
 * @param cardTypeId - Card type UUID.
 * @param tenantId   - Tenant UUID.
 * @param code       - Client-facing card code (unique per tenant).
 * @param values     - Field values keyed by field definition ID.
 * @returns The created card with enriched field values.
 * @throws {DuplicateCodeError} If code already exists for this tenant.
 * @throws {ValidationError} On field validation failures.
 */
export async function createCard(
  cardTypeId: string,
  tenantId: string,
  code: string,
  values: FieldValueMap,
): Promise<CardWithFields> {
  // Check code uniqueness.
  const [existing] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.tenantId, tenantId), eq(cards.code, code)))
    .limit(1);

  if (existing) {
    throw new DuplicateCodeError(code, tenantId);
  }

  // Get active field definitions for this card type.
  const defs = await getFieldDefinitionsByCardType(cardTypeId);

  // Validate values.
  validateFieldValues(values, defs);

  // Insert card.
  const [card] = await db
    .insert(cards)
    .values({ cardTypeId, tenantId, code })
    .returning();

  // Insert field values.
  await insertFieldValues(card.id, values, defs);

  // Return enriched result.
  const fields = await enrichFieldValues(card.id, defs);
  return { ...card, fields };
}

/**
 * Get a card by its client-facing code within a tenant.
 *
 * This is the **primary lookup method** — uses the composite index
 * `cards_tenant_code_idx` for optimal performance.
 *
 * @param code     - Client-facing card code.
 * @param tenantId - Tenant UUID.
 * @returns The card with all enriched field values.
 * @throws {NotFoundError} If no card matches within the tenant.
 */
export async function getCardByCode(
  code: string,
  tenantId: string,
): Promise<CardWithFields> {
  const [card] = await db
    .select()
    .from(cards)
    .where(and(eq(cards.tenantId, tenantId), eq(cards.code, code)))
    .limit(1);

  if (!card) {
    throw new NotFoundError("Card", `code="${code}" tenant=${tenantId}`);
  }

  const defs = await getFieldDefinitionsByCardType(card.cardTypeId);
  const fields = await enrichFieldValues(card.id, defs);
  return { ...card, fields };
}

/**
 * Get a card by its internal UUID within a tenant.
 *
 * For internal use and cross-entity relationships.
 *
 * @param id       - Card internal UUID.
 * @param tenantId - Tenant UUID.
 * @returns The card with all enriched field values.
 * @throws {NotFoundError} If no card matches within the tenant.
 */
export async function getCardById(
  id: string,
  tenantId: string,
): Promise<CardWithFields> {
  const [card] = await db
    .select()
    .from(cards)
    .where(and(eq(cards.id, id), eq(cards.tenantId, tenantId)))
    .limit(1);

  if (!card) {
    throw new NotFoundError("Card", id);
  }

  const defs = await getFieldDefinitionsByCardType(card.cardTypeId);
  const fields = await enrichFieldValues(card.id, defs);
  return { ...card, fields };
}

/**
 * Update a card's field values, looked up by code + tenant.
 *
 * Uses upsert logic: updates existing field values, inserts new ones
 * (e.g. for fields added after card creation).
 *
 * @param code     - Client-facing card code.
 * @param tenantId - Tenant UUID.
 * @param values   - Field values keyed by field definition ID.
 * @returns The updated card with enriched field values.
 * @throws {NotFoundError} If no card matches.
 * @throws {ValidationError} On field validation failures.
 */
export async function updateCard(
  code: string,
  tenantId: string,
  values: FieldValueMap,
): Promise<CardWithFields> {
  const [card] = await db
    .select()
    .from(cards)
    .where(and(eq(cards.tenantId, tenantId), eq(cards.code, code)))
    .limit(1);

  if (!card) {
    throw new NotFoundError("Card", `code="${code}" tenant=${tenantId}`);
  }

  const defs = await getFieldDefinitionsByCardType(card.cardTypeId);
  validateFieldValues(values, defs);

  // Upsert each field value.
  const defsMap = new Map(defs.map((d) => [d.id, d]));
  for (const [fdId, value] of Object.entries(values)) {
    const def = defsMap.get(fdId);
    if (!def) continue;

    const typed = mapValueToColumn(def.fieldType, value);
    await db
      .insert(fieldValues)
      .values({
        cardId: card.id,
        fieldDefinitionId: fdId,
        ...typed,
      })
      .onConflictDoUpdate({
        target: [fieldValues.cardId, fieldValues.fieldDefinitionId],
        set: { ...typed, updatedAt: new Date() },
      });
  }

  // Update card's updatedAt timestamp.
  await db
    .update(cards)
    .set({ updatedAt: new Date() })
    .where(eq(cards.id, card.id));

  // Return refreshed data.
  const fields = await enrichFieldValues(card.id, defs);
  return { ...card, updatedAt: new Date(), fields };
}

/**
 * Change a card's client-facing code.
 *
 * @param id       - Card internal UUID.
 * @param tenantId - Tenant UUID.
 * @param newCode  - The new code to assign.
 * @returns The updated card row.
 * @throws {NotFoundError} If the card doesn't exist.
 * @throws {DuplicateCodeError} If newCode already exists in this tenant.
 */
export async function updateCardCode(
  id: string,
  tenantId: string,
  newCode: string,
): Promise<Card> {
  // Check new code is available.
  const [conflict] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.tenantId, tenantId), eq(cards.code, newCode)))
    .limit(1);

  if (conflict && conflict.id !== id) {
    throw new DuplicateCodeError(newCode, tenantId);
  }

  const [updated] = await db
    .update(cards)
    .set({ code: newCode, updatedAt: new Date() })
    .where(and(eq(cards.id, id), eq(cards.tenantId, tenantId)))
    .returning();

  if (!updated) {
    throw new NotFoundError("Card", id);
  }

  return updated;
}

/**
 * List cards of a card type with pagination.
 *
 * Returns cards with their enriched field values, ordered by code.
 *
 * @param cardTypeId - Card type UUID.
 * @param tenantId   - Tenant UUID.
 * @param options    - Pagination options (limit, offset).
 * @returns Paginated result with enriched cards.
 */
export async function listCards(
  cardTypeId: string,
  tenantId: string,
  options: PaginationOptions = {},
): Promise<PaginatedResult<CardWithFields>> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  // Count total.
  const [{ total }] = await db
    .select({ total: count() })
    .from(cards)
    .where(
      and(eq(cards.cardTypeId, cardTypeId), eq(cards.tenantId, tenantId)),
    );

  // Fetch page.
  const rows = await db
    .select()
    .from(cards)
    .where(
      and(eq(cards.cardTypeId, cardTypeId), eq(cards.tenantId, tenantId)),
    )
    .orderBy(asc(cards.code))
    .limit(limit)
    .offset(offset);

  // Enrich each card.
  const defs = await getFieldDefinitionsByCardType(cardTypeId);
  const data = await Promise.all(
    rows.map(async (card) => {
      const fields = await enrichFieldValues(card.id, defs);
      return { ...card, fields };
    }),
  );

  return { data, total, limit, offset };
}

/**
 * Soft-delete a card by setting its status to "inactive".
 *
 * @param code     - Client-facing card code.
 * @param tenantId - Tenant UUID.
 * @returns The deactivated card row.
 * @throws {NotFoundError} If no card matches.
 */
export async function deleteCard(
  code: string,
  tenantId: string,
): Promise<Card> {
  const [updated] = await db
    .update(cards)
    .set({ status: "inactive", updatedAt: new Date() })
    .where(and(eq(cards.tenantId, tenantId), eq(cards.code, code)))
    .returning();

  if (!updated) {
    throw new NotFoundError("Card", `code="${code}" tenant=${tenantId}`);
  }

  return updated;
}

/**
 * Search cards by dynamic field values and/or partial code match.
 *
 * Builds a dynamic query with JOINs against field_values for each filter.
 * Each filter is applied as an additional WHERE condition via a subquery.
 *
 * @param cardTypeId - Card type UUID.
 * @param tenantId   - Tenant UUID.
 * @param input      - Search filters and optional code substring.
 * @param options    - Pagination options.
 * @returns Paginated result with enriched cards.
 */
export async function searchCards(
  cardTypeId: string,
  tenantId: string,
  input: SearchCardsInput,
  options: PaginationOptions = {},
): Promise<PaginatedResult<CardWithFields>> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  // Build base conditions.
  const conditions = [
    eq(cards.cardTypeId, cardTypeId),
    eq(cards.tenantId, tenantId),
  ];

  // Code partial match.
  if (input.codeContains) {
    conditions.push(like(cards.code, `%${input.codeContains}%`));
  }

  // Dynamic field value filters via EXISTS subqueries.
  if (input.filters?.length) {
    for (const filter of input.filters) {
      const subCondition = buildFieldFilterCondition(filter);
      if (subCondition) {
        conditions.push(subCondition);
      }
    }
  }

  const where = and(...conditions);

  // Count.
  const [{ total }] = await db
    .select({ total: count() })
    .from(cards)
    .where(where);

  // Fetch page.
  const rows = await db
    .select()
    .from(cards)
    .where(where)
    .orderBy(asc(cards.code))
    .limit(limit)
    .offset(offset);

  // Enrich.
  const defs = await getFieldDefinitionsByCardType(cardTypeId);
  const data = await Promise.all(
    rows.map(async (card) => {
      const fields = await enrichFieldValues(card.id, defs);
      return { ...card, fields };
    }),
  );

  return { data, total, limit, offset };
}

/**
 * Build an EXISTS subquery condition for a single field value filter.
 * Returns a SQL condition that checks for a matching field_values row.
 */
function buildFieldFilterCondition(filter: SearchFilter) {
  const { fieldDefinitionId, operator, value } = filter;

  // Determine which column to filter on by querying the value columns.
  // We try text first, then number, then date — based on operator.
  switch (operator) {
    case "eq":
      return sql`EXISTS (
        SELECT 1 FROM field_values fv
        WHERE fv.card_id = ${cards.id}
          AND fv.field_definition_id = ${fieldDefinitionId}
          AND (
            fv.value_text = ${String(value)}
            OR fv.value_number = ${Number(value)}
            OR fv.value_boolean = ${Boolean(value)}
          )
      )`;
    case "contains":
      return sql`EXISTS (
        SELECT 1 FROM field_values fv
        WHERE fv.card_id = ${cards.id}
          AND fv.field_definition_id = ${fieldDefinitionId}
          AND fv.value_text ILIKE ${"%" + String(value) + "%"}
      )`;
    case "gt":
      return sql`EXISTS (
        SELECT 1 FROM field_values fv
        WHERE fv.card_id = ${cards.id}
          AND fv.field_definition_id = ${fieldDefinitionId}
          AND fv.value_number > ${Number(value)}
      )`;
    case "lt":
      return sql`EXISTS (
        SELECT 1 FROM field_values fv
        WHERE fv.card_id = ${cards.id}
          AND fv.field_definition_id = ${fieldDefinitionId}
          AND fv.value_number < ${Number(value)}
      )`;
    case "gte":
      return sql`EXISTS (
        SELECT 1 FROM field_values fv
        WHERE fv.card_id = ${cards.id}
          AND fv.field_definition_id = ${fieldDefinitionId}
          AND fv.value_number >= ${Number(value)}
      )`;
    case "lte":
      return sql`EXISTS (
        SELECT 1 FROM field_values fv
        WHERE fv.card_id = ${cards.id}
          AND fv.field_definition_id = ${fieldDefinitionId}
          AND fv.value_number <= ${Number(value)}
      )`;
    default:
      return undefined;
  }
}

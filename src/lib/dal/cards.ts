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
  inArray,
} from "drizzle-orm";
import { db } from "@/lib/db";
import { cards, cardTypes, fieldValues, user } from "@/lib/db/schema";
import {
  NotFoundError,
  ValidationError,
  DuplicateCodeError,
} from "./errors";
import { notArchived, onlyArchived } from "./scopes";
import { getFieldDefinitionsByCardType } from "./field-definitions";
import { mapValueToColumn, extractValue } from "./field-values";
import { validateCard as runEngineValidation } from "@/lib/validation";
import type {
  Card,
  CardWithFields,
  EnrichedFieldValue,
  FieldValueMap,
  FieldDefinition,
  LifecycleStatus,
  PaginationOptions,
  PaginatedResult,
  SearchCardsInput,
  SearchFilter,
  ArchivedCardListItem,
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
 * Validate field values using the shared validation engine.
 *
 * Delegates to validateCard() from @/lib/validation, which runs the same
 * logic as the frontend form validation. Throws ValidationError with a
 * human-readable message listing all failures if any rule is violated.
 *
 * Also validates unknown field IDs (not belonging to this card type).
 *
 * @throws {ValidationError} If any required field is missing or a rule fails.
 */
function validateFieldValues(
  values: FieldValueMap,
  defs: FieldDefinition[],
): void {
  // Guard: reject values for unknown/inactive field definitions.
  const knownIds = new Set(defs.map((d) => d.id));
  for (const fdId of Object.keys(values)) {
    if (!knownIds.has(fdId)) {
      throw new ValidationError(
        `Unknown field definition ID: ${fdId}. ` +
          `It may not belong to this card type or has been deactivated.`,
      );
    }
  }

  // Run the shared engine (same logic as the frontend).
  const result = runEngineValidation(
    defs.map((d) => ({
      id: d.id,
      name: d.name,
      label: d.label,
      fieldType: d.fieldType,
      isRequired: d.isRequired,
      validationRules: d.validationRules as import("@/lib/validation").ValidationRules | null,
    })),
    values as Record<string, unknown>,
  );

  if (!result.valid) {
    const summary = result.errors.map((e) => `• ${e.message}`).join("\n");
    throw new ValidationError(`Card validation failed:\n${summary}`);
  }

  // Also validate raw type compatibility via mapValueToColumn so the DB
  // layer never receives a value in the wrong typed column.
  const defsMap = new Map(defs.map((d) => [d.id, d]));
  for (const [fdId, value] of Object.entries(values)) {
    if (value !== null && value !== undefined) {
      mapValueToColumn(defsMap.get(fdId)!.fieldType, value);
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
 * Read only a card's lifecycle status within a tenant.
 *
 * A light lookup (no field enrichment) used by the action-execution gate to
 * decide, server-side, whether the card may be acted upon given its status.
 * Also confirms the card belongs to the tenant.
 *
 * @param id       - Card internal UUID.
 * @param tenantId - Tenant UUID.
 * @returns The card's `lifecycle_status`.
 * @throws {NotFoundError} If no card matches within the tenant.
 */
export async function getCardLifecycleStatus(
  id: string,
  tenantId: string,
): Promise<LifecycleStatus> {
  const [row] = await db
    .select({ status: cards.status })
    .from(cards)
    .where(and(eq(cards.id, id), eq(cards.tenantId, tenantId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Card", id);
  }

  return row.status;
}

/**
 * Count the live (non-archived) cards belonging to a card type.
 *
 * "Live" mirrors exactly what an archive cascade touches: every card of the
 * type whose status is not already `archived` (i.e. `active` + `inactive` +
 * `expired`). Used to warn the operator how many cards will be dragged into the
 * trash before archiving a card type (see `archiveCardType`).
 *
 * @param cardTypeId - The card type whose cards are counted.
 * @param tenantId   - Tenant UUID (scopes the count).
 * @returns The number of non-archived cards of that type.
 */
export async function countLiveCardsForCardType(
  cardTypeId: string,
  tenantId: string,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(cards)
    .where(
      and(
        eq(cards.cardTypeId, cardTypeId),
        eq(cards.tenantId, tenantId),
        notArchived(cards.status),
      ),
    );

  return row?.total ?? 0;
}

/**
 * List a tenant's archived (trashed) cards for the "Archived" view (phase 4).
 *
 * Returns only `status = 'archived'` rows, newest first, each resolved to its
 * card type name and the display name of whoever archived it. The user join is
 * a LEFT join on purpose: `archived_by` is `ON DELETE SET NULL`, so the actor
 * may no longer exist. The internal `id` is included solely as the argument for
 * the restore / purge Server Actions — callers must display `code`, never it.
 *
 * The purge countdown is deliberately NOT computed here: it lives in
 * `src/lib/server/lifecycle/retention.ts` and is applied by the page, keeping
 * the DAL free of any dependency on the lifecycle service.
 *
 * @param tenantId - Tenant UUID (scopes the query).
 * @returns Archived cards, ordered by archive time (most recent first).
 */
export async function listArchivedCards(
  tenantId: string,
): Promise<ArchivedCardListItem[]> {
  const rows = await db
    .select({
      id: cards.id,
      code: cards.code,
      cardTypeName: cardTypes.name,
      archivedAt: cards.archivedAt,
      archivedByName: user.name,
      archivedViaTypeId: cards.archivedViaTypeId,
    })
    .from(cards)
    .leftJoin(cardTypes, eq(cards.cardTypeId, cardTypes.id))
    .leftJoin(user, eq(cards.archivedBy, user.id))
    .where(and(eq(cards.tenantId, tenantId), onlyArchived(cards.status)))
    .orderBy(desc(cards.archivedAt));

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    cardTypeName: r.cardTypeName ?? "",
    // Non-null for archived rows, guaranteed by cards_archive_metadata_ck.
    archivedAt: r.archivedAt as Date,
    archivedByName: r.archivedByName ?? null,
    archivedViaType: r.archivedViaTypeId !== null,
  }));
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
 * List cards of a card type with pagination, for management views.
 *
 * Returns cards with their enriched field values, ordered by code.
 * Excludes archived (trashed) cards; `inactive` and `expired` cards stay
 * visible — they are switched off, not deleted.
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

  const where = and(
    eq(cards.cardTypeId, cardTypeId),
    eq(cards.tenantId, tenantId),
    notArchived(cards.status),
  );

  // Count total.
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
 * Search cards by dynamic field values and/or partial code match.
 *
 * Builds a dynamic query with EXISTS subqueries for each field filter.
 * Supports searching across multiple card types simultaneously.
 *
 * Excludes archived (trashed) cards; `inactive` and `expired` cards stay
 * searchable. Filtering by lifecycle status is a later phase.
 *
 * @param cardTypeIds - One or more card type UUIDs.
 * @param tenantId    - Tenant UUID.
 * @param input       - Search filters and optional code substring.
 * @param options     - Pagination options.
 * @returns Paginated result with enriched cards.
 */
export async function searchCards(
  cardTypeIds: string[],
  tenantId: string,
  input: SearchCardsInput,
  options: PaginationOptions = {},
): Promise<PaginatedResult<CardWithFields>> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  if (cardTypeIds.length === 0) {
    return { data: [], total: 0, limit, offset };
  }

  // Build base conditions.
  const cardTypeCondition = cardTypeIds.length === 1
    ? eq(cards.cardTypeId, cardTypeIds[0])
    : inArray(cards.cardTypeId, cardTypeIds);

  const conditions = [
    cardTypeCondition,
    eq(cards.tenantId, tenantId),
    notArchived(cards.status),
  ];

  // Lifecycle status filter. `archived` is never selectable here — `notArchived`
  // above always applies. `inactive` groups `inactive` + `expired`, which behave
  // identically. `all` (or undefined) adds no extra status condition.
  if (input.status === "active") {
    conditions.push(eq(cards.status, "active"));
  } else if (input.status === "inactive") {
    conditions.push(inArray(cards.status, ["inactive", "expired"]));
  }

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

  // Enrich: fetch defs per card type (parallel), then enrich each card.
  const uniqueCardTypeIds = [...new Set(rows.map((c) => c.cardTypeId))];
  const defsMap = new Map<string, FieldDefinition[]>();
  await Promise.all(
    uniqueCardTypeIds.map(async (ctId) => {
      const defs = await getFieldDefinitionsByCardType(ctId);
      defsMap.set(ctId, defs);
    }),
  );

  const data = await Promise.all(
    rows.map(async (card) => {
      const defs = defsMap.get(card.cardTypeId) ?? [];
      const fields = await enrichFieldValues(card.id, defs);
      return { ...card, fields };
    }),
  );

  return { data, total, limit, offset };
}

/** Escape % and _ in ILIKE patterns. */
function escapeLike(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Build an EXISTS subquery condition for a single field value filter.
 * Supports all FieldFilterOperator values: text, number, boolean, date.
 *
 * When fieldDefinitionIds contains multiple IDs (multi-card-type filtering),
 * the subquery matches ANY of those IDs using an IN clause.
 */
function buildFieldFilterCondition(filter: SearchFilter) {
  const { fieldDefinitionIds, operator, value } = filter;
  if (!fieldDefinitionIds.length) return undefined;

  // Build the field_definition_id match clause (single or multiple IDs)
  const idMatch = fieldDefinitionIds.length === 1
    ? sql`fv.field_definition_id = ${fieldDefinitionIds[0]}::uuid`
    : sql`fv.field_definition_id IN (${sql.join(
        fieldDefinitionIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`;

  switch (operator) {
    // ── Text ──────────────────────────────────────────────────────────────────
    case "contains": {
      const v = "%" + escapeLike(String(value ?? "")) + "%";
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE fv.card_id = ${cards.id} AND ${idMatch} AND fv.value_text ILIKE ${v})`;
    }
    case "starts_with": {
      const v = escapeLike(String(value ?? "")) + "%";
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE fv.card_id = ${cards.id} AND ${idMatch} AND fv.value_text ILIKE ${v})`;
    }
    case "equals_text":
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE fv.card_id = ${cards.id} AND ${idMatch} AND fv.value_text = ${String(value ?? "")})`;

    // ── Numeric ───────────────────────────────────────────────────────────────
    case "eq":
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE fv.card_id = ${cards.id} AND ${idMatch} AND fv.value_number = ${Number(value)})`;
    case "gt":
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE fv.card_id = ${cards.id} AND ${idMatch} AND fv.value_number > ${Number(value)})`;
    case "lt":
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE fv.card_id = ${cards.id} AND ${idMatch} AND fv.value_number < ${Number(value)})`;
    case "gte":
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE fv.card_id = ${cards.id} AND ${idMatch} AND fv.value_number >= ${Number(value)})`;
    case "lte":
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE fv.card_id = ${cards.id} AND ${idMatch} AND fv.value_number <= ${Number(value)})`;
    case "between": {
      const r = value as { min?: unknown; max?: unknown } | null ?? {};
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE fv.card_id = ${cards.id} AND ${idMatch} AND fv.value_number >= ${Number(r.min ?? 0)} AND fv.value_number <= ${Number(r.max ?? 0)})`;
    }

    // ── Boolean ───────────────────────────────────────────────────────────────
    case "is_true":
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE fv.card_id = ${cards.id} AND ${idMatch} AND fv.value_boolean = true)`;
    case "is_false":
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE fv.card_id = ${cards.id} AND ${idMatch} AND fv.value_boolean = false)`;

    // ── Date ──────────────────────────────────────────────────────────────────
    case "date_eq":
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE fv.card_id = ${cards.id} AND ${idMatch} AND fv.value_date::date = ${String(value ?? "")}::date)`;
    case "date_before":
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE fv.card_id = ${cards.id} AND ${idMatch} AND fv.value_date < ${String(value ?? "")}::date)`;
    case "date_after":
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE fv.card_id = ${cards.id} AND ${idMatch} AND fv.value_date > ${String(value ?? "")}::date)`;
    case "date_between": {
      const r = value as { min?: string; max?: string } | null ?? {};
      return sql`EXISTS (SELECT 1 FROM field_values fv WHERE fv.card_id = ${cards.id} AND ${idMatch} AND fv.value_date >= ${String(r.min ?? "")}::date AND fv.value_date <= ${String(r.max ?? "")}::date)`;
    }

    default:
      return undefined;
  }
}

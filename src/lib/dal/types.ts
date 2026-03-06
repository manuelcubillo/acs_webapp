/**
 * DAL Types
 *
 * Shared TypeScript types and interfaces for the data access layer.
 * Uses Drizzle's InferSelectModel / InferInsertModel where possible,
 * and defines custom shapes for DAL-specific inputs and outputs.
 */

import type { InferSelectModel } from "drizzle-orm";
import type {
  tenants,
  cardTypes,
  fieldDefinitions,
  cards,
  fieldValues,
  actionDefinitions,
  actionLogs,
} from "@/lib/db/schema";

// ─── Drizzle-derived row types ──────────────────────────────────────────────

export type Tenant = InferSelectModel<typeof tenants>;
export type CardType = InferSelectModel<typeof cardTypes>;
export type FieldDefinition = InferSelectModel<typeof fieldDefinitions>;
export type Card = InferSelectModel<typeof cards>;
export type FieldValue = InferSelectModel<typeof fieldValues>;
export type ActionDefinition = InferSelectModel<typeof actionDefinitions>;
export type ActionLog = InferSelectModel<typeof actionLogs>;

// ─── Field type enum literal ────────────────────────────────────────────────

export type FieldType = FieldDefinition["fieldType"];

// ─── Tenant inputs ──────────────────────────────────────────────────────────

export interface CreateTenantInput {
  name: string;
}

export interface UpdateTenantInput {
  name?: string;
}

// ─── CardType inputs ────────────────────────────────────────────────────────

export interface CreateCardTypeInput {
  name: string;
  description?: string;
  /** Optional initial field definitions to create in the same transaction. */
  fieldDefinitions?: CreateFieldDefinitionInput[];
}

export interface UpdateCardTypeInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

// ─── FieldDefinition inputs ─────────────────────────────────────────────────

export interface CreateFieldDefinitionInput {
  name: string;
  label: string;
  fieldType: FieldType;
  isRequired?: boolean;
  position?: number;
  defaultValue?: string | null;
  validationRules?: Record<string, unknown> | null;
}

export interface UpdateFieldDefinitionInput {
  label?: string;
  isRequired?: boolean;
  position?: number;
  defaultValue?: string | null;
  validationRules?: Record<string, unknown> | null;
  isActive?: boolean;
  /** Will be rejected if field already has existing values. */
  fieldType?: FieldType;
}

// ─── Card inputs ────────────────────────────────────────────────────────────

/**
 * Values keyed by fieldDefinitionId.
 * The DAL determines which typed column to populate based on the
 * field_type of each definition.
 */
export type FieldValueMap = Record<string, unknown>;

export interface CreateCardInput {
  cardTypeId: string;
  tenantId: string;
  code: string;
  values: FieldValueMap;
}

export interface UpdateCardInput {
  values: FieldValueMap;
}

// ─── Card outputs ───────────────────────────────────────────────────────────

/** A field value enriched with its definition metadata. */
export interface EnrichedFieldValue {
  fieldDefinitionId: string;
  name: string;
  label: string;
  fieldType: FieldType;
  isRequired: boolean;
  value: unknown;
  raw: FieldValue;
}

/** A card with all its enriched field values. */
export interface CardWithFields extends Card {
  fields: EnrichedFieldValue[];
}

/** A card type with its active field definitions. */
export interface CardTypeWithFields extends CardType {
  fieldDefinitions: FieldDefinition[];
}

/** A card type with field definitions and action definitions. */
export interface CardTypeWithFullSchema extends CardTypeWithFields {
  actionDefinitions: ActionDefinition[];
}

// ─── Search / filter ────────────────────────────────────────────────────────

export type SearchOperator = "eq" | "contains" | "gt" | "lt" | "gte" | "lte";

export interface SearchFilter {
  fieldDefinitionId: string;
  operator: SearchOperator;
  value: unknown;
}

export interface SearchCardsInput {
  /** Optional partial match on card code. */
  codeContains?: string;
  /** Dynamic field filters. */
  filters?: SearchFilter[];
}

// ─── Pagination ─────────────────────────────────────────────────────────────

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Action Definition inputs ────────────────────────────────────────────────

export type ActionType = ActionDefinition["actionType"];

export interface CreateActionDefinitionInput {
  name: string;
  actionType: ActionType;
  config?: Record<string, unknown> | null;
}

export interface UpdateActionDefinitionInput {
  name?: string;
  config?: Record<string, unknown> | null;
  isActive?: boolean;
}

// ─── Action inputs ──────────────────────────────────────────────────────────

export interface ExecuteActionInput {
  cardId: string;
  actionDefinitionId: string;
  /** Auth user ID of the person executing the action. */
  executedBy?: string;
  metadata?: Record<string, unknown>;
}

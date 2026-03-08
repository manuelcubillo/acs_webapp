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
  tenantMembers,
  scanValidations,
} from "@/lib/db/schema";

// ─── Drizzle-derived row types ──────────────────────────────────────────────

export type Tenant = InferSelectModel<typeof tenants>;
export type CardType = InferSelectModel<typeof cardTypes>;
export type FieldDefinition = InferSelectModel<typeof fieldDefinitions>;
export type Card = InferSelectModel<typeof cards>;
export type FieldValue = InferSelectModel<typeof fieldValues>;
export type ActionDefinition = InferSelectModel<typeof actionDefinitions>;
export type ActionLog = InferSelectModel<typeof actionLogs>;
export type TenantMember = InferSelectModel<typeof tenantMembers>;
export type ScanValidation = InferSelectModel<typeof scanValidations>;

/** Role a user holds within a tenant. Hierarchical: master > admin > operator. */
export type TenantRole = TenantMember["role"];

// ─── Field type enum literal ────────────────────────────────────────────────

export type FieldType = FieldDefinition["fieldType"];

// ─── Scan mode ───────────────────────────────────────────────────────────────

export type ScanMode = Tenant["scanMode"];

// ─── Tenant inputs ──────────────────────────────────────────────────────────

export interface CreateTenantInput {
  name: string;
}

export interface UpdateTenantInput {
  name?: string;
}

/** Settings the master can configure for their tenant. */
export interface UpdateTenantSettingsInput {
  scanMode?: ScanMode;
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
  actionDefinitions: ActionDefinitionWithField[];
  scanValidations: ScanValidationWithField[];
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
  /** The field this action will modify. Must be compatible with actionType. */
  targetFieldDefinitionId: string;
  /** increment/decrement: { amount: number }. check/uncheck: null. */
  config?: { amount?: number } | null;
  /** lucide-react icon name (optional) */
  icon?: string | null;
  /** Button color key (optional) */
  color?: string | null;
  position?: number;
}

export interface UpdateActionDefinitionInput {
  name?: string;
  config?: { amount?: number } | null;
  icon?: string | null;
  color?: string | null;
  position?: number;
  isActive?: boolean;
}

/** Returned by executeAction — carries before/after field values */
export interface ActionExecutionResult {
  log: ActionLog;
  previousValue: unknown;
  newValue: unknown;
  targetFieldName: string;
  targetFieldLabel: string;
}

// ─── Action inputs ──────────────────────────────────────────────────────────

export interface ExecuteActionInput {
  cardId: string;
  actionDefinitionId: string;
  /** Auth user ID of the person executing the action. */
  executedBy?: string;
}

// ─── Action Definition with target field info ────────────────────────────────

/** ActionDefinition enriched with the target field's name and type */
export interface ActionDefinitionWithField extends ActionDefinition {
  targetFieldName: string;
  targetFieldLabel: string;
  targetFieldType: FieldType;
}

// ─── Scan Validation inputs ──────────────────────────────────────────────────

export type ScanValidationSeverity = "error" | "warning";

export interface CreateScanValidationInput {
  fieldDefinitionId: string;
  rule: string;
  value?: unknown;
  errorMessage: string;
  severity?: ScanValidationSeverity;
  position?: number;
}

export interface UpdateScanValidationInput {
  rule?: string;
  value?: unknown;
  errorMessage?: string;
  severity?: ScanValidationSeverity;
  position?: number;
  isActive?: boolean;
}

// ─── Scan Validation enriched ────────────────────────────────────────────────

/** ScanValidation enriched with field metadata */
export interface ScanValidationWithField extends ScanValidation {
  fieldName: string;
  fieldLabel: string;
  fieldType: FieldType;
}

// ─── TenantMember inputs ─────────────────────────────────────────────────────

export interface AddMemberInput {
  role: TenantRole;
}

export interface UpdateMemberRoleInput {
  role: TenantRole;
}

/** Member row enriched with the auth user's name and email for display. */
export interface MemberWithUser extends TenantMember {
  userName: string;
  userEmail: string;
}

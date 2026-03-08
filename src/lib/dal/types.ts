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
  dashboardSettings,
  cardTypeSummaryFields,
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
export type DashboardSettings = InferSelectModel<typeof dashboardSettings>;
export type CardTypeSummaryField = InferSelectModel<typeof cardTypeSummaryFields>;

/** Role a user holds within a tenant. Hierarchical: master > admin > operator. */
export type TenantRole = TenantMember["role"];

// ─── Field type enum literal ────────────────────────────────────────────────

export type FieldType = FieldDefinition["fieldType"];

// ─── Scan mode ───────────────────────────────────────────────────────────────

export type ScanMode = Tenant["scanMode"];

// ─── Log type ────────────────────────────────────────────────────────────────

export type LogType = ActionLog["logType"];

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
  /**
   * When true, this action is executed automatically on every operational scan.
   * Only one per card type is recommended.
   */
  isAutoExecute?: boolean;
}

export interface UpdateActionDefinitionInput {
  name?: string;
  config?: { amount?: number } | null;
  icon?: string | null;
  color?: string | null;
  position?: number;
  isActive?: boolean;
  isAutoExecute?: boolean;
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
  /** Internal card UUID. */
  cardId: string;
  actionDefinitionId: string;
  /** Tenant UUID — denormalized into the log row for efficient feed queries. */
  tenantId: string;
  /** Auth user ID of the person executing the action. */
  executedBy?: string;
}

// ─── Scan log input ──────────────────────────────────────────────────────────

/** Input for inserting a pure scan entry (log_type = "scan"). */
export interface LogScanEntryInput {
  cardId: string;
  tenantId: string;
  /** Auth user ID. */
  executedBy?: string;
  /** Additional context (e.g. { method: "qr" | "barcode" | "manual" }). */
  metadata?: Record<string, unknown>;
}

// ─── Auto-action results ─────────────────────────────────────────────────────

/** Result of a single auto-executed action within an operational scan. */
export interface AutoActionResult {
  actionDefinitionId: string;
  actionName: string;
  success: boolean;
  result?: ActionExecutionResult;
  /** Error message if the action failed (non-blocking — other actions still run). */
  error?: string;
}

/** Full result of executeScanWithAutoActions. */
export interface ScanWithAutoActionsResult {
  /** The card that was scanned (enriched with field values). */
  card: CardWithFields;
  /** Scan validation results (alerts shown to operator). */
  scanResult: import("@/lib/validation/scan-validator").ScanValidationResult;
  /** Results of all is_auto_execute actions that were triggered. */
  autoActions: AutoActionResult[];
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

// ─── Dashboard Settings inputs ───────────────────────────────────────────────

export interface UpsertDashboardSettingsInput {
  feedLimit?: number;
  showScanEntries?: boolean;
  showActionEntries?: boolean;
}

// ─── Card Type Summary Fields inputs ─────────────────────────────────────────

export interface SetCardTypeSummaryFieldsInput {
  /** Ordered list of fieldDefinitionIds to show in the activity feed summary. */
  fieldDefinitionIds: string[];
}

// ─── Activity Feed ───────────────────────────────────────────────────────────

/** A single entry in the operational dashboard activity feed. */
export interface ActivityFeedEntry {
  id: string;
  logType: LogType;
  cardId: string;
  /** Public card code (for display and navigation). */
  cardCode: string;
  /** Card type name (for display). */
  cardTypeName: string;
  /** Card type UUID (for routing). */
  cardTypeId: string;
  /** Action definition UUID (null for scan entries). */
  actionDefinitionId: string | null;
  /** Action name (null for scan entries). */
  actionName: string | null;
  executedAt: Date;
  executedBy: string | null;
  metadata: unknown;
  /**
   * Selected field values for this card, configured per card type via
   * card_type_summary_fields. Surfaced inline so operators can identify cards.
   */
  summaryFields: ActivityFeedSummaryField[];
}

/** A single field value shown inline on an activity feed entry. */
export interface ActivityFeedSummaryField {
  fieldDefinitionId: string;
  label: string;
  fieldType: FieldType;
  value: unknown;
}

/** Options for the getActivityFeed DAL function. */
export interface ActivityFeedOptions {
  limit?: number;
  /** Include scan-only entries. Default: true. */
  includeScanEntries?: boolean;
  /** Include action execution entries. Default: true. */
  includeActionEntries?: boolean;
}

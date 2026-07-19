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
  memberInvitations,
  scanValidations,
  dashboardSettings,
  cardTypeSummaryFields,
  cardDesigns,
  cardTypeDesigns,
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
export type MemberInvitation = InferSelectModel<typeof memberInvitations>;
export type ScanValidation = InferSelectModel<typeof scanValidations>;
export type DashboardSettings = InferSelectModel<typeof dashboardSettings>;
export type CardTypeSummaryField = InferSelectModel<typeof cardTypeSummaryFields>;
export type CardDesign = InferSelectModel<typeof cardDesigns>;
export type CardTypeDesign = InferSelectModel<typeof cardTypeDesigns>;

/** Role a user holds within a tenant. Hierarchical: master > admin > operator. */
export type TenantRole = TenantMember["role"];

// ─── Field type enum literal ────────────────────────────────────────────────

export type FieldType = FieldDefinition["fieldType"];

// ─── Scan mode ───────────────────────────────────────────────────────────────

export type ScanMode = Tenant["scanMode"];

// ─── Log type ────────────────────────────────────────────────────────────────

export type LogType = ActionLog["logType"];

// ─── Lifecycle status ────────────────────────────────────────────────────────

/**
 * Lifecycle status shared by cards and card types.
 * `expired` is reachable on cards only — `card_types` carries a CHECK
 * constraint forbidding it.
 */
export type LifecycleStatus = Card["status"];

// ─── Tenant inputs ──────────────────────────────────────────────────────────

export interface CreateTenantInput {
  name: string;
}

export interface UpdateTenantInput {
  name?: string;
  /** Object key of the tenant logo in the photo storage bucket (or null to clear). */
  logoObjectKey?: string | null;
}

/** Settings the master can configure for their tenant. */
export interface UpdateTenantSettingsInput {
  scanMode?: ScanMode;
  /**
   * Days an archived card / card type stays in the trash before the purge job
   * deletes it permanently. Validated to 1..365 at the action boundary.
   */
  archiveRetentionDays?: number;
}

// ─── CardType inputs ────────────────────────────────────────────────────────

export interface CreateCardTypeInput {
  name: string;
  description?: string;
  /** Optional initial field definitions to create in the same transaction. */
  fieldDefinitions?: CreateFieldDefinitionInput[];
}

/**
 * Descriptive updates only. Lifecycle status is not settable here — it goes
 * through `src/lib/server/lifecycle/card-types.ts`.
 */
export interface UpdateCardTypeInput {
  name?: string;
  description?: string | null;
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

/** @deprecated Use FieldFilterOperator — kept for Zod schema backwards compat */
export type SearchOperator = FieldFilterOperator;

export interface SearchFilter {
  fieldDefinitionIds: string[];
  operator: FieldFilterOperator;
  value: unknown;
}

/**
 * Lifecycle status filter for card search.
 * `archived` is intentionally absent — archived cards never appear in search
 * (the `notArchived` scope always applies). `inactive` groups `inactive` +
 * `expired`, which behave identically. `all` (the default) imposes no filter.
 */
export type CardSearchStatus = "all" | "active" | "inactive";

export interface SearchCardsInput {
  /** Optional partial match on card code. */
  codeContains?: string;
  /** Dynamic field filters. */
  filters?: SearchFilter[];
  /** Lifecycle status filter. Defaults to `all` when omitted. */
  status?: CardSearchStatus;
}

// ─── Archived (trash) views — phase 4 ────────────────────────────────────────

/**
 * One archived card as shown in the trash view.
 *
 * `id` is the internal UUID, carried ONLY as the argument for the restore /
 * purge Server Actions — it is never displayed nor placed in a URL. The
 * displayed identifier is `code` (constraint: card UUIDs are not exposed).
 */
export interface ArchivedCardListItem {
  id: string;
  code: string;
  cardTypeName: string;
  archivedAt: Date;
  /** Resolved name of the user who archived it; null if that user was removed. */
  archivedByName: string | null;
  /**
   * True when the card was dragged into the trash by archiving its card type.
   * Such a card cannot be restored until its type is restored first.
   */
  archivedViaType: boolean;
}

/** One archived card type as shown in the trash view. */
export interface ArchivedCardTypeListItem {
  id: string;
  name: string;
  /** How many cards a hard delete would cascade away (every card of the type). */
  cardCount: number;
  archivedAt: Date;
  /** Resolved name of the user who archived it; null if that user was removed. */
  archivedByName: string | null;
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
  /**
   * When true, the action is executed despite error-level validation failures.
   * Logged in action_log metadata as { operator_override: true }.
   */
  operatorOverride?: boolean;
  /** Error messages being overridden — stored in metadata for audit trail. */
  overrideValidationErrors?: string[];
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
  /** The card that was scanned (final state after all auto-actions). */
  card: CardWithFields;
  /** Initial scan validation result at scan time, before any auto-actions ran. */
  scanResult: import("@/lib/validation/scan-validator").ScanValidationResult;
  /** Results of each auto-execute action that was attempted. */
  autoActions: AutoActionResult[];
  /**
   * True if the auto-action loop was stopped because re-validation after an
   * action produced error-level failures. Also true if initial validation
   * had blocking errors (in which case autoActions is empty).
   */
  stoppedByValidation: boolean;
  /** Name of the action at which the loop stopped (validation or execution error). */
  stoppedAtAction: string | null;
  /**
   * Validation state after the last executed auto-action.
   * Equals scanResult when no auto-actions ran (e.g. initial blocking errors).
   */
  finalValidationResult: import("@/lib/validation/scan-validator").ScanValidationResult;
  /**
   * True if finalValidationResult contains error-level failures.
   * When true, the dashboard disables manual action buttons (unless override is enabled).
   */
  hasBlockingErrors: boolean;

  // ── Pause/resume fields ────────────────────────────────────────────────────

  /**
   * True when allow_override_on_error is enabled and the loop paused because
   * of error-level failures. The client should show AutoActionConfirmModal.
   * False when no pause was needed or override is disabled.
   */
  pausedForConfirmation: boolean;
  /**
   * IDs of action definitions not yet executed (to resume from).
   * Null when pausedForConfirmation is false.
   */
  pendingAutoActionIds: string[] | null;
  /**
   * Human-readable names of pending actions (for modal display).
   * Null when pausedForConfirmation is false.
   */
  pendingAutoActionNames: string[] | null;
  /**
   * Error-level checks that caused the pause (for modal display).
   * Null when pausedForConfirmation is false.
   */
  pauseValidationErrors: import("@/lib/validation/scan-validator").ScanValidationCheck[] | null;

  /**
   * Verdict of the lifecycle gate evaluated once at scan time (phase 2).
   * `allowed` for active cards; `requires_override` / `blocked` for
   * inactive/expired cards; `denied_archived` for archived cards. Drives the
   * operational surface colour and whether manual actions are offered. The
   * override machinery above (`pausedForConfirmation`, `hasBlockingErrors`) is
   * reused for the off-states, so consumers only special-case `denied_archived`.
   */
  lifecycleGate: import("@/lib/server/lifecycle/scan-gate").LifecycleGateResult;
}

/** Result returned by validateBeforeActionAction. */
export interface ValidateBeforeActionResult {
  scanResult: import("@/lib/validation/scan-validator").ScanValidationResult;
  /** True if any error-level validation fails on the card's current state. */
  hasBlockingErrors: boolean;
  /**
   * Verdict of the lifecycle gate for the card being acted upon (phase 2). Lets
   * the client pre-empt a denied/blocked action or open the override modal for a
   * switched-off card before invoking the mutating action.
   */
  lifecycleGate: import("@/lib/server/lifecycle/scan-gate").LifecycleGateResult;
}

/** Input for resumeAutoActionsAction — continues a paused auto-action flow. */
export interface ResumeAutoActionsInput {
  /** Card's public code (NOT uuid). */
  cardCode: string;
  /** action_definition IDs to execute in order (from pendingAutoActionIds). */
  pendingActionIds: string[];
  /** Error messages being overridden — stored in each action's metadata. */
  overrideValidationErrors: string[];
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
  userUsername: string | null;
  /** Object key of the user's avatar (Better Auth `user.image` column). */
  userImage: string | null;
}

/** Invitation row enriched with the inviter's name. */
export interface InvitationWithInviter extends MemberInvitation {
  inviterName: string;
}

/** Input for updating a member's Better Auth user profile. */
export interface UpdateMemberProfileInput {
  name?: string;
  email?: string;
}

/** Input for creating a member invitation. */
export interface CreateInvitationInput {
  email: string;
  role: TenantRole;
  invitedByUserId: string;
  token: string;
  expiresAt: Date;
}

// ─── Card Design inputs ───────────────────────────────────────────────────────

export type DesignKind = CardDesign["kind"];
export type DimensionUnit = CardDesign["unit"];

export interface CreateCardDesignInput {
  name: string;
  description?: string | null;
  kind: DesignKind;
  widthUnits: number;
  heightUnits: number;
  unit: DimensionUnit;
}

export interface UpdateCardDesignInput {
  name?: string;
  description?: string | null;
  widthUnits?: number;
  heightUnits?: number;
  unit?: DimensionUnit;
  layout?: Record<string, unknown>;
}

export interface ListCardDesignsOptions {
  kind?: DesignKind;
}

/** Result of validateDesignAgainstCardType. */
export interface CardDesignValidationResult {
  ok: boolean;
  /** Field definition IDs referenced in the layout that are missing or incompatible. */
  missingFieldBindings: string[];
}

// ─── Dashboard Settings inputs ───────────────────────────────────────────────

export interface UpsertDashboardSettingsInput {
  feedLimit?: number;
  showScanEntries?: boolean;
  showActionEntries?: boolean;
  /** When true, operators can override error-level validation failures via modal confirmation. */
  allowOverrideOnError?: boolean;
}

// ─── Card Type Summary Fields inputs ─────────────────────────────────────────

export interface SetCardTypeSummaryFieldsInput {
  /** Ordered list of fieldDefinitionIds to show in the activity feed summary. */
  fieldDefinitionIds: string[];
}

// ─── Activity Feed ───────────────────────────────────────────────────────────

/** A single entry in the operational dashboard activity feed. */
/**
 * One configured summary field of a card type, without any card's value.
 * Shipped to the dashboard client so it can build feed rows for its own scans
 * locally. See `getFeedSummaryFieldConfig`.
 */
export interface FeedSummaryFieldConfig {
  fieldDefinitionId: string;
  label: string;
  fieldType: ActivityFeedSummaryField["fieldType"];
}

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
  /**
   * Route serving the card's primary photo (lowest-position active photo
   * field), or null when the card type has no photo field or none was uploaded.
   * Stable per card and session-authenticated — NOT a signed storage URL. See
   * `cardPhotoRoute` in `src/lib/storage/photo-routes.ts`.
   */
  cardPhotoUrl: string | null;
  executedAt: Date;
  executedBy: string | null;
  metadata: unknown;
  /**
   * True when the action was executed with error-level validation failures
   * present (operator chose to override). Extracted from metadata.operator_override.
   */
  operatorOverride: boolean;
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

// ─── Action History ───────────────────────────────────────────────────────────

export type FieldFilterOperator =
  | 'contains' | 'starts_with' | 'equals_text'
  | 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'between'
  | 'is_true' | 'is_false'
  | 'date_eq' | 'date_before' | 'date_after' | 'date_between';

export interface FieldFilter {
  fieldDefinitionIds: string[];
  operator: FieldFilterOperator;
  /** Scalar for most operators. { min, max } for 'between' / 'date_between'. */
  value: unknown;
}

export interface ActionHistoryFilters {
  dateFrom?: Date;
  dateTo?: Date;
  logTypes?: ('scan' | 'action')[];
  cardTypeIds?: string[];
  actionDefinitionIds?: string[];
  executedBy?: string;
  cardCode?: string;
  /** Requires cardTypeIds to be set (non-empty). Ignored otherwise. */
  fieldFilters?: FieldFilter[];
}

export interface ActionHistoryEntry {
  id: string;
  logType: 'scan' | 'action';
  cardId: string;
  cardCode: string;
  cardTypeId: string;
  cardTypeName: string;
  actionDefinitionId: string | null;
  actionName: string | null;
  actionColor: string | null;
  actionIcon: string | null;
  executedAt: Date;
  executedBy: string | null;
  executedByName: string | null;
  metadata: Record<string, unknown> | null;
  operatorOverride: boolean;
  summaryFields: { label: string; value: unknown; fieldType: FieldType }[];
}

export interface HistoryFilterOptions {
  cardTypes: { id: string; name: string }[];
  actionDefinitions: { id: string; name: string; cardTypeId: string; cardTypeName: string }[];
  users: { id: string; name: string }[];
}

export interface FilterableFieldDefinition {
  id: string;
  name: string;
  label: string;
  fieldType: FieldType;
  validationRules: unknown | null;
}

/**
 * A "common" field that appears (same name + fieldType) across one or more
 * card types. Used by FieldFilterBuilder to support multi-type filtering.
 *
 * fieldDefinitionIds contains one UUID per card type that has this field,
 * in the same order as the cardTypeIds input to getCommonFieldDefinitions().
 */
export interface CommonFieldDefinition {
  name: string;
  label: string;
  fieldType: FieldType;
  validationRules: unknown | null;
  /** One field definition ID per card type that has this field. */
  fieldDefinitionIds: string[];
}

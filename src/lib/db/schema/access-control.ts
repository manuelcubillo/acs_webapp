/**
 * Access Control Schema
 *
 * Multi-tenant access control system with dynamic card types.
 * Each tenant defines card types (templates) with configurable field definitions.
 * Cards (issued credentials) hold typed field values per definition.
 * Actions (e.g. guest entry/exit) are logged per card.
 *
 * Design decisions:
 * - field_values uses separate typed columns (value_text, value_number, etc.)
 *   to preserve type integrity at the database level.
 * - field_definitions are soft-deleted (is_active = false), never hard-deleted,
 *   to maintain referential integrity with existing field_values.
 * - Photos are stored as URL references in value_text.
 * - field_type cannot be changed once field_values exist for that definition.
 */

import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  integer,
  doublePrecision,
  jsonb,
  uuid,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

// ─── Enums ───────────────────────────────────────────────────────────────────

/** Available field types for dynamic card definitions */
export const fieldTypeEnum = pgEnum("field_type", [
  "text",
  "number",
  "boolean",
  "date",
  "photo",
  "select",
]);

/**
 * Types of actions that can be performed on a card.
 * Each type operates on a specific target field:
 *   - increment / decrement → numeric fields
 *   - check / uncheck       → boolean fields
 */
export const actionTypeEnum = pgEnum("action_type", [
  "increment",
  "decrement",
  "check",
  "uncheck",
]);

/** Lifecycle status of an issued card */
export const cardStatusEnum = pgEnum("card_status", [
  "active",
  "inactive",
  "suspended",
  "expired",
]);

/**
 * Role a user holds within a tenant.
 * Roles are strictly hierarchical: master > admin > operator.
 * - operator: read-only + execute actions.
 * - admin: operator + create/edit/delete cards.
 * - master: admin + tenant configuration (card types, fields, action defs, members).
 */
export const tenantRoleEnum = pgEnum("tenant_role", [
  "operator",
  "admin",
  "master",
]);

/**
 * Scan mode configures how operators scan card codes.
 * - camera: device camera (QR/barcode via html5-qrcode).
 * - external_reader: USB/Bluetooth barcode reader (acts as keyboard).
 * - both: allow either method.
 */
export const scanModeEnum = pgEnum("scan_mode", [
  "camera",
  "external_reader",
  "both",
]);

/**
 * Type of entry in the action_logs table.
 * - scan:   A card was scanned (no field mutation). Logged for activity feed.
 * - action: An action was executed on a card (field mutation occurred).
 */
export const logTypeEnum = pgEnum("log_type", ["scan", "action"]);

// ─── Tenants ─────────────────────────────────────────────────────────────────

/** Organization or client that owns card types and cards */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Preferred card scanning method for all operators of this tenant. */
  scanMode: scanModeEnum("scan_mode").notNull().default("both"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Card Types ──────────────────────────────────────────────────────────────

/** Template defining a type of card (e.g. "Employee Badge", "Visitor Pass") */
export const cardTypes = pgTable(
  "card_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("card_types_tenant_id_idx").on(table.tenantId)],
);

// ─── Field Definitions ───────────────────────────────────────────────────────

/**
 * Configurable field schema for a card type.
 * Defines what data each card of this type collects.
 *
 * Soft-deleted via is_active flag — never hard-deleted to preserve
 * referential integrity with existing field_values.
 */
export const fieldDefinitions = pgTable(
  "field_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardTypeId: uuid("card_type_id")
      .notNull()
      .references(() => cardTypes.id, { onDelete: "cascade" }),
    /** Internal identifier (snake_case recommended) */
    name: text("name").notNull(),
    /** User-facing display label */
    label: text("label").notNull(),
    fieldType: fieldTypeEnum("field_type").notNull(),
    isRequired: boolean("is_required").notNull().default(false),
    /** Display order within the card type form */
    position: integer("position").notNull().default(0),
    /** Default value as text (parsed according to field_type at runtime) */
    defaultValue: text("default_value"),
    /**
     * Validation constraints as JSON.
     * Examples:
     *   text:   { minLength: 2, maxLength: 100, pattern: "^[A-Z]" }
     *   number: { min: 0, max: 999 }
     *   select: { options: ["A", "B", "C"] }
     */
    validationRules: jsonb("validation_rules"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("field_definitions_card_type_id_idx").on(table.cardTypeId),
    index("field_definitions_card_type_position_idx").on(
      table.cardTypeId,
      table.position,
    ),
  ],
);

// ─── Cards ───────────────────────────────────────────────────────────────────

/**
 * An issued card (credential) belonging to a tenant, based on a card type.
 *
 * `code` is a tenant-scoped identifier that clients use to look up their cards
 * (e.g. badge number, employee code). It is unique within a tenant but may
 * repeat across tenants. Most queries will filter by (tenant_id, code).
 */
export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Client-facing card code, unique per tenant */
    code: text("code").notNull(),
    cardTypeId: uuid("card_type_id")
      .notNull()
      .references(() => cardTypes.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    status: cardStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    /** Primary lookup path — unique code per tenant */
    unique("cards_tenant_code_unique").on(table.tenantId, table.code),
    /** Covers most queries: search by tenant + code */
    index("cards_tenant_code_idx").on(table.tenantId, table.code),
    index("cards_tenant_id_idx").on(table.tenantId),
    index("cards_card_type_id_idx").on(table.cardTypeId),
    index("cards_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

// ─── Field Values ────────────────────────────────────────────────────────────

/**
 * Typed dynamic field values for a card.
 *
 * Only one typed column should be populated per row, matching the
 * field_type of the associated field_definition:
 *   - text / photo / select → value_text
 *   - number               → value_number
 *   - boolean              → value_boolean
 *   - date                 → value_date
 *   - complex data         → value_json
 *
 * The unique constraint on (card_id, field_definition_id) ensures
 * each card has at most one value per field definition.
 */
export const fieldValues = pgTable(
  "field_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    fieldDefinitionId: uuid("field_definition_id")
      .notNull()
      .references(() => fieldDefinitions.id, { onDelete: "restrict" }),
    valueText: text("value_text"),
    valueNumber: doublePrecision("value_number"),
    valueBoolean: boolean("value_boolean"),
    valueDate: timestamp("value_date"),
    valueJson: jsonb("value_json"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("field_values_card_field_unique").on(
      table.cardId,
      table.fieldDefinitionId,
    ),
    index("field_values_card_id_idx").on(table.cardId),
    index("field_values_field_definition_id_idx").on(table.fieldDefinitionId),
  ],
);

// ─── Action Definitions ──────────────────────────────────────────────────────

/**
 * Configurable action definitions for a card type.
 * Each action targets a specific field and modifies its value on execution.
 *
 * - increment / decrement: operate on numeric fields (config: { amount: number })
 * - check / uncheck:       operate on boolean fields (config: null)
 *
 * action_logs records the before/after values whenever an action is executed.
 *
 * isAutoExecute: when true, this action is automatically executed on every
 * operational card scan (via executeScanWithAutoActions). Useful for entry/exit
 * logging patterns where scanning implies an action (e.g. "mark attended").
 */
export const actionDefinitions = pgTable(
  "action_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardTypeId: uuid("card_type_id")
      .notNull()
      .references(() => cardTypes.id, { onDelete: "cascade" }),
    /** Button label shown to operators (e.g. "Registrar visita", "Entrada") */
    name: text("name").notNull(),
    /** Operation type — determines the field type compatibility */
    actionType: actionTypeEnum("action_type").notNull(),
    /** The field this action reads/writes. Must match actionType field type compatibility. */
    targetFieldDefinitionId: uuid("target_field_definition_id")
      .notNull()
      .references(() => fieldDefinitions.id, { onDelete: "restrict" }),
    /**
     * Action parameters.
     * increment/decrement: { amount: number } (default amount = 1)
     * check/uncheck:       null
     */
    config: jsonb("config"),
    /** lucide-react icon name for the action button (e.g. "plus", "log-in") */
    icon: text("icon"),
    /**
     * Button color key: "green" | "red" | "blue" | "orange" | "purple" | "gray"
     * Default by type: increment=blue, decrement=orange, check=green, uncheck=red
     */
    color: text("color"),
    /** Display order among action buttons for this card type */
    position: integer("position").notNull().default(0),
    /**
     * When true, this action is triggered automatically on every operational scan.
     * Only one auto-execute action per card type is recommended to avoid conflicts.
     */
    isAutoExecute: boolean("is_auto_execute").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("action_definitions_card_type_id_idx").on(table.cardTypeId),
    index("action_definitions_card_type_active_idx").on(
      table.cardTypeId,
      table.isActive,
    ),
  ],
);

// ─── Scan Validations ────────────────────────────────────────────────────────

/**
 * Rules evaluated automatically when a card is scanned.
 * They are informational only — they do NOT block action execution.
 *
 * Each rule evaluates the current value of a specific field and produces
 * an alert (error or warning) if the evaluation fails.
 *
 * Supported rules by field type:
 *   boolean: boolean_is_true | boolean_is_false
 *   number:  number_eq | number_gt | number_lt | number_gte | number_lte | number_between
 *   date:    date_before | date_after | date_equals
 */
export const scanValidations = pgTable(
  "scan_validations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardTypeId: uuid("card_type_id")
      .notNull()
      .references(() => cardTypes.id, { onDelete: "cascade" }),
    /** The field whose current value is evaluated by this rule */
    fieldDefinitionId: uuid("field_definition_id")
      .notNull()
      .references(() => fieldDefinitions.id, { onDelete: "restrict" }),
    /**
     * Rule identifier matching a key in SCAN_RULE_EVALUATORS.
     * Examples: "boolean_is_true", "number_gt", "date_after"
     */
    rule: text("rule").notNull(),
    /**
     * Rule parameter value (JSONB).
     * null for boolean rules.
     * { target: number } for number_eq/gt/lt/gte/lte.
     * { min: number, max: number } for number_between.
     * { target: string } or { relative: "today" } for date rules.
     */
    value: jsonb("value"),
    /** Message shown to the operator when this validation fails */
    errorMessage: text("error_message").notNull(),
    /** "error" (red, serious problem) | "warning" (yellow, informational) */
    severity: text("severity").notNull().default("error"),
    /** Evaluation order; lower runs first */
    position: integer("position").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("scan_validations_card_type_id_idx").on(table.cardTypeId),
    index("scan_validations_card_type_active_idx").on(
      table.cardTypeId,
      table.isActive,
    ),
  ],
);

// ─── Action Logs ─────────────────────────────────────────────────────────────

/**
 * Immutable audit log of actions performed on cards and operational card scans.
 *
 * Two entry types distinguished by log_type:
 *   - "scan":   An operational card scan (no field mutation). actionDefinitionId is null.
 *   - "action": An action was executed (field mutation). actionDefinitionId references the definition.
 *
 * tenant_id is denormalized here for efficient tenant-scoped feed queries
 * without requiring a JOIN through cards.
 */
export const actionLogs = pgTable(
  "action_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The tenant this log entry belongs to (denormalized for query efficiency). */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    /**
     * References the action definition that was executed.
     * Null for log_type = "scan" (no action was executed, only a scan).
     */
    actionDefinitionId: uuid("action_definition_id").references(
      () => actionDefinitions.id,
      { onDelete: "restrict" },
    ),
    /** Distinguishes scan-only entries from action execution entries. */
    logType: logTypeEnum("log_type").notNull().default("action"),
    executedAt: timestamp("executed_at").notNull().defaultNow(),
    /** User who performed the action (references auth user table) */
    executedBy: text("executed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    /** Additional context captured at execution time */
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("action_logs_tenant_id_idx").on(table.tenantId),
    index("action_logs_card_id_idx").on(table.cardId),
    index("action_logs_action_definition_id_idx").on(table.actionDefinitionId),
    index("action_logs_executed_at_idx").on(table.executedAt),
    index("action_logs_tenant_log_type_idx").on(table.tenantId, table.logType),
    index("action_logs_tenant_executed_at_idx").on(
      table.tenantId,
      table.executedAt,
    ),
  ],
);

// ─── Tenant Members ───────────────────────────────────────────────────────────

/**
 * Association between a user and a tenant with an assigned role.
 *
 * A user can belong to multiple tenants (one row per membership).
 * The unique constraint on (tenant_id, user_id) ensures a user cannot have
 * two simultaneous memberships in the same tenant.
 *
 * Business rules enforced at the application layer:
 * - At least one active master must always exist per tenant.
 * - A master cannot remove their own master role if they are the last one.
 */
export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** References the Better Auth user table. */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: tenantRoleEnum("role").notNull().default("operator"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    /** A user can only have one membership per tenant. */
    unique("tenant_members_tenant_user_unique").on(table.tenantId, table.userId),
    index("tenant_members_tenant_id_idx").on(table.tenantId),
    index("tenant_members_user_id_idx").on(table.userId),
  ],
);

// ─── Dashboard Settings ───────────────────────────────────────────────────────

/**
 * Per-tenant dashboard configuration.
 * One row per tenant (upserted on save).
 * Controls what is displayed on the operational dashboard:
 *   - feedLimit:          number of recent activity entries shown.
 *   - showScanEntries:    include scan-only log entries in the feed.
 *   - showActionEntries:  include action execution entries in the feed.
 */
export const dashboardSettings = pgTable("dashboard_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** Maximum number of entries shown in the activity feed. */
  feedLimit: integer("feed_limit").notNull().default(20),
  /** Whether scan-only entries appear in the feed. */
  showScanEntries: boolean("show_scan_entries").notNull().default(true),
  /** Whether action entries appear in the feed. */
  showActionEntries: boolean("show_action_entries").notNull().default(true),
  /**
   * When true, operators may execute actions on cards that have error-level
   * validation failures, after confirming via a modal. Each override is
   * recorded in the action_log metadata as operator_override: true.
   */
  allowOverrideOnError: boolean("allow_override_on_error").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Card Type Summary Fields ──────────────────────────────────────────────────

/**
 * Configures which field values are shown in the dashboard activity feed
 * summary for cards of each type.
 *
 * Masters can choose up to N fields (typically 2-3) from a card type's
 * active field definitions. Those values will be surfaced inline on
 * each activity feed entry so operators can identify the card at a glance.
 *
 * The (card_type_id, field_definition_id) pair is unique to prevent duplicates.
 */
export const cardTypeSummaryFields = pgTable(
  "card_type_summary_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    cardTypeId: uuid("card_type_id")
      .notNull()
      .references(() => cardTypes.id, { onDelete: "cascade" }),
    fieldDefinitionId: uuid("field_definition_id")
      .notNull()
      .references(() => fieldDefinitions.id, { onDelete: "cascade" }),
    /** Display order within the summary row. */
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("card_type_summary_fields_unique").on(
      table.cardTypeId,
      table.fieldDefinitionId,
    ),
    index("card_type_summary_fields_tenant_id_idx").on(table.tenantId),
    index("card_type_summary_fields_card_type_id_idx").on(table.cardTypeId),
  ],
);

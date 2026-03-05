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

/** Types of actions that can be performed on a card */
export const actionTypeEnum = pgEnum("action_type", [
  "guest_entry",
  "guest_exit",
]);

/** Lifecycle status of an issued card */
export const cardStatusEnum = pgEnum("card_status", [
  "active",
  "inactive",
  "suspended",
  "expired",
]);

// ─── Tenants ─────────────────────────────────────────────────────────────────

/** Organization or client that owns card types and cards */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
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

/** An issued card (credential) belonging to a tenant, based on a card type */
export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
 * Configurable action types for a card type.
 * Currently supports guest_entry and guest_exit, which render
 * action buttons when a card is scanned.
 */
export const actionDefinitions = pgTable(
  "action_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardTypeId: uuid("card_type_id")
      .notNull()
      .references(() => cardTypes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    actionType: actionTypeEnum("action_type").notNull(),
    /** Extensible configuration (e.g. button color, confirmation message) */
    config: jsonb("config"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("action_definitions_card_type_id_idx").on(table.cardTypeId),
  ],
);

// ─── Action Logs ─────────────────────────────────────────────────────────────

/** Immutable audit log of actions performed on cards */
export const actionLogs = pgTable(
  "action_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    actionDefinitionId: uuid("action_definition_id")
      .notNull()
      .references(() => actionDefinitions.id, { onDelete: "restrict" }),
    executedAt: timestamp("executed_at").notNull().defaultNow(),
    /** User who performed the action (references auth user table) */
    executedBy: text("executed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    /** Additional context captured at execution time */
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("action_logs_card_id_idx").on(table.cardId),
    index("action_logs_action_definition_id_idx").on(table.actionDefinitionId),
    index("action_logs_executed_at_idx").on(table.executedAt),
  ],
);

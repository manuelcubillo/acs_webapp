/**
 * Drizzle Relations
 *
 * Defines relational mappings for Drizzle's relational query API (db.query.*).
 * These do not create SQL constraints — they enable type-safe eager loading
 * with the `with` clause in Drizzle queries.
 */

import { relations } from "drizzle-orm";
import { user, session, account } from "./auth";
import {
  tenants,
  cardTypes,
  fieldDefinitions,
  cards,
  fieldValues,
  actionDefinitions,
  actionLogs,
  scanValidations,
  dashboardSettings,
  cardTypeSummaryFields,
} from "./access-control";

// ─── Auth Relations ──────────────────────────────────────────────────────────

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  /** Actions performed by this user across all tenants */
  executedActionLogs: many(actionLogs),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

// ─── Tenant Relations ────────────────────────────────────────────────────────

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  cardTypes: many(cardTypes),
  cards: many(cards),
  actionLogs: many(actionLogs),
  dashboardSettings: one(dashboardSettings, {
    fields: [tenants.id],
    references: [dashboardSettings.tenantId],
  }),
  cardTypeSummaryFields: many(cardTypeSummaryFields),
}));

// ─── Card Type Relations ─────────────────────────────────────────────────────

export const cardTypesRelations = relations(cardTypes, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [cardTypes.tenantId],
    references: [tenants.id],
  }),
  fieldDefinitions: many(fieldDefinitions),
  cards: many(cards),
  actionDefinitions: many(actionDefinitions),
  scanValidations: many(scanValidations),
  summaryFields: many(cardTypeSummaryFields),
}));

// ─── Field Definition Relations ──────────────────────────────────────────────

export const fieldDefinitionsRelations = relations(
  fieldDefinitions,
  ({ one, many }) => ({
    cardType: one(cardTypes, {
      fields: [fieldDefinitions.cardTypeId],
      references: [cardTypes.id],
    }),
    fieldValues: many(fieldValues),
    actionDefinitions: many(actionDefinitions),
    scanValidations: many(scanValidations),
    summaryFields: many(cardTypeSummaryFields),
  }),
);

// ─── Card Relations ──────────────────────────────────────────────────────────

export const cardsRelations = relations(cards, ({ one, many }) => ({
  cardType: one(cardTypes, {
    fields: [cards.cardTypeId],
    references: [cardTypes.id],
  }),
  tenant: one(tenants, {
    fields: [cards.tenantId],
    references: [tenants.id],
  }),
  fieldValues: many(fieldValues),
  actionLogs: many(actionLogs),
}));

// ─── Field Value Relations ───────────────────────────────────────────────────

export const fieldValuesRelations = relations(fieldValues, ({ one }) => ({
  card: one(cards, {
    fields: [fieldValues.cardId],
    references: [cards.id],
  }),
  fieldDefinition: one(fieldDefinitions, {
    fields: [fieldValues.fieldDefinitionId],
    references: [fieldDefinitions.id],
  }),
}));

// ─── Action Definition Relations ─────────────────────────────────────────────

export const actionDefinitionsRelations = relations(
  actionDefinitions,
  ({ one, many }) => ({
    cardType: one(cardTypes, {
      fields: [actionDefinitions.cardTypeId],
      references: [cardTypes.id],
    }),
    targetField: one(fieldDefinitions, {
      fields: [actionDefinitions.targetFieldDefinitionId],
      references: [fieldDefinitions.id],
    }),
    actionLogs: many(actionLogs),
  }),
);

// ─── Scan Validation Relations ───────────────────────────────────────────────

export const scanValidationsRelations = relations(scanValidations, ({ one }) => ({
  cardType: one(cardTypes, {
    fields: [scanValidations.cardTypeId],
    references: [cardTypes.id],
  }),
  fieldDefinition: one(fieldDefinitions, {
    fields: [scanValidations.fieldDefinitionId],
    references: [fieldDefinitions.id],
  }),
}));

// ─── Action Log Relations ────────────────────────────────────────────────────

export const actionLogsRelations = relations(actionLogs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [actionLogs.tenantId],
    references: [tenants.id],
  }),
  card: one(cards, {
    fields: [actionLogs.cardId],
    references: [cards.id],
  }),
  /**
   * Nullable relation — only populated for log_type = "action" entries.
   * Scan-only entries have actionDefinitionId = null.
   */
  actionDefinition: one(actionDefinitions, {
    fields: [actionLogs.actionDefinitionId],
    references: [actionDefinitions.id],
  }),
  /** User who executed the action */
  executedByUser: one(user, {
    fields: [actionLogs.executedBy],
    references: [user.id],
  }),
}));

// ─── Dashboard Settings Relations ────────────────────────────────────────────

export const dashboardSettingsRelations = relations(
  dashboardSettings,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [dashboardSettings.tenantId],
      references: [tenants.id],
    }),
  }),
);

// ─── Card Type Summary Fields Relations ───────────────────────────────────────

export const cardTypeSummaryFieldsRelations = relations(
  cardTypeSummaryFields,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [cardTypeSummaryFields.tenantId],
      references: [tenants.id],
    }),
    cardType: one(cardTypes, {
      fields: [cardTypeSummaryFields.cardTypeId],
      references: [cardTypes.id],
    }),
    fieldDefinition: one(fieldDefinitions, {
      fields: [cardTypeSummaryFields.fieldDefinitionId],
      references: [fieldDefinitions.id],
    }),
  }),
);

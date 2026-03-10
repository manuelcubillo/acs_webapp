/**
 * Server Actions — Dashboard Settings
 *
 * Per-tenant operational dashboard configuration actions.
 * All mutations require master role.
 *
 * Role matrix:
 *   OPERATOR / ADMIN: read settings
 *   MASTER:           read + upsert settings + manage summary fields
 */

"use server";

import { z } from "zod";
import {
  actionHandler,
  requireOperator,
  requireMaster,
  type ActionResult,
} from "@/lib/api";
import {
  getDashboardSettings,
  upsertDashboardSettings,
  getSummaryFieldsForCardType,
  setCardTypeSummaryFields,
  getActivityFeed,
} from "@/lib/dal";
import type {
  DashboardSettings,
  CardTypeSummaryField,
  ActivityFeedEntry,
  ActivityFeedOptions,
} from "@/lib/dal";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const UpsertDashboardSettingsSchema = z.object({
  feedLimit: z.number().int().min(5).max(100).optional(),
  showScanEntries: z.boolean().optional(),
  showActionEntries: z.boolean().optional(),
  allowOverrideOnError: z.boolean().optional(),
});

const SetSummaryFieldsSchema = z.object({
  fieldDefinitionIds: z.array(z.string().uuid()).max(5),
});

const ActivityFeedOptionsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  includeScanEntries: z.boolean().optional(),
  includeActionEntries: z.boolean().optional(),
});

// ─── Read actions ─────────────────────────────────────────────────────────────

/**
 * Get dashboard settings for the current tenant.
 * Returns null if no settings row exists (caller should use defaults).
 * @role operator | admin | master
 */
export async function getDashboardSettingsAction(): Promise<
  ActionResult<DashboardSettings | null>
> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    return getDashboardSettings(tenantId);
  });
}

/**
 * Get summary fields configured for a card type.
 * @role operator | admin | master
 */
export async function getSummaryFieldsForCardTypeAction(
  cardTypeId: string,
): Promise<ActionResult<CardTypeSummaryField[]>> {
  return actionHandler(async () => {
    await requireOperator();
    return getSummaryFieldsForCardType(cardTypeId);
  });
}

/**
 * Get the operational dashboard activity feed for the current tenant.
 * @role operator | admin | master
 */
export async function getActivityFeedAction(
  input: unknown,
): Promise<ActionResult<ActivityFeedEntry[]>> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    const opts = ActivityFeedOptionsSchema.parse(input ?? {});
    const feedOptions: ActivityFeedOptions = {
      limit: opts.limit,
      includeScanEntries: opts.includeScanEntries,
      includeActionEntries: opts.includeActionEntries,
    };
    return getActivityFeed(tenantId, feedOptions);
  });
}

// ─── Master-only mutation actions ─────────────────────────────────────────────

/**
 * Upsert dashboard settings for the current tenant.
 * @role master
 */
export async function upsertDashboardSettingsAction(
  input: unknown,
): Promise<ActionResult<DashboardSettings>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    const data = UpsertDashboardSettingsSchema.parse(input);
    return upsertDashboardSettings(tenantId, {
      feedLimit: data.feedLimit,
      showScanEntries: data.showScanEntries,
      showActionEntries: data.showActionEntries,
      allowOverrideOnError: data.allowOverrideOnError,
    });
  });
}

/**
 * Replace the summary fields for a card type (ordered list of fieldDefinitionIds).
 * Pass an empty array to clear all summary fields for the card type.
 * @role master
 */
export async function setCardTypeSummaryFieldsAction(
  cardTypeId: string,
  input: unknown,
): Promise<ActionResult<CardTypeSummaryField[]>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    const data = SetSummaryFieldsSchema.parse(input);
    return setCardTypeSummaryFields(cardTypeId, tenantId, {
      fieldDefinitionIds: data.fieldDefinitionIds,
    });
  });
}

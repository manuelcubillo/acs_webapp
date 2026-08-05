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
  getActiveZoneFieldsForCardType,
  setCardTypeActiveZoneFields,
  getCardTypeById,
  getActivityFeed,
} from "@/lib/dal";
import { ValidationError } from "@/lib/dal/errors";
import {
  ACTIVE_ZONE_CELL_COUNT,
  validateActiveZoneLayout,
} from "@/lib/dashboard/active-zone-layout";
import type {
  DashboardSettings,
  CardTypeSummaryField,
  CardTypeActiveZoneField,
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

/**
 * One cell of the ActiveCardZone grid. Shape-level checks only — the spatial
 * rules (collisions, photo-only spans, room below) need the fields' types and
 * run in `validateActiveZoneLayout` once they have been resolved from the DB.
 */
const SetActiveZoneFieldsSchema = z.object({
  cells: z
    .array(
      z.object({
        fieldDefinitionId: z.string().uuid(),
        position: z.number().int().min(0).max(ACTIVE_ZONE_CELL_COUNT - 1),
        rowSpan: z.union([z.literal(1), z.literal(2)]),
      }),
    )
    .max(ACTIVE_ZONE_CELL_COUNT),
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
 * Get the ActiveCardZone grid layout configured for a card type.
 * @role operator | admin | master
 */
export async function getActiveZoneFieldsForCardTypeAction(
  cardTypeId: string,
): Promise<ActionResult<CardTypeActiveZoneField[]>> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    return getActiveZoneFieldsForCardType(cardTypeId, tenantId);
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

/**
 * Replace the ActiveCardZone grid layout for a card type.
 * Pass an empty `cells` array to clear it, which returns the panel to its
 * unconfigured behaviour (first fields that hold a value).
 *
 * This is the AUTHORITATIVE layout check. The editor runs the same rules from
 * `@/lib/dashboard/active-zone-layout` to keep invalid states unreachable in
 * the UI, but nothing is trusted from the client (foundation constraint #8).
 * Field types are read from the database rather than taken from the payload —
 * otherwise a caller could claim a text field is a photo and span two rows.
 *
 * `getCardTypeById` also scopes the card type to the caller's tenant, so an id
 * from another tenant throws NotFoundError before anything is written.
 *
 * @role master
 */
export async function setCardTypeActiveZoneFieldsAction(
  cardTypeId: string,
  input: unknown,
): Promise<ActionResult<CardTypeActiveZoneField[]>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    const data = SetActiveZoneFieldsSchema.parse(input);

    // Resolve the card type's active fields — both to confirm tenant ownership
    // and to get the field types the geometry rules depend on.
    const cardType = await getCardTypeById(cardTypeId, tenantId);
    const typeById = new Map(
      cardType.fieldDefinitions.map((fd) => [fd.id, fd.fieldType]),
    );

    const layout = validateActiveZoneLayout(data.cells, (id) => typeById.get(id));
    if (!layout.ok) {
      throw new ValidationError(layout.error);
    }

    return setCardTypeActiveZoneFields(cardTypeId, tenantId, {
      cells: data.cells,
    });
  });
}

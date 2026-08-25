/**
 * /settings/dashboard — Dashboard Settings
 *
 * Configure the operational dashboard: feed limit, entry type visibility,
 * and per-card-type summary fields shown in each activity feed entry.
 *
 * Auth is enforced by the parent settings/layout.tsx (admin+).
 * Write actions inside DashboardSettingsView additionally require master
 * (enforced at the server action layer via requireMaster).
 *
 * The DashboardShell wrapper is provided by settings/layout.tsx — not here.
 */

import { redirect } from "next/navigation";
import {
  requireAdmin,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/api";
import {
  getDashboardSettings,
  listCardTypes,
  getCardTypeById,
  getSummaryFieldsForCardTypes,
  getActiveZoneFieldsForCardTypes,
} from "@/lib/dal";
import { excludeSystemFields } from "@/lib/fields/system";
import DashboardSettingsView from "@/components/settings/dashboard/DashboardSettingsView";
import type {
  FieldDefinition,
  CardTypeSummaryField,
  CardTypeActiveZoneField,
} from "@/lib/dal";

export const dynamic = "force-dynamic";

export default async function DashboardSettingsPage() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireAdmin();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/dashboard");
    throw e;
  }

  const { tenantId } = context;

  // ── Data fetching (parallel where possible) ────────────────────────────────
  const [settings, cardTypes] = await Promise.all([
    getDashboardSettings(tenantId).catch(() => null),
    listCardTypes(tenantId).catch(() => []),
  ]);

  const cardTypeIds = cardTypes.map((ct) => ct.id);

  // Fetch field definitions for each card type (active fields only, sorted by position)
  const cardTypesWithFields = await Promise.all(
    cardTypes.map((ct) =>
      getCardTypeById(ct.id, tenantId).catch(() => ({
        ...ct,
        fieldDefinitions: [] as FieldDefinition[],
      })),
    ),
  );

  // Feeds BOTH pickers on this page (feed summary fields and the ActiveCardZone
  // grid). Neither is a place an operator should be able to surface a
  // server-provisioned field.
  const fieldsByCardType: Record<string, FieldDefinition[]> = {};
  for (const ct of cardTypesWithFields) {
    fieldsByCardType[ct.id] = excludeSystemFields(ct.fieldDefinitions);
  }

  // Fetch both per-card-type configurations in parallel. They feed different
  // surfaces — the feed's inline summary and the ActiveCardZone grid — and are
  // stored in separate tables on purpose. See ADR
  // 2026-08-04-active-card-summary-grid.md.
  const [summaryMap, activeZoneMap] = await Promise.all([
    getSummaryFieldsForCardTypes(cardTypeIds, tenantId).catch(
      () => new Map<string, CardTypeSummaryField[]>(),
    ),
    getActiveZoneFieldsForCardTypes(cardTypeIds, tenantId).catch(
      () => new Map<string, CardTypeActiveZoneField[]>(),
    ),
  ]);

  const summaryByCardType: Record<string, CardTypeSummaryField[]> = {};
  const activeZoneByCardType: Record<string, CardTypeActiveZoneField[]> = {};
  for (const ctId of cardTypeIds) {
    summaryByCardType[ctId] = summaryMap.get(ctId) ?? [];
    activeZoneByCardType[ctId] = activeZoneMap.get(ctId) ?? [];
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <DashboardSettingsView
      settings={settings}
      cardTypes={cardTypes}
      fieldsByCardType={fieldsByCardType}
      summaryByCardType={summaryByCardType}
      activeZoneByCardType={activeZoneByCardType}
    />
  );
}

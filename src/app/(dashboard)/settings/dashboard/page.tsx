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
} from "@/lib/dal";
import DashboardSettingsView from "@/components/settings/dashboard/DashboardSettingsView";
import type { FieldDefinition, CardTypeSummaryField } from "@/lib/dal";

export const dynamic = "force-dynamic";

export default async function DashboardSettingsPage() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireAdmin();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/dashboard");
    redirect("/login");
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

  const fieldsByCardType: Record<string, FieldDefinition[]> = {};
  for (const ct of cardTypesWithFields) {
    fieldsByCardType[ct.id] = ct.fieldDefinitions;
  }

  // Fetch configured summary fields for all card types in one query
  const summaryMap = await getSummaryFieldsForCardTypes(
    cardTypeIds,
    tenantId,
  ).catch(() => new Map<string, CardTypeSummaryField[]>());

  const summaryByCardType: Record<string, CardTypeSummaryField[]> = {};
  for (const ctId of cardTypeIds) {
    summaryByCardType[ctId] = summaryMap.get(ctId) ?? [];
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <DashboardSettingsView
      settings={settings}
      cardTypes={cardTypes}
      fieldsByCardType={fieldsByCardType}
      summaryByCardType={summaryByCardType}
    />
  );
}

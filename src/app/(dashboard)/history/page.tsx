/**
 * /history — Historial de Acciones
 *
 * Full audit log for the tenant: all scans + action executions.
 * Supports date range, card type, action, user, card-code, and field-level filters.
 * Server-renders the first page and filter options, then hydrates client-side.
 *
 * Accessible to: operator | admin | master
 */

import { redirect } from "next/navigation";
import {
  requireOperator,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/api";
import { getActionHistory, getHistoryFilterOptions, getTenantById } from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import ActionHistoryView from "@/components/history/ActionHistoryView";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireOperator();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/login");
    redirect("/login");
  }

  const { tenantId, role } = context;

  // ── Fetch initial data in parallel ────────────────────────────────────────
  const [initialData, filterOptions, tenant] = await Promise.all([
    getActionHistory(tenantId, {}, { page: 1, pageSize: 50 }).catch(() => ({
      data: [],
      total: 0,
      limit: 50,
      offset: 0,
    })),
    getHistoryFilterOptions(tenantId).catch(() => ({
      cardTypes: [],
      actionDefinitions: [],
      users: [],
    })),
    getTenantById(tenantId).catch(() => null),
  ]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardShell title="Historial de acciones" role={role} userName={tenant?.name}>
      <ActionHistoryView
        initialData={initialData}
        filterOptions={filterOptions}
      />
    </DashboardShell>
  );
}

/**
 * /dashboard — Vista Principal Operacional
 *
 * Operational dashboard: scan input, active card zone, and activity feed.
 * Server-rendered with initial data, then hydrated client-side (DashboardView).
 *
 * Accessible to: operator | admin | master
 */

import { redirect } from "next/navigation";
import {
  requireOperator,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/api";
import { getActivityFeed, getDashboardSettings, getTenantById } from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import DashboardView from "@/components/dashboard/DashboardView";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // ── Auth guard ────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireOperator();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/login");
    redirect("/login");
  }

  const { tenantId, role, userId } = context;

  // ── Data fetching (parallel) ───────────────────────────────────────────────
  const [settings, tenant] = await Promise.all([
    getDashboardSettings(tenantId).catch(() => null),
    getTenantById(tenantId).catch(() => null),
  ]);

  const feedLimit = settings?.feedLimit ?? 20;
  const showScan = settings?.showScanEntries ?? true;
  const showAction = settings?.showActionEntries ?? true;

  const initialFeedEntries = await getActivityFeed(tenantId, {
    limit: feedLimit,
    includeScanEntries: showScan,
    includeActionEntries: showAction,
  }).catch(() => []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardShell title="Vista Principal" role={role} userName={tenant?.name}>
      <DashboardView
        initialFeedEntries={initialFeedEntries}
        settings={settings}
      />
    </DashboardShell>
  );
}

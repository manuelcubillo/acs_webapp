/**
 * /dashboard — Vista Principal Operacional
 *
 * Operational dashboard: scan input, KPI strip, active card zone, activity feed.
 * Server-rendered with initial data, then hydrated client-side (DashboardView).
 *
 * Accessible to: operator | admin | master
 */

import { redirect } from "next/navigation";
import {
  requireOperator,
  getCurrentUserProfile,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/api";
import {
  getActivityFeed,
  getDashboardSettings,
  getActionHistory,
  listCardTypes,
} from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import DashboardView from "@/components/dashboard/DashboardView";
import type { DashboardKpiData } from "@/components/dashboard/DashboardKpis";

export const dynamic = "force-dynamic";

const PAGE_TITLE = "Vista Principal";

/** Midnight of the caller's day, in the server timezone (Vercel = UTC). */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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

  const { tenantId, role } = context;

  // ── Settings + current user profile (parallel) ───────────────────────────
  const [settings, userProfile] = await Promise.all([
    getDashboardSettings(tenantId).catch(() => null),
    getCurrentUserProfile(),
  ]);

  const feedLimit = settings?.feedLimit ?? 20;
  const showScan = settings?.showScanEntries ?? true;
  const showAction = settings?.showActionEntries ?? true;

  // ── Feed + KPI data (parallel) ────────────────────────────────────────────
  const today = startOfToday();

  const [initialFeedEntries, scansHistory, actionsHistory, cardTypes] = await Promise.all([
    getActivityFeed(tenantId, {
      limit: feedLimit,
      includeScanEntries: showScan,
      includeActionEntries: showAction,
    }).catch(() => []),
    getActionHistory(tenantId, { dateFrom: today, logTypes: ["scan"] }, { page: 1, pageSize: 1 })
      .catch(() => ({ data: [], total: 0, limit: 1, offset: 0 })),
    getActionHistory(tenantId, { dateFrom: today, logTypes: ["action"] }, { page: 1, pageSize: 1 })
      .catch(() => ({ data: [], total: 0, limit: 1, offset: 0 })),
    listCardTypes(tenantId).catch(() => []),
  ]);

  const SCAN_COUNT_CAP = 10000;
  const kpiData: DashboardKpiData = {
    scansToday: Math.min(scansHistory.total, SCAN_COUNT_CAP),
    scansCapped: scansHistory.total > SCAN_COUNT_CAP,
    actionsToday: Math.min(actionsHistory.total, SCAN_COUNT_CAP),
    actionsCapped: actionsHistory.total > SCAN_COUNT_CAP,
    activeCardTypes: cardTypes.length,
    lastActivityAt: initialFeedEntries[0]?.executedAt
      ? new Date(initialFeedEntries[0].executedAt)
      : null,
  };

  return (
    <DashboardShell
      title={PAGE_TITLE}
      role={role}
      userName={userProfile.name ?? undefined}
      userAvatarUrl={userProfile.avatarUrl}
    >
      <DashboardView
        initialFeedEntries={initialFeedEntries}
        settings={settings}
        allowOverrideOnError={settings?.allowOverrideOnError ?? false}
        kpiData={kpiData}
      />
    </DashboardShell>
  );
}

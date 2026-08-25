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
  getFeedSummaryFieldConfig,
  getActiveZoneFieldConfig,
  getPresenceActionIdsByCardType,
  listCardTypes,
} from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import DashboardView from "@/components/dashboard/DashboardView";
import type { DashboardKpiData } from "@/components/dashboard/DashboardKpis";
import type { ActiveZoneFieldConfig } from "@/lib/dal";
import type { FeedBuilderConfig } from "@/lib/dashboard/feed-entries";
import { feedRawBudget, DEFAULT_FEED_LIMIT } from "@/lib/dashboard/feed-grouping";

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
    throw e;
  }

  const { tenantId, role } = context;

  // ── Settings + current user profile (parallel) ───────────────────────────
  const [settings, userProfile] = await Promise.all([
    getDashboardSettings(tenantId).catch(() => null),
    getCurrentUserProfile(),
  ]);

  const feedLimit = settings?.feedLimit ?? DEFAULT_FEED_LIMIT;
  const showScan = settings?.showScanEntries ?? true;
  const showAction = settings?.showActionEntries ?? true;

  // ── Feed + KPI data (parallel) ────────────────────────────────────────────
  const today = startOfToday();

  const [
    initialFeedEntries,
    scansHistory,
    actionsHistory,
    cardTypes,
    summaryFieldConfig,
    activeZoneConfig,
    presenceActionIds,
  ] = await Promise.all([
    getActivityFeed(tenantId, {
      // A raw-row budget, not the display limit: these rows are ungrouped and
      // `ActivityFeed` cuts to `feedLimit` GROUPS once it has grouped them.
      limit: feedRawBudget(feedLimit),
      includeScanEntries: showScan,
      includeActionEntries: showAction,
    }).catch(() => []),
    getActionHistory(tenantId, { dateFrom: today, logTypes: ["scan"] }, { page: 1, pageSize: 1 })
      .catch(() => ({ data: [], total: 0, limit: 1, offset: 0 })),
    getActionHistory(tenantId, { dateFrom: today, logTypes: ["action"] }, { page: 1, pageSize: 1 })
      .catch(() => ({ data: [], total: 0, limit: 1, offset: 0 })),
    listCardTypes(tenantId).catch(() => []),
    getFeedSummaryFieldConfig(tenantId).catch(() => new Map()),
    getActiveZoneFieldConfig(tenantId).catch(() => new Map()),
    getPresenceActionIdsByCardType(tenantId).catch(() => ({})),
  ]);

  // Static per-tenant data the client needs to build feed rows for its own
  // scans without a round trip. Card type names ride along on listCardTypes,
  // already fetched for the KPI strip.
  const feedConfig: FeedBuilderConfig = {
    cardTypeNames: Object.fromEntries(cardTypes.map((t) => [t.id, t.name])),
    summaryFields: Object.fromEntries(summaryFieldConfig),
    // Lets a locally-built row know it is a presence row, so a fresh scan shows
    // "Entrada"/"Salida" immediately rather than "Presencia" until Refrescar.
    presenceActionIds,
  };

  // Per-card-type layout of the "last scanned card" panel. Static per tenant,
  // so it ships once with the page rather than being refetched per scan. Card
  // types absent from the map are unconfigured and keep the legacy panel.
  const activeCardLayouts: Record<string, ActiveZoneFieldConfig[]> =
    Object.fromEntries(activeZoneConfig);

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
        feedConfig={feedConfig}
        activeCardLayouts={activeCardLayouts}
      />
    </DashboardShell>
  );
}

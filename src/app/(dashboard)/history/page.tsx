/**
 * /history — Historial de Acciones
 *
 * Full audit log for the tenant: all scans + action executions.
 * Supports date range, card type, action, user, card-code, and field-level filters.
 *
 * The view state (filters, scan toggle, page) is read from the query string, so
 * the server renders the page the URL asks for — a shared link, a reload, and a
 * return trip from a card detail all land on the exact same result set without a
 * corrective client refetch. See `src/lib/history/filter-params.ts`.
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
import { getActionHistory, getHistoryFilterOptions } from "@/lib/dal";
import {
  parseHistoryParams,
  toEffectiveFilters,
  type HistoryRawParams,
} from "@/lib/history/filter-params";
import DashboardShell from "@/components/layout/DashboardShell";
import ActionHistoryView from "@/components/history/ActionHistoryView";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface HistoryPageProps {
  searchParams: Promise<HistoryRawParams>;
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireOperator();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/login");
    throw e;
  }

  const { tenantId, role } = context;

  // ── View state from the URL ───────────────────────────────────────────────
  const { filters, showScans, page } = parseHistoryParams(await searchParams);

  // ── Fetch initial data in parallel ────────────────────────────────────────
  const [initialData, filterOptions, userProfile] = await Promise.all([
    getActionHistory(tenantId, toEffectiveFilters(filters, showScans), {
      page,
      pageSize: PAGE_SIZE,
    }).catch(() => ({
      data: [],
      total: 0,
      limit: PAGE_SIZE,
      offset: 0,
    })),
    getHistoryFilterOptions(tenantId).catch(() => ({
      cardTypes: [],
      actionDefinitions: [],
      users: [],
    })),
    getCurrentUserProfile(),
  ]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardShell
      title="Historial de acciones"
      role={role}
      userName={userProfile.name ?? undefined}
      userAvatarUrl={userProfile.avatarUrl}
    >
      <ActionHistoryView
        initialData={initialData}
        filterOptions={filterOptions}
        initialFilters={filters}
        initialShowScans={showScans}
        initialPage={page}
      />
    </DashboardShell>
  );
}

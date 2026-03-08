"use client";

/**
 * ActivityFeed
 *
 * Displays the tenant's operational activity feed (scans + action executions)
 * on the dashboard. Supports auto-refresh via polling.
 *
 * Shows a loading skeleton on initial mount, then polls `getActivityFeedAction`
 * every `refreshIntervalMs` milliseconds to surface new events.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import ActivityFeedEntryRow from "./ActivityFeedEntryRow";
import { getActivityFeedAction } from "@/lib/actions/dashboard-settings";
import type { ActivityFeedEntry, DashboardSettings } from "@/lib/dal";

interface ActivityFeedProps {
  /** Initial entries loaded server-side for zero-flicker first paint. */
  initialEntries: ActivityFeedEntry[];
  settings: DashboardSettings | null;
  /** Polling interval in ms. Set to 0 to disable auto-refresh. */
  refreshIntervalMs?: number;
}

/** Default settings used when no row exists yet. */
const DEFAULT_SETTINGS = {
  feedLimit: 20,
  showScanEntries: true,
  showActionEntries: true,
};

export default function ActivityFeed({
  initialEntries,
  settings,
  refreshIntervalMs = 15000,
}: ActivityFeedProps) {
  const [entries, setEntries] = useState<ActivityFeedEntry[]>(initialEntries);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const feedLimit = settings?.feedLimit ?? DEFAULT_SETTINGS.feedLimit;
  const showScan = settings?.showScanEntries ?? DEFAULT_SETTINGS.showScanEntries;
  const showAction = settings?.showActionEntries ?? DEFAULT_SETTINGS.showActionEntries;

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await getActivityFeedAction({
        limit: feedLimit,
        includeScanEntries: showScan,
        includeActionEntries: showAction,
      });
      if (result.success) {
        setEntries(result.data);
        setLastRefresh(new Date());
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [feedLimit, showScan, showAction]);

  // Auto-refresh polling
  useEffect(() => {
    if (!refreshIntervalMs) return;
    intervalRef.current = setInterval(refresh, refreshIntervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh, refreshIntervalMs]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Section header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}>
            Actividad reciente
          </div>
          <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 2 }}>
            {!showScan && showAction && "Solo acciones · "}
            {showScan && !showAction && "Solo escaneos · "}
            Actualizado {lastRefresh.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={isRefreshing}
          title="Refrescar"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: isRefreshing ? "var(--color-muted)" : "var(--color-primary)",
            background: "none",
            border: "none",
            cursor: isRefreshing ? "default" : "pointer",
            padding: "4px 8px",
            borderRadius: 6,
          }}
        >
          <RefreshCw
            size={14}
            strokeWidth={2}
            style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }}
          />
          Refrescar
        </button>
      </div>

      {/* Feed entries */}
      {entries.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "48px 24px",
          background: "var(--color-subtle-bg)",
          borderRadius: 12,
          border: "1.5px dashed var(--color-border)",
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
          <div style={{ fontWeight: 600, color: "var(--color-secondary)", fontSize: 14 }}>
            Sin actividad aún
          </div>
          <div style={{ fontSize: 12.5, color: "var(--color-muted)", marginTop: 4 }}>
            Los escaneos y acciones de carnets aparecerán aquí.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((entry) => (
            <ActivityFeedEntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .feed-entry-row:hover {
          box-shadow: 0 2px 8px rgba(0,0,0,0.07);
          border-color: var(--color-primary) !important;
        }
      `}</style>
    </div>
  );
}

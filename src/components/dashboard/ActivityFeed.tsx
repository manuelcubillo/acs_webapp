"use client";

/**
 * ActivityFeed — live operational feed (scans + actions).
 *
 * Behavior preserved EXACTLY:
 *   - Server-rendered initial entries for zero-flicker first paint.
 *   - 15s polling via getActivityFeedAction (or whatever refreshIntervalMs is).
 *   - All filtering driven by dashboard settings; no changes.
 *
 * Presentation rebuilt: token-driven Card-like surface, refresh affordance on
 * the right, empty state polished.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Inbox, RefreshCw } from "lucide-react";

import ActivityFeedEntryRow from "./ActivityFeedEntryRow";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getActivityFeedAction } from "@/lib/actions/dashboard-settings";
import type { ActivityFeedEntry, DashboardSettings } from "@/lib/dal";

const TEXT = {
  HEADING:        "Actividad reciente",
  ONLY_ACTIONS:   "Solo acciones",
  ONLY_SCANS:     "Solo escaneos",
  UPDATED_PREFIX: "Actualizado",
  BTN_REFRESH:    "Refrescar",
  EMPTY_TITLE:    "Sin actividad aún",
  EMPTY_BODY:     "Los escaneos y acciones de carnets aparecerán aquí.",
} as const;

const DEFAULT_SETTINGS = {
  feedLimit: 20,
  showScanEntries: true,
  showActionEntries: true,
};

interface ActivityFeedProps {
  initialEntries: ActivityFeedEntry[];
  settings: DashboardSettings | null;
  /** Polling interval in ms. Set to 0 to disable auto-refresh. */
  refreshIntervalMs?: number;
}

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

  useEffect(() => {
    if (!refreshIntervalMs) return;
    intervalRef.current = setInterval(refresh, refreshIntervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh, refreshIntervalMs]);

  const filterHint =
    !showScan && showAction
      ? `${TEXT.ONLY_ACTIONS} · `
      : showScan && !showAction
        ? `${TEXT.ONLY_SCANS} · `
        : "";

  const updatedTime = lastRefresh.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section
      aria-label={TEXT.HEADING}
      className="flex flex-col gap-3"
    >
      <header className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-bold text-foreground">
            {TEXT.HEADING}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {filterHint}
            {TEXT.UPDATED_PREFIX} {updatedTime}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isRefreshing}
          onClick={refresh}
          aria-label={TEXT.BTN_REFRESH}
          className="gap-1.5 text-primary hover:text-primary"
        >
          <RefreshCw className={cn(isRefreshing && "animate-spin")} />
          {TEXT.BTN_REFRESH}
        </Button>
      </header>

      {entries.length === 0 ? (
        <FeedEmptyState />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.id}>
              <ActivityFeedEntryRow entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FeedEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 px-6 py-12 text-center">
      <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-card text-muted-foreground">
        <Inbox aria-hidden className="size-6" strokeWidth={1.6} />
      </div>
      <div className="font-heading text-base font-semibold text-foreground">
        {TEXT.EMPTY_TITLE}
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">
        {TEXT.EMPTY_BODY}
      </p>
    </div>
  );
}

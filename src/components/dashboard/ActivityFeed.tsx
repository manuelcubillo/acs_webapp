"use client";

/**
 * ActivityFeed — operational feed (scans + actions).
 *
 * Presentational and fully controlled: `DashboardView` owns the entries, so it
 * can append the rows a scan just produced without a round trip.
 *
 * There is NO polling. Server-built rows arrive at page load and on manual
 * refresh; everything in between the client builds itself from what the scan
 * action already returned (`src/lib/dashboard/feed-entries.ts`). A tenant runs
 * one or two dashboards at a time, so polling spent five queries and a full
 * re-serialised payload every 15s, per open dashboard, overwhelmingly to
 * discover that nothing had changed.
 *
 * The trade: rows from OTHER dashboards only appear on refresh. "Actualizado
 * HH:MM" is what makes that honest — it is the last time we asked the server.
 *
 * See ADR 2026-07-17-dashboard-feed-no-polling.md.
 */

import { Inbox, RefreshCw } from "lucide-react";

import ActivityFeedEntryRow from "./ActivityFeedEntryRow";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

interface ActivityFeedProps {
  entries: ActivityFeedEntry[];
  settings: DashboardSettings | null;
  /** Fetches server-built rows and replaces the list. */
  onRefresh: () => void;
  isRefreshing: boolean;
  /** When the server was last asked — not when a local row was appended. */
  lastRefreshedAt: Date;
}

export default function ActivityFeed({
  entries,
  settings,
  onRefresh,
  isRefreshing,
  lastRefreshedAt,
}: ActivityFeedProps) {
  const showScan = settings?.showScanEntries ?? true;
  const showAction = settings?.showActionEntries ?? true;

  const filterHint =
    !showScan && showAction
      ? `${TEXT.ONLY_ACTIONS} · `
      : showScan && !showAction
        ? `${TEXT.ONLY_SCANS} · `
        : "";

  const updatedTime = lastRefreshedAt.toLocaleTimeString("es-ES", {
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
          onClick={onRefresh}
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

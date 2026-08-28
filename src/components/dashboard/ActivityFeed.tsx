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
 * Rows arrive RAW and are grouped here, at render time — a scan absorbs the
 * auto-actions it caused, and repeated identical manual actions collapse to
 * "×N". Grouping lives here rather than in either builder because the feed is
 * built twice (server DAL + client mirror); implementing it in both would
 * guarantee two algorithms that drift. See
 * ADR 2026-08-25-feed-grouping-and-scan-correlation.md.
 *
 * The tenant's feed limit is applied here too, for the same reason: it counts
 * GROUPS ("Número de entradas a mostrar"), so it cannot be applied by a
 * producer that has not grouped yet. Producers fetch a raw budget instead. See
 * ADR 2026-08-25-feed-limit-counts-groups.md.
 *
 * See ADR 2026-07-17-dashboard-feed-no-polling.md.
 */

import { Inbox, RefreshCw } from "lucide-react";

import ActivityFeedEntryRow from "./ActivityFeedEntryRow";
import { groupFeedRows, DEFAULT_FEED_LIMIT } from "@/lib/dashboard/feed-grouping";
import { presenceDirectionLabel } from "@/lib/presence/labels";
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

  // Grouped at render, from whichever producer supplied the rows, then cut to
  // the tenant's limit — which counts GROUPS, so a "×3" run is one entry, not
  // three. Producers hand us a raw budget larger than this on purpose; the
  // surplus is what lets a group that straddles the cut resolve before it.
  const grouped = groupFeedRows(entries).slice(
    0,
    settings?.feedLimit ?? DEFAULT_FEED_LIMIT,
  );

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

      {grouped.length === 0 ? (
        <FeedEmptyState />
      ) : (
        <ul className="flex flex-col gap-2">
          {grouped.map((group) => (
            <li key={group.key}>
              <ActivityFeedEntryRow
                entry={group.entry}
                // An action that no scan absorbed renders its own badge, so it
                // needs the same derivation the absorbed ones get — otherwise a
                // manual presence toggle reads "Presencia" while the identical
                // automatic one reads "Entrada" / "Salida".
                actionLabel={
                  group.entry.logType === "action"
                    ? badgeLabel(group.entry)
                    : undefined
                }
                actionBadges={
                  group.kind === "scan" ? group.actions.map(badgeLabel) : undefined
                }
                repeatCount={group.kind === "repeat" ? group.count : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The badge text for one action row — absorbed by a scan or standing alone.
 *
 * A presence row reads "Entrada" / "Salida" via the shared derivation; every
 * other action shows its own name. The row renderer stays dumb — it is handed
 * finished strings and never reasons about presence.
 *
 * Applied to BOTH kinds on purpose: an operator correcting presence by hand
 * produces exactly the same fact as the scan-driven toggle, so it must read the
 * same in the feed.
 */
function badgeLabel(entry: ActivityFeedEntry): string {
  if (entry.isPresence && entry.presenceAfterValue !== null) {
    return presenceDirectionLabel(entry.presenceAfterValue);
  }
  return entry.actionName ?? "";
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

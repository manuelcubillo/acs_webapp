"use client";

/**
 * ActivityFeedEntryRow — one row in the operational dashboard activity feed.
 *
 * State semantics:
 *   - log_type='scan'    → --state-info icon (neutral slate). A scan is an event,
 *                          NOT an "access granted" decision. The validation result
 *                          is shown elsewhere (ActiveCardZone), not here.
 *   - log_type='action'  → --primary icon (brand). An action ran.
 *   - operatorOverride   → --state-override badge (orange). Distinct from a
 *                          warning so an override is never mistaken for an
 *                          informational note.
 */

import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { Clock, ScanLine, ShieldAlert, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ActivityFeedEntry } from "@/lib/dal";

const TEXT = {
  TAG_SCANNED:    "Escaneado",
  TAG_OVERRIDE:   "Override",
  ARIA_OVERRIDE:  "Intervención manual del operador — ejecutado con errores de validación",
  YES:            "Sí",
  NO:             "No",
  DASH:           "—",
} as const;

interface ActivityFeedEntryRowProps {
  entry: ActivityFeedEntry;
}

function formatFieldValue(value: unknown, fieldType: string): string {
  if (value === null || value === undefined) return TEXT.DASH;
  if (fieldType === "boolean") return value ? TEXT.YES : TEXT.NO;
  if (fieldType === "date" && value instanceof Date) {
    return value.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  }
  if (typeof value === "number") return value.toLocaleString("es-ES");
  return String(value);
}

export default function ActivityFeedEntryRow({ entry }: ActivityFeedEntryRowProps) {
  const isScan = entry.logType === "scan";

  const timeAgo = formatDistanceToNow(new Date(entry.executedAt), {
    addSuffix: true,
    locale: es,
  });

  return (
    <Link
      href={`/cards/${encodeURIComponent(entry.cardCode)}`}
      className={cn(
        "group flex items-start gap-3 rounded-xl border bg-card px-4 py-3 transition-shadow",
        "border-border hover:shadow-md hover:border-ring/30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      {/* Type icon */}
      <div
        aria-hidden
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border",
          isScan
            ? "bg-state-info border-state-info-border text-state-info-icon"
            : "bg-accent border-accent text-primary",
        )}
      >
        {isScan ? (
          <ScanLine className="size-4" strokeWidth={1.8} />
        ) : (
          <Zap className="size-4" strokeWidth={1.8} />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-heading text-sm font-bold text-foreground">
            {entry.cardCode}
          </span>
          <Badge variant="outline" className="bg-card text-[10px] text-muted-foreground">
            {entry.cardTypeName}
          </Badge>
          {!isScan && entry.actionName && (
            <Badge className="bg-accent text-[10px] font-semibold text-accent-foreground">
              {entry.actionName}
            </Badge>
          )}
          {entry.operatorOverride && (
            <Badge
              title={TEXT.ARIA_OVERRIDE}
              className={cn(
                "gap-1 text-[10px] font-semibold",
                "bg-state-override border-state-override-border text-state-override-foreground",
              )}
            >
              <ShieldAlert className="size-3" strokeWidth={2} />
              {TEXT.TAG_OVERRIDE}
            </Badge>
          )}
          {isScan && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-medium",
                "bg-state-info border-state-info-border text-state-info-foreground",
              )}
            >
              {TEXT.TAG_SCANNED}
            </Badge>
          )}
        </div>

        {entry.summaryFields.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            {entry.summaryFields.map((sf) => (
              <div key={sf.fieldDefinitionId} className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">{sf.label}:</span>
                <span className="text-[11px] font-semibold text-foreground/80">
                  {formatFieldValue(sf.value, sf.fieldType)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Time */}
      <div className="mt-0.5 flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
        <Clock className="size-3" strokeWidth={1.8} />
        {timeAgo}
      </div>
    </Link>
  );
}

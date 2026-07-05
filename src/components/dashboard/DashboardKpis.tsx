"use client";

/**
 * DashboardKpis — read-only operational KPIs at the top of the dashboard.
 *
 * Every value is derived from data the page.tsx already fetches — this
 * component contains zero DB calls and no behavior. It is presentation only.
 *
 * Cards (left → right):
 *   1. Scans today          — count of log_type='scan' entries today
 *   2. Actions today        — count of log_type='action' entries today
 *   3. Active card types    — count of is_active=true card types
 *   4. Last activity        — relative time of the most recent feed entry
 */

import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Clock, IdCard, ScanLine, Zap } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TEXT = {
  TITLE_SCANS:        "Escaneos hoy",
  TITLE_ACTIONS:      "Acciones hoy",
  TITLE_CARD_TYPES:   "Tipos activos",
  TITLE_LAST:         "Última actividad",
  CAPPED_SUFFIX:      "+",
  NEVER:              "Sin actividad reciente",
  HINT_SCANS:         "Eventos de escaneo registrados desde las 00:00.",
  HINT_ACTIONS:       "Acciones automáticas + manuales desde las 00:00.",
  HINT_CARD_TYPES:    "Tipos de carnets disponibles",
  HINT_LAST:          "Última entrada en el feed operacional.",
} as const;

export interface DashboardKpiData {
  /** Count of scan entries since 00:00 today, tenant-scoped. Capped at 10001. */
  scansToday: number;
  scansCapped: boolean;
  /** Count of action entries since 00:00 today, tenant-scoped. Capped at 10001. */
  actionsToday: number;
  actionsCapped: boolean;
  /** Count of active card types for the tenant. */
  activeCardTypes: number;
  /** ISO date of the most recent feed entry, or null if none. */
  lastActivityAt: Date | null;
}

interface DashboardKpisProps {
  data: DashboardKpiData;
}

export default function DashboardKpis({ data }: DashboardKpisProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        title={TEXT.TITLE_SCANS}
        value={formatCount(data.scansToday, data.scansCapped)}
        hint={TEXT.HINT_SCANS}
        accent="info"
        icon={<ScanLine />}
      />
      <KpiCard
        title={TEXT.TITLE_ACTIONS}
        value={formatCount(data.actionsToday, data.actionsCapped)}
        hint={TEXT.HINT_ACTIONS}
        accent="brand"
        icon={<Zap />}
      />
      <KpiCard
        title={TEXT.TITLE_CARD_TYPES}
        value={data.activeCardTypes.toLocaleString("es-ES")}
        hint={TEXT.HINT_CARD_TYPES}
        accent="brand"
        icon={<IdCard />}
      />
      <KpiCard
        title={TEXT.TITLE_LAST}
        value={
          data.lastActivityAt
            ? formatDistanceToNow(data.lastActivityAt, { addSuffix: true, locale: es })
            : TEXT.NEVER
        }
        hint={TEXT.HINT_LAST}
        accent="info"
        icon={<Clock />}
        small
      />
    </div>
  );
}

function formatCount(n: number, capped: boolean): string {
  const display = n.toLocaleString("es-ES");
  return capped ? `${display}${TEXT.CAPPED_SUFFIX}` : display;
}

// ─── Card ───────────────────────────────────────────────────────────────────

interface KpiCardProps {
  title: string;
  value: string;
  hint: string;
  /** "brand" = primary tint, "info" = neutral slate. Never a state hue. */
  accent: "brand" | "info";
  icon: React.ReactNode;
  /** When true, the value renders smaller — used for the "last activity" string. */
  small?: boolean;
}

function KpiCard({ title, value, hint, accent, icon, small }: KpiCardProps) {
  return (
    <Card className="gap-3 border-border py-4">
      <CardContent className="flex items-start gap-3">
        <div
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg border",
            accent === "brand"
              ? "bg-accent border-accent text-primary"
              : "bg-state-info border-state-info-border text-state-info-icon",
            "[&_svg]:size-5",
          )}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </div>
          <div
            className={cn(
              "mt-1 truncate font-heading font-bold text-foreground",
              small ? "text-base" : "text-2xl",
            )}
          >
            {value}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {hint}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

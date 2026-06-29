"use client";

/**
 * HistoryTableRow
 *
 * Single row in the action history table.
 *
 * Left-border color:
 *   - neutral for scans
 *   - action color (or type default) for actions
 *
 * Columns: Date/Time | Card Code | Card Type | Action | Executed By | Summary Fields | Details
 */

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ActionHistoryEntry } from "@/lib/dal";

const TEXT = {
  SCAN:     "Escaneo",
  ACTION:   "Acción",
  OVERRIDE: "Override",
  OVERRIDE_TITLE: "Intervención del operador — ejecutado con errores de validación",
  EMPTY:    "—",
} as const;

// ─── Color helpers ────────────────────────────────────────────────────────────
//
// The action accent color is DATA: it comes from the action definition's
// configured `color`. This is a data-driven value (like card-designs), so it is
// resolved at runtime and applied via an inline border color. Named colors map
// to design-system OKLCH variables (no hex literals); a raw value passes through.

const COLOR_VAR_MAP: Record<string, string> = {
  green:  "var(--green-600)",
  red:    "var(--red-600)",
  blue:   "var(--indigo-600)",
  orange: "var(--orange-600)",
  purple: "var(--violet-600)",
  gray:   "var(--muted-foreground)",
};

const NEUTRAL_ACCENT = "var(--muted-foreground)";

function resolveColor(color: string | null | undefined): string {
  if (!color) return NEUTRAL_ACCENT;
  return COLOR_VAR_MAP[color] ?? color;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDateTime(date: Date): { relative: string; absolute: string } {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let relative: string;
  if (seconds < 60) relative = "Ahora";
  else if (minutes < 60) relative = `Hace ${minutes}m`;
  else if (hours < 24) relative = `Hace ${hours}h`;
  else if (days < 7) relative = `Hace ${days}d`;
  else relative = date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });

  const absolute = date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return { relative, absolute };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (value instanceof Date) return value.toLocaleDateString("es-ES");
  return String(value);
}

function formatDetails(entry: ActionHistoryEntry): string {
  if (entry.logType !== "action" || !entry.metadata) return "—";
  const m = entry.metadata;
  const field = m.target_field;
  const before = m.before_value;
  const after = m.after_value;
  if (field === undefined) return "—";
  return `${field}: ${formatValue(before)} → ${formatValue(after)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface HistoryTableRowProps {
  entry: ActionHistoryEntry;
  isOdd: boolean;
}

const CELL = "border-b px-3 py-2.5 align-top text-xs leading-relaxed text-foreground";

export default function HistoryTableRow({ entry, isOdd }: HistoryTableRowProps) {
  const isScan = entry.logType === "scan";
  const accentColor = isScan ? NEUTRAL_ACCENT : resolveColor(entry.actionColor);
  const { relative, absolute } = formatDateTime(entry.executedAt);
  const details = formatDetails(entry);

  return (
    <tr
      // borderLeftColor is data-driven (action's configured color) — preserved inline.
      style={{ borderLeftColor: accentColor }}
      className={cn(
        "border-l-[3px] transition-colors hover:bg-accent/50",
        isOdd ? "bg-muted/30" : "bg-card",
      )}
    >
      {/* Date/Time */}
      <td className={CELL}>
        <div className="font-semibold text-foreground">{relative}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{absolute}</div>
      </td>

      {/* Card Code */}
      <td className={CELL}>
        <Link
          href={`/cards/${encodeURIComponent(entry.cardCode)}`}
          className="font-mono text-xs font-bold text-primary hover:underline"
        >
          {entry.cardCode}
        </Link>
      </td>

      {/* Card Type */}
      <td className={CELL}>
        <Badge variant="secondary">{entry.cardTypeName}</Badge>
      </td>

      {/* Action */}
      <td className={CELL}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            // Dot uses the same data-driven action color.
            style={{ backgroundColor: accentColor }}
            className="size-2 shrink-0 rounded-full"
          />
          <span className="font-semibold">
            {isScan ? TEXT.SCAN : (entry.actionName ?? TEXT.ACTION)}
          </span>
          {entry.operatorOverride && (
            <Badge
              title={TEXT.OVERRIDE_TITLE}
              className="bg-state-override border-state-override-border text-state-override-foreground"
            >
              <ShieldAlert strokeWidth={2} />
              {TEXT.OVERRIDE}
            </Badge>
          )}
        </div>
      </td>

      {/* Executed By */}
      <td className={CELL}>
        <span className={entry.executedByName ? "text-foreground" : "text-muted-foreground"}>
          {entry.executedByName ?? TEXT.EMPTY}
        </span>
      </td>

      {/* Summary Fields */}
      <td className={CELL}>
        {entry.summaryFields.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {entry.summaryFields.slice(0, 3).map((sf, i) => (
              <div key={i} className="text-[11px]">
                <span className="mr-1 text-muted-foreground">{sf.label}:</span>
                <span className="font-semibold">{formatValue(sf.value)}</span>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">{TEXT.EMPTY}</span>
        )}
      </td>

      {/* Details */}
      <td className={cn(CELL, "text-[11px] text-muted-foreground", !isScan && "font-mono")}>
        {details}
      </td>
    </tr>
  );
}

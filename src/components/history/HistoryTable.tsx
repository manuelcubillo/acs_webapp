"use client";

/**
 * HistoryTable
 *
 * Fixed-header scrollable table of action_log entries.
 * Left-border accent color matches the action's color (neutral for scans).
 */

import { Loader2 } from "lucide-react";
import HistoryTableRow from "./HistoryTableRow";
import { cn } from "@/lib/utils";
import type { ActionHistoryEntry } from "@/lib/dal";

const TEXT = {
  LOADING:      "Cargando…",
  EMPTY_TITLE:  "Sin resultados",
  EMPTY_BODY:   "Ajusta los filtros o amplía el rango de fechas.",
  TH_DATE:      "Fecha/Hora",
  TH_CODE:      "Código",
  TH_TYPE:      "Tipo",
  TH_ACTION:    "Acción",
  TH_OPERATOR:  "Operador",
  TH_SUMMARY:   "Resumen",
  TH_DETAIL:    "Detalle",
} as const;

interface HistoryTableProps {
  entries: ActionHistoryEntry[];
  isLoading: boolean;
}

const TH = "sticky top-0 z-1 whitespace-nowrap border-b-2 bg-muted px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground";

export default function HistoryTable({ entries, isLoading }: HistoryTableProps) {
  return (
    <div className="relative">
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/70">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4.5 animate-spin" strokeWidth={2} />
            <span className="text-sm font-semibold">{TEXT.LOADING}</span>
          </div>
        </div>
      )}

      <div className="max-h-[calc(100vh-320px)] overflow-auto rounded-xl border">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr>
              <th className={cn(TH, "w-35")}>{TEXT.TH_DATE}</th>
              <th className={cn(TH, "w-28")}>{TEXT.TH_CODE}</th>
              <th className={cn(TH, "w-30")}>{TEXT.TH_TYPE}</th>
              <th className={cn(TH, "w-45")}>{TEXT.TH_ACTION}</th>
              <th className={cn(TH, "w-32")}>{TEXT.TH_OPERATOR}</th>
              <th className={TH}>{TEXT.TH_SUMMARY}</th>
              <th className={cn(TH, "w-50")}>{TEXT.TH_DETAIL}</th>
            </tr>
          </thead>

          <tbody>
            {entries.length === 0 && !isLoading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-10 text-center text-sm text-muted-foreground"
                >
                  <div className="mb-2 text-3xl">📋</div>
                  <div className="font-semibold text-foreground">{TEXT.EMPTY_TITLE}</div>
                  <div className="mt-1 text-xs">{TEXT.EMPTY_BODY}</div>
                </td>
              </tr>
            ) : (
              entries.map((entry, i) => (
                <HistoryTableRow key={entry.id} entry={entry} isOdd={i % 2 === 1} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

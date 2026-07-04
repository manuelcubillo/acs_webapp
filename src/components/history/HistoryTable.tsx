"use client";

/**
 * HistoryTable
 *
 * Fixed-header scrollable table of action_log entries. Built on the shared
 * shadcn `Table` primitive so its container, header and row borders match the
 * card surface style used by `CardTableView` and the dashboard cards.
 * Left-border accent color matches the action's color (neutral for scans).
 */

import { Loader2 } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

// Card-style header cell. The 1px divider comes from TableHeader; the header is
// `sticky` and therefore opaque (`bg-muted`, not the /40 tint CardTableView can
// use) so scrolled rows never bleed through it.
const TH =
  "sticky top-0 z-1 bg-muted text-[11px] font-bold uppercase tracking-wide text-muted-foreground";

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

      <Table
        containerClassName="max-h-[calc(100vh-320px)] overflow-auto rounded-xl border border-border bg-card"
        className="min-w-[900px]"
      >
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(TH, "w-35")}>{TEXT.TH_DATE}</TableHead>
            <TableHead className={cn(TH, "w-28")}>{TEXT.TH_CODE}</TableHead>
            <TableHead className={cn(TH, "w-30")}>{TEXT.TH_TYPE}</TableHead>
            <TableHead className={cn(TH, "w-45")}>{TEXT.TH_ACTION}</TableHead>
            <TableHead className={cn(TH, "w-32")}>{TEXT.TH_OPERATOR}</TableHead>
            <TableHead className={TH}>{TEXT.TH_SUMMARY}</TableHead>
            <TableHead className={cn(TH, "w-50")}>{TEXT.TH_DETAIL}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {entries.length === 0 && !isLoading ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={7}
                className="px-6 py-10 text-center text-sm text-muted-foreground"
              >
                <div className="mb-2 text-3xl">📋</div>
                <div className="font-semibold text-foreground">{TEXT.EMPTY_TITLE}</div>
                <div className="mt-1 text-xs">{TEXT.EMPTY_BODY}</div>
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry, i) => (
              <HistoryTableRow key={entry.id} entry={entry} isOdd={i % 2 === 1} />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

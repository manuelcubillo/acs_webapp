"use client";

/**
 * HistoryTable
 *
 * Fixed-header scrollable table of action_log entries. Built on the shared
 * shadcn `Table` primitive so its container, header and row borders match the
 * card surface style used by `CardTableView` and the dashboard cards.
 * Left-border accent color matches the action's color (neutral for scans).
 *
 * Also the surface that restores the scroll offsets a row stored on its way to
 * a card detail — the rows scroll inside this table's own container, so the
 * offset the window carries is not the one that matters.
 */

import { useEffect, useRef } from "react";
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
import {
  consumeHistoryScroll,
  type HistoryScrollOffsets,
} from "@/lib/history/scroll-restore";
import { restorePageScroll } from "@/lib/navigation/return-scroll";
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
  /** Query string describing the current view — carried into each row's link. */
  viewQuery: string;
}

// Card-style header cell. The 1px divider comes from TableHeader; the header is
// `sticky` and therefore opaque (`bg-muted`, not the /40 tint CardTableView can
// use) so scrolled rows never bleed through it.
const TH =
  "sticky top-0 z-1 bg-muted text-[11px] font-bold uppercase tracking-wide text-muted-foreground";

export default function HistoryTable({
  entries,
  isLoading,
  viewQuery,
}: HistoryTableProps) {
  const tableRef = useRef<HTMLTableElement>(null);

  // Restore the offsets a row stored before navigating to a card detail. Runs
  // once, on mount: the entry is keyed by the query the operator left under, so
  // a plain visit — or a return to a view whose filters changed meanwhile —
  // finds nothing and opens at the top. `initialQuery` is read from a ref so
  // this never re-runs when the operator filters after coming back.
  const initialQuery = useRef(viewQuery);
  // Held in a ref because the read is destructive: in development React mounts
  // effects twice, and a plain `consume` in the effect body would hand the
  // offsets to a run that is immediately cleaned up.
  const pendingOffsets = useRef<HistoryScrollOffsets | null | undefined>(undefined);
  useEffect(() => {
    if (pendingOffsets.current === undefined) {
      pendingOffsets.current = consumeHistoryScroll(initialQuery.current);
    }
    const offsets = pendingOffsets.current;
    if (!offsets) return;
    const container = tableRef.current?.closest<HTMLElement>(
      '[data-slot="table-container"]',
    );
    // The table's own container is left alone by the router, so one frame — for
    // the rows to be laid out — is enough. The page offset has to be defended
    // against the router's scroll reset, hence the longer restore.
    requestAnimationFrame(() => {
      if (container) container.scrollTop = offsets.container;
    });
    return restorePageScroll(offsets.page);
  }, []);

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
        ref={tableRef}
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
              <HistoryTableRow
                key={entry.id}
                entry={entry}
                isOdd={i % 2 === 1}
                viewQuery={viewQuery}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

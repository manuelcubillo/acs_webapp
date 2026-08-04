"use client";

/**
 * ActionHistoryView
 *
 * Main client-side orchestrator for the /history page.
 * Manages filter state, pagination, scan toggle, and export.
 *
 * The state it owns is mirrored into the URL after every change, which is what
 * lets a row navigate to a card detail and the back link return to this exact
 * view. Mirroring uses `history.replaceState` rather than the Next router: the
 * server has already produced these rows, so a router navigation would only
 * re-fetch what is on screen. Same trade as `CardList`'s status param.
 */

import { useState, useCallback, useTransition } from "react";
import type {
  ActionHistoryFilters,
  ActionHistoryEntry,
  HistoryFilterOptions,
  PaginatedResult,
} from "@/lib/dal";
import { getActionHistoryAction } from "@/lib/actions/action-history";
import {
  buildHistoryQuery,
  toEffectiveFilters,
} from "@/lib/history/filter-params";
import HistoryFilters from "./HistoryFilters";
import HistoryScanToggle from "./HistoryScanToggle";
import HistoryTable from "./HistoryTable";
import HistoryPagination from "./HistoryPagination";
import HistoryExportButton from "./HistoryExportButton";

const PAGE_SIZE = 50;
const COUNT_CAP = 10_001;

const TEXT = {
  LOADING:  "Cargando…",
  EMPTY:    "Sin resultados",
  CAPPED:   ">10.000",
  ENTRIES:  "entradas",
} as const;

interface ActionHistoryViewProps {
  initialData: PaginatedResult<ActionHistoryEntry>;
  filterOptions: HistoryFilterOptions;
  /** View state the server rendered `initialData` with — parsed from the URL. */
  initialFilters: ActionHistoryFilters;
  initialShowScans: boolean;
  initialPage: number;
}

export default function ActionHistoryView({
  initialData,
  filterOptions,
  initialFilters,
  initialShowScans,
  initialPage,
}: ActionHistoryViewProps) {
  // ── Core state ──────────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<ActionHistoryEntry[]>(initialData.data);
  const [total, setTotal] = useState(initialData.total);
  const [page, setPage] = useState(initialPage);

  /** Filters applied (committed) — used for queries and export */
  const [appliedFilters, setAppliedFilters] =
    useState<ActionHistoryFilters>(initialFilters);

  /** Show/hide scan entries. True by default (no filter = show all) */
  const [showScans, setShowScans] = useState(initialShowScans);

  const [isPending, startTransition] = useTransition();

  // ── Fetch helper ────────────────────────────────────────────────────────────

  const fetch = useCallback(
    (filters: ActionHistoryFilters, targetPage: number) => {
      startTransition(async () => {
        const result = await getActionHistoryAction(filters, targetPage);
        if (result.success) {
          setEntries(result.data.data);
          setTotal(result.data.total);
        }
      });
    },
    [],
  );

  // ── URL mirror ──────────────────────────────────────────────────────────────

  /**
   * Reflect the committed view state in the address bar. `replaceState` keeps
   * the browser's back button pointing at the previous PAGE rather than at
   * every intermediate filter tweak, and never triggers a server round trip —
   * the rows for this state have just been fetched.
   */
  const syncUrl = useCallback(
    (filters: ActionHistoryFilters, scans: boolean, targetPage: number) => {
      if (typeof window === "undefined") return;
      const query = buildHistoryQuery({ filters, showScans: scans, page: targetPage });
      window.history.replaceState(null, "", `${window.location.pathname}${query}`);
    },
    [],
  );

  // ── Handlers ────────────────────────────────────────────────────────────────

  /** Called when the user clicks "Apply filters" */
  const handleApplyFilters = (newFilters: ActionHistoryFilters) => {
    // Preserve the scan toggle setting
    const merged = toEffectiveFilters(newFilters, showScans);
    setAppliedFilters(newFilters);
    setPage(1);
    syncUrl(newFilters, showScans, 1);
    fetch(merged, 1);
  };

  /** Called when the scan toggle changes — immediately re-fetches */
  const handleScanToggle = (show: boolean) => {
    setShowScans(show);
    const merged = toEffectiveFilters(appliedFilters, show);
    setPage(1);
    syncUrl(appliedFilters, show, 1);
    fetch(merged, 1);
  };

  /** Called when pagination changes */
  const handlePageChange = (newPage: number) => {
    const merged = toEffectiveFilters(appliedFilters, showScans);
    setPage(newPage);
    syncUrl(appliedFilters, showScans, newPage);
    fetch(merged, newPage);
  };

  // ── Effective filters (for queries & export) ─────────────────────────────────

  const effectiveFilters = toEffectiveFilters(appliedFilters, showScans);

  /**
   * The query string describing what is on screen. Rows hand it to the card
   * detail page so its back link can rebuild this view, and the scroll offsets
   * are stored against it so they are only restored into the same result set.
   */
  const viewQuery = buildHistoryQuery({ filters: appliedFilters, showScans, page });

  const isCapped = total >= COUNT_CAP;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Filter panel */}
      <HistoryFilters
        options={filterOptions}
        appliedFilters={appliedFilters}
        onApply={handleApplyFilters}
      />

      {/* Toolbar: scan toggle + entry count + export */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <HistoryScanToggle
            showScans={showScans}
            onChange={handleScanToggle}
            disabled={isPending}
          />

          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {isPending
              ? TEXT.LOADING
              : total === 0
                ? TEXT.EMPTY
                : `${isCapped ? TEXT.CAPPED : total.toLocaleString("es-ES")} ${TEXT.ENTRIES}`
            }
          </span>
        </div>

        <HistoryExportButton filters={effectiveFilters} />
      </div>

      {/* Table */}
      <HistoryTable entries={entries} isLoading={isPending} viewQuery={viewQuery} />

      {/* Pagination */}
      <HistoryPagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onChange={handlePageChange}
      />
    </div>
  );
}

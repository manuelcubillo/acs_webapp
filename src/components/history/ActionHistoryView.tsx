"use client";

/**
 * ActionHistoryView
 *
 * Main client-side orchestrator for the /history page.
 * Manages filter state, pagination, scan toggle, and export.
 */

import { useState, useCallback, useTransition } from "react";
import type {
  ActionHistoryFilters,
  ActionHistoryEntry,
  HistoryFilterOptions,
  PaginatedResult,
} from "@/lib/dal";
import { getActionHistoryAction } from "@/lib/actions/action-history";
import HistoryFilters from "./HistoryFilters";
import HistoryScanToggle from "./HistoryScanToggle";
import HistoryTable from "./HistoryTable";
import HistoryPagination from "./HistoryPagination";
import HistoryExportButton from "./HistoryExportButton";

const PAGE_SIZE = 50;
const COUNT_CAP = 10_001;

interface ActionHistoryViewProps {
  initialData: PaginatedResult<ActionHistoryEntry>;
  filterOptions: HistoryFilterOptions;
}

export default function ActionHistoryView({
  initialData,
  filterOptions,
}: ActionHistoryViewProps) {
  // ── Core state ──────────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<ActionHistoryEntry[]>(initialData.data);
  const [total, setTotal] = useState(initialData.total);
  const [page, setPage] = useState(1);

  /** Filters applied (committed) — used for queries and export */
  const [appliedFilters, setAppliedFilters] = useState<ActionHistoryFilters>({});

  /** Show/hide scan entries. True by default (no filter = show all) */
  const [showScans, setShowScans] = useState(true);

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

  // ── Handlers ────────────────────────────────────────────────────────────────

  /** Called when the user clicks "Apply filters" */
  const handleApplyFilters = (newFilters: ActionHistoryFilters) => {
    // Preserve the scan toggle setting
    const merged = buildEffectiveFilters(newFilters, showScans);
    setAppliedFilters(newFilters);
    setPage(1);
    fetch(merged, 1);
  };

  /** Called when the scan toggle changes — immediately re-fetches */
  const handleScanToggle = (show: boolean) => {
    setShowScans(show);
    const merged = buildEffectiveFilters(appliedFilters, show);
    setPage(1);
    fetch(merged, 1);
  };

  /** Called when pagination changes */
  const handlePageChange = (newPage: number) => {
    const merged = buildEffectiveFilters(appliedFilters, showScans);
    setPage(newPage);
    fetch(merged, newPage);
  };

  // ── Effective filters (for queries & export) ─────────────────────────────────

  /** Merges the base filters with the scan toggle setting */
  function buildEffectiveFilters(
    base: ActionHistoryFilters,
    scans: boolean,
  ): ActionHistoryFilters {
    if (!scans) {
      // Exclude scan-only entries; if actions already filtered keep as-is
      return {
        ...base,
        logTypes: ["action"],
      };
    }
    // Show everything — no logTypes constraint (or keep user's if they filtered)
    const { logTypes: _removed, ...rest } = base;
    return rest;
  }

  const effectiveFilters = buildEffectiveFilters(appliedFilters, showScans);

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
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        marginBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <HistoryScanToggle
            showScans={showScans}
            onChange={handleScanToggle}
            disabled={isPending}
          />

          <span style={{
            fontSize: 13,
            color: "var(--color-muted)",
            whiteSpace: "nowrap",
          }}>
            {isPending
              ? "Cargando…"
              : total === 0
                ? "Sin resultados"
                : `${isCapped ? ">10.000" : total.toLocaleString("es-ES")} entradas`
            }
          </span>
        </div>

        <HistoryExportButton filters={effectiveFilters} />
      </div>

      {/* Table */}
      <HistoryTable entries={entries} isLoading={isPending} />

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

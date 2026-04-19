"use client";

/**
 * CardList
 *
 * Client-side orchestrator for the /cards listing.
 * Manages: card type multi-select toggle, code search, field-level filters,
 * pagination, and view mode.
 * Uses searchCardsAction for all client-side data fetching.
 */

import { useState, useEffect, useCallback, useTransition } from "react";
import type {
  CardWithFields,
  FieldDefinition,
  ScanMode,
  PaginatedResult,
  FieldFilter,
  CommonFieldDefinition,
} from "@/lib/dal/types";
import { searchCardsAction } from "@/lib/actions/cards";
import { getCommonFieldDefinitionsAction } from "@/lib/actions/action-history";
import { useCardColumns } from "@/hooks/useCardColumns";
import CardSearch from "./CardSearch";
import CardTableView from "./CardTableView";
import CardProfileView from "./CardProfileView";
import CardViewToggle, { type ViewMode } from "./CardViewToggle";
import CardColumnSelector from "./CardColumnSelector";
import FieldFilterBuilder from "@/components/shared/FieldFilterBuilder";
import Pagination from "@/components/shared/Pagination";
import { Filter } from "lucide-react";

const PAGE_SIZE_TABLE = 50;
const PAGE_SIZE_GALLERY = 25;

interface CardListProps {
  initialData: PaginatedResult<CardWithFields>;
  /** Field definitions for the initially selected card type (for table columns). */
  fields: FieldDefinition[];
  /** All available card types for the multi-select toggle buttons. */
  cardTypes: { id: string; name: string }[];
  /** Initially selected card type (from URL param). */
  initialCardTypeId: string;
  scanMode: ScanMode;
  /** Initial search query (from URL param, for controlled input). */
  initialSearch?: string;
  /** Ordered field definition IDs configured as summary fields for gallery view. */
  summaryFieldIds?: string[];
}

export default function CardList({
  initialData,
  fields,
  cardTypes,
  initialCardTypeId,
  scanMode,
  initialSearch = "",
  summaryFieldIds = [],
}: CardListProps) {
  // ── Card type multi-select state ───────────────────────────────────────────
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([initialCardTypeId]);

  // ── View + column state ────────────────────────────────────────────────────
  const [view, setView] = useState<ViewMode>("table");
  const fieldIds = fields.map((f) => f.id);
  const { visibleColumns, toggleColumn, resetColumns } = useCardColumns(initialCardTypeId, fieldIds);

  // ── Result state ──────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<CardWithFields[]>(initialData.data);
  const [total, setTotal] = useState(initialData.total);
  const [currentPage, setCurrentPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  // ── Search + filter state ─────────────────────────────────────────────────
  const [codeSearch, setCodeSearch] = useState(initialSearch);
  const [fieldFilters, setFieldFilters] = useState<FieldFilter[]>([]);
  const [pendingFieldFilters, setPendingFieldFilters] = useState<FieldFilter[]>([]);
  const [filterFields, setFilterFields] = useState<CommonFieldDefinition[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // ── Page size (depends on view) ───────────────────────────────────────────
  const pageSize = view === "table" ? PAGE_SIZE_TABLE : PAGE_SIZE_GALLERY;

  // ── Load common field definitions whenever type selection changes ──────────
  useEffect(() => {
    let cancelled = false;
    getCommonFieldDefinitionsAction(selectedTypeIds).then((result) => {
      if (!cancelled && result.success) {
        setFilterFields(result.data);
        // Clear stale field filters when available fields change
        setPendingFieldFilters([]);
        setFieldFilters([]);
      }
    });
    return () => { cancelled = true; };
  }, [selectedTypeIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch helper ──────────────────────────────────────────────────────────
  const fetchCards = useCallback(
    (typeIds: string[], code: string, filters: FieldFilter[], page: number, ps: number) => {
      startTransition(async () => {
        const result = await searchCardsAction({
          cardTypeIds: typeIds,
          codeContains: code || undefined,
          filters: filters.length > 0 ? filters : undefined,
          limit: ps,
          offset: (page - 1) * ps,
        });
        if (result.success) {
          setEntries(result.data.data);
          setTotal(result.data.total);
        }
      });
    },
    [],
  );

  // ── Card type toggle ──────────────────────────────────────────────────────
  const handleTypeToggle = (typeId: string) => {
    setSelectedTypeIds((prev) => {
      const next = prev.includes(typeId)
        ? prev.filter((id) => id !== typeId)
        : [...prev, typeId];
      // Always keep at least one type selected
      if (next.length === 0) return prev;
      return next;
    });
    // Refetch is triggered by the useEffect on selectedTypeIds via the timeout below
  };

  // Refetch cards whenever selectedTypeIds changes (but not on mount — initial data is pre-loaded)
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    if (!hasMounted) { setHasMounted(true); return; }
    setCurrentPage(1);
    fetchCards(selectedTypeIds, codeSearch, [], 1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTypeIds.join(",")]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Called by CardSearch (callback mode) */
  const handleSearch = (q: string) => {
    setCodeSearch(q);
    setCurrentPage(1);
    fetchCards(selectedTypeIds, q, fieldFilters, 1, pageSize);
  };

  /** Apply field filters */
  const handleApplyFilters = () => {
    setFieldFilters(pendingFieldFilters);
    setCurrentPage(1);
    fetchCards(selectedTypeIds, codeSearch, pendingFieldFilters, 1, pageSize);
  };

  /** Clear all field filters */
  const handleClearFilters = () => {
    setPendingFieldFilters([]);
    setFieldFilters([]);
    setCurrentPage(1);
    fetchCards(selectedTypeIds, codeSearch, [], 1, pageSize);
  };

  /** Pagination */
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchCards(selectedTypeIds, codeSearch, fieldFilters, page, pageSize);
  };

  /** View mode toggle — resets to page 1 */
  const handleViewChange = (newView: ViewMode) => {
    setView(newView);
    const newPageSize = newView === "table" ? PAGE_SIZE_TABLE : PAGE_SIZE_GALLERY;
    setCurrentPage(1);
    fetchCards(selectedTypeIds, codeSearch, fieldFilters, 1, newPageSize);
  };

  const activeFilterCount = fieldFilters.length;
  const pendingFilterCount = pendingFieldFilters.length;
  const isMultiType = cardTypes.length > 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Card type multi-select toggle (only shown when >1 types exist) */}
      {isMultiType && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {cardTypes.map((ct) => {
            const selected = selectedTypeIds.includes(ct.id);
            return (
              <button
                key={ct.id}
                onClick={() => handleTypeToggle(ct.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "5px 13px",
                  borderRadius: 20,
                  border: selected
                    ? "1.5px solid var(--color-primary)"
                    : "1.5px solid var(--color-border)",
                  background: selected ? "#e0e7ff" : "#fff",
                  color: selected ? "var(--color-primary)" : "var(--color-dark)",
                  fontSize: 13,
                  fontWeight: selected ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.12s",
                  whiteSpace: "nowrap",
                }}
              >
                {ct.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <CardSearch
            scanMode={scanMode}
            defaultValue={initialSearch}
            placeholder="Buscar por código..."
            onSearch={handleSearch}
          />
        </div>

        {/* Field filter toggle */}
        {filterFields.length > 0 && (
          <button
            onClick={() => setShowFilters((v) => !v)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 14px",
              borderRadius: 8,
              border: `1.5px solid ${showFilters || activeFilterCount > 0 ? "var(--color-primary)" : "var(--color-border)"}`,
              background: showFilters || activeFilterCount > 0 ? "#e0e7ff" : "#fff",
              fontSize: 13,
              fontWeight: 600,
              color: showFilters || activeFilterCount > 0 ? "var(--color-primary)" : "var(--color-dark)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Filter size={14} strokeWidth={2} />
            Filtros
            {activeFilterCount > 0 && (
              <span style={{
                background: "var(--color-primary)",
                color: "#fff",
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 700,
                padding: "1px 6px",
                marginLeft: 2,
              }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        )}

        <CardViewToggle view={view} onChange={handleViewChange} />

        {view === "table" && (
          <CardColumnSelector
            fields={fields}
            visibleColumns={visibleColumns}
            onToggle={toggleColumn}
            onReset={resetColumns}
          />
        )}
      </div>

      {/* Field filter panel */}
      {showFilters && filterFields.length > 0 && (
        <div style={{
          background: "#f8f9fb",
          border: "1px solid var(--color-border)",
          borderRadius: 10,
          padding: "14px 16px",
        }}>
          <FieldFilterBuilder
            fields={filterFields}
            filters={pendingFieldFilters}
            onFiltersChange={setPendingFieldFilters}
          />

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={handleApplyFilters}
              disabled={isPending}
              style={{
                padding: "7px 16px",
                borderRadius: 7,
                background: "var(--color-primary)",
                color: "#fff",
                border: "none",
                fontSize: 13,
                fontWeight: 600,
                cursor: isPending ? "not-allowed" : "pointer",
                opacity: isPending ? 0.7 : 1,
              }}
            >
              Aplicar filtros
            </button>
            {pendingFilterCount > 0 && (
              <button
                onClick={handleClearFilters}
                disabled={isPending}
                style={{
                  padding: "7px 14px",
                  borderRadius: 7,
                  background: "#fff",
                  color: "#374151",
                  border: "1px solid #D1D5DB",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: isPending ? "not-allowed" : "pointer",
                }}
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Result count */}
      <p style={{ fontSize: 12, color: "var(--color-muted)", margin: 0 }}>
        {isPending
          ? "Cargando…"
          : total === 0
            ? "Sin resultados"
            : `${total.toLocaleString("es-ES")} ${total === 1 ? "carnet" : "carnets"}`
        }
      </p>

      {/* Content */}
      {view === "table" ? (
        <CardTableView
          cards={entries}
          fields={fields}
          visibleColumns={visibleColumns}
        />
      ) : (
        <CardProfileView
          cards={entries}
          fields={fields}
          summaryFieldIds={summaryFieldIds}
        />
      )}

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalItems={total}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        isLoading={isPending}
        itemLabel="carnets"
      />
    </div>
  );
}

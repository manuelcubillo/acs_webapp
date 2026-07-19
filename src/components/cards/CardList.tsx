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
import { Filter, X } from "lucide-react";

import CardSearch from "./CardSearch";
import CardStatusFilter from "./CardStatusFilter";
import CardTableView from "./CardTableView";
import CardProfileView from "./CardProfileView";
import CardViewToggle, { type ViewMode } from "./CardViewToggle";
import CardColumnSelector from "./CardColumnSelector";
import FieldFilterBuilder from "@/components/shared/FieldFilterBuilder";
import Pagination from "@/components/shared/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  CardWithFields,
  FieldDefinition,
  ScanMode,
  PaginatedResult,
  FieldFilter,
  CommonFieldDefinition,
  CardSearchStatus,
} from "@/lib/dal/types";
import { searchCardsAction } from "@/lib/actions/cards";
import { getCommonFieldDefinitionsAction } from "@/lib/actions/action-history";
import { useCardColumns } from "@/hooks/useCardColumns";

const TEXT = {
  PLACEHOLDER:    "Buscar por código…",
  BTN_FILTERS:    "Filtros",
  BTN_APPLY:      "Aplicar filtros",
  BTN_CLEAR:      "Limpiar",
  LOADING:        "Cargando…",
  EMPTY:          "Sin resultados",
  ITEM_SINGLE:    "carnet",
  ITEM_PLURAL:    "carnets",
  ALL_TYPES:      "Todos",
} as const;

const PAGE_SIZE_TABLE = 50;
const PAGE_SIZE_GALLERY = 25;

interface CardListProps {
  initialData: PaginatedResult<CardWithFields>;
  fields: FieldDefinition[];
  cardTypes: { id: string; name: string }[];
  initialCardTypeId: string;
  initialSelectedTypeIds: string[];
  scanMode: ScanMode;
  initialSearch?: string;
  initialStatus?: CardSearchStatus;
  summaryFieldIds?: string[];
}

export default function CardList({
  initialData,
  fields,
  cardTypes,
  initialCardTypeId,
  initialSelectedTypeIds,
  scanMode,
  initialSearch = "",
  initialStatus = "all",
  summaryFieldIds = [],
}: CardListProps) {
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>(initialSelectedTypeIds);
  const allTypeIds = cardTypes.map((ct) => ct.id);
  const effectiveTypeIds = selectedTypeIds.length > 0 ? selectedTypeIds : allTypeIds;

  const [view, setView] = useState<ViewMode>("table");
  const fieldIds = fields.map((f) => f.id);
  const { visibleColumns, toggleColumn, resetColumns } = useCardColumns(initialCardTypeId, fieldIds);

  const [entries, setEntries] = useState<CardWithFields[]>(initialData.data);
  const [total, setTotal] = useState(initialData.total);
  const [currentPage, setCurrentPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  const [codeSearch, setCodeSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<CardSearchStatus>(initialStatus);
  const [fieldFilters, setFieldFilters] = useState<FieldFilter[]>([]);
  const [pendingFieldFilters, setPendingFieldFilters] = useState<FieldFilter[]>([]);
  const [filterFields, setFilterFields] = useState<CommonFieldDefinition[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const pageSize = view === "table" ? PAGE_SIZE_TABLE : PAGE_SIZE_GALLERY;

  useEffect(() => {
    let cancelled = false;
    getCommonFieldDefinitionsAction(effectiveTypeIds).then((result) => {
      if (!cancelled && result.success) {
        setFilterFields(result.data);
        setPendingFieldFilters([]);
        setFieldFilters([]);
      }
    });
    return () => { cancelled = true; };
  }, [effectiveTypeIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCards = useCallback(
    (
      typeIds: string[],
      code: string,
      filters: FieldFilter[],
      page: number,
      ps: number,
      status: CardSearchStatus,
    ) => {
      startTransition(async () => {
        const result = await searchCardsAction({
          cardTypeIds: typeIds,
          codeContains: code || undefined,
          filters: filters.length > 0 ? filters : undefined,
          status,
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

  const handleTypeToggle = (typeId: string) => {
    setSelectedTypeIds((prev) =>
      prev.includes(typeId)
        ? prev.filter((id) => id !== typeId)
        : [...prev, typeId],
    );
  };

  const handleSelectAll = () => setSelectedTypeIds([]);

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    if (!hasMounted) { setHasMounted(true); return; }
    setCurrentPage(1);
    fetchCards(effectiveTypeIds, codeSearch, [], 1, pageSize, statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTypeIds.join(",")]);

  const handleSearch = (q: string) => {
    setCodeSearch(q);
    setCurrentPage(1);
    fetchCards(effectiveTypeIds, q, fieldFilters, 1, pageSize, statusFilter);
  };

  const handleStatusChange = (next: CardSearchStatus) => {
    setStatusFilter(next);
    setCurrentPage(1);
    fetchCards(effectiveTypeIds, codeSearch, fieldFilters, 1, pageSize, next);
    // Reflect the choice in the URL (shareable) without a server refetch —
    // mirrors how FlashMessage manages query params via history.replaceState.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next === "all") url.searchParams.delete("status");
      else url.searchParams.set("status", next);
      window.history.replaceState(null, "", url.toString());
    }
  };

  const handleApplyFilters = () => {
    setFieldFilters(pendingFieldFilters);
    setCurrentPage(1);
    fetchCards(effectiveTypeIds, codeSearch, pendingFieldFilters, 1, pageSize, statusFilter);
  };

  const handleClearFilters = () => {
    setPendingFieldFilters([]);
    setFieldFilters([]);
    setCurrentPage(1);
    fetchCards(effectiveTypeIds, codeSearch, [], 1, pageSize, statusFilter);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchCards(effectiveTypeIds, codeSearch, fieldFilters, page, pageSize, statusFilter);
  };

  const handleViewChange = (newView: ViewMode) => {
    setView(newView);
    const newPageSize = newView === "table" ? PAGE_SIZE_TABLE : PAGE_SIZE_GALLERY;
    setCurrentPage(1);
    fetchCards(effectiveTypeIds, codeSearch, fieldFilters, 1, newPageSize, statusFilter);
  };

  const activeFilterCount = fieldFilters.length;
  const pendingFilterCount = pendingFieldFilters.length;
  const isMultiType = cardTypes.length > 1;
  const filterButtonActive = showFilters || activeFilterCount > 0;

  return (
    <div className="flex flex-col gap-3.5">
      {/* Card type multi-select toggle */}
      {isMultiType && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={handleSelectAll}
            aria-pressed={selectedTypeIds.length === 0}
            className={cn(
              "inline-flex items-center whitespace-nowrap rounded-full border-[1.5px] px-3.5 py-1 text-sm transition-colors",
              selectedTypeIds.length === 0
                ? "border-primary bg-accent font-bold text-accent-foreground"
                : "border-border bg-card font-medium text-foreground hover:bg-muted",
            )}
          >
            {TEXT.ALL_TYPES}
          </button>
          {cardTypes.map((ct) => {
            const selected = selectedTypeIds.includes(ct.id);
            return (
              <button
                key={ct.id}
                type="button"
                onClick={() => handleTypeToggle(ct.id)}
                aria-pressed={selected}
                className={cn(
                  "inline-flex items-center whitespace-nowrap rounded-full border-[1.5px] px-3.5 py-1 text-sm transition-colors",
                  selected
                    ? "border-primary bg-accent font-bold text-accent-foreground"
                    : "border-border bg-card font-medium text-foreground hover:bg-muted",
                )}
              >
                {ct.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="min-w-[240px] flex-1">
          <CardSearch
            scanMode={scanMode}
            defaultValue={initialSearch}
            placeholder={TEXT.PLACEHOLDER}
            onSearch={handleSearch}
          />
        </div>

        <CardStatusFilter value={statusFilter} onChange={handleStatusChange} />

        {filterFields.length > 0 && (
          <Button
            type="button"
            variant={filterButtonActive ? "default" : "outline"}
            onClick={() => setShowFilters((v) => !v)}
            className="gap-1.5"
          >
            <Filter className="size-3.5" strokeWidth={2} />
            {TEXT.BTN_FILTERS}
            {activeFilterCount > 0 && (
              <Badge variant="outline" className="ml-0.5 h-5 min-w-5 px-1.5 text-[11px] font-bold">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
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
        <div className="rounded-xl border border-border bg-card p-4">
          <FieldFilterBuilder
            fields={filterFields}
            filters={pendingFieldFilters}
            onFiltersChange={setPendingFieldFilters}
          />
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              onClick={handleApplyFilters}
              disabled={isPending}
            >
              {TEXT.BTN_APPLY}
            </Button>
            {pendingFilterCount > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleClearFilters}
                disabled={isPending}
              >
                <X />
                {TEXT.BTN_CLEAR}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Result count */}
      <p className="text-xs text-muted-foreground">
        {isPending
          ? TEXT.LOADING
          : total === 0
            ? TEXT.EMPTY
            : `${total.toLocaleString("es-ES")} ${total === 1 ? TEXT.ITEM_SINGLE : TEXT.ITEM_PLURAL}`}
      </p>

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

      <Pagination
        currentPage={currentPage}
        totalItems={total}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        isLoading={isPending}
        itemLabel={TEXT.ITEM_PLURAL}
      />
    </div>
  );
}

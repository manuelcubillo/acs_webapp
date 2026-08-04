"use client";

/**
 * CardList
 *
 * Client-side orchestrator for the /cards listing.
 * Manages: card type multi-select toggle, code search, field-level filters,
 * status filter, pagination, and view mode.
 * Uses searchCardsAction for all client-side data fetching.
 *
 * The whole view is one `CardListViewState` value, mirrored into the URL after
 * every change (`history.replaceState` — no router navigation, the rows on
 * screen were just fetched). That is what makes the list shareable, reloadable,
 * and restorable when the operator opens a card and comes back: the row links
 * carry the same query string, and the mount-time scroll offset is keyed by it.
 * See `src/lib/cards/list-params.ts`.
 */

import { useState, useEffect, useMemo, useCallback, useRef, useTransition } from "react";
import { Filter, X } from "lucide-react";

import CardSearch from "./CardSearch";
import CardStatusFilter from "./CardStatusFilter";
import CardTableView from "./CardTableView";
import CardProfileView from "./CardProfileView";
import CardViewToggle, { type ViewMode } from "./CardViewToggle";
import CardColumnSelector from "./CardColumnSelector";
import { mergeFieldColumns } from "./mergeFieldColumns";
import FieldFilterBuilder from "@/components/shared/FieldFilterBuilder";
import Pagination from "@/components/shared/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildCardListQuery,
  toPagination,
  CARD_LIST_PAGE_SIZE,
  type CardListViewState,
} from "@/lib/cards/list-params";
import { consumeCardListScroll } from "@/lib/cards/scroll-restore";
import { restorePageScroll } from "@/lib/navigation/return-scroll";
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

interface CardListProps {
  initialData: PaginatedResult<CardWithFields>;
  fields: FieldDefinition[];
  cardTypes: { id: string; name: string }[];
  initialCardTypeId: string;
  /** View the server rendered — parsed from the URL, seeds every control. */
  initialState: CardListViewState;
  scanMode: ScanMode;
  summaryFieldIds?: string[];
}

export default function CardList({
  initialData,
  fields,
  cardTypes,
  initialCardTypeId,
  initialState,
  scanMode,
  summaryFieldIds = [],
}: CardListProps) {
  const [state, setState] = useState<CardListViewState>(initialState);
  // `state.search` is not destructured: the search box owns its own input value
  // (seeded once from `initialState`) and only reports committed searches back.
  const {
    cardTypeIds: selectedTypeIds,
    status: statusFilter,
    fieldFilters,
    view,
    page: currentPage,
  } = state;

  const allTypeIds = useMemo(() => cardTypes.map((ct) => ct.id), [cardTypes]);
  const effectiveTypeIds = selectedTypeIds.length > 0 ? selectedTypeIds : allTypeIds;

  const { columns: mergedFields, fieldIdToColumnId } = useMemo(
    () => mergeFieldColumns(fields),
    [fields],
  );
  const mergedSummaryFieldIds = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const id of summaryFieldIds) {
      const columnId = fieldIdToColumnId.get(id) ?? id;
      if (!seen.has(columnId)) {
        seen.add(columnId);
        result.push(columnId);
      }
    }
    return result;
  }, [summaryFieldIds, fieldIdToColumnId]);

  const fieldIds = mergedFields.map((f) => f.id);
  const { visibleColumns, toggleColumn, resetColumns } = useCardColumns(initialCardTypeId, fieldIds);

  const [entries, setEntries] = useState<CardWithFields[]>(initialData.data);
  const [total, setTotal] = useState(initialData.total);
  const [isPending, startTransition] = useTransition();

  // Draft filters — the builder's working copy, applied to the view (and so to
  // the URL) only on "Aplicar filtros".
  const [pendingFieldFilters, setPendingFieldFilters] = useState<FieldFilter[]>(
    initialState.fieldFilters,
  );
  const [filterFields, setFilterFields] = useState<CommonFieldDefinition[]>([]);
  // Open the panel when arriving with filters, so a restored view shows what it
  // is filtered by rather than just a count on a collapsed button.
  const [showFilters, setShowFilters] = useState(initialState.fieldFilters.length > 0);

  const pageSize = CARD_LIST_PAGE_SIZE[view];
  const viewQuery = useMemo(() => buildCardListQuery(state), [state]);

  // Filterable fields common to the selected types. This only refreshes the
  // builder's field list — it must not touch the filters themselves, which on
  // the first run are the ones restored from the URL. A card-type change clears
  // them in its own handler, where a filter may no longer apply.
  useEffect(() => {
    let cancelled = false;
    getCommonFieldDefinitionsAction(effectiveTypeIds).then((result) => {
      if (!cancelled && result.success) setFilterFields(result.data);
    });
    return () => { cancelled = true; };
  }, [effectiveTypeIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore the offset a card link stored on its way out. Runs once, on mount:
  // the entry is keyed by the query the operator left under, so a plain visit —
  // or a return to a view whose filters changed meanwhile — finds nothing and
  // opens at the top. Read from a ref so filtering afterwards never re-runs it.
  const mountQuery = useRef(viewQuery);
  // Held in a ref because the read is destructive: in development React mounts
  // effects twice, and a plain `consume` in the effect body would hand the
  // offset to a run that is immediately cleaned up, leaving the second run
  // nothing to restore.
  const pendingOffset = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (pendingOffset.current === undefined) {
      pendingOffset.current = consumeCardListScroll(mountQuery.current);
    }
    const offset = pendingOffset.current;
    if (offset === null) return;
    return restorePageScroll(offset);
  }, []);

  const fetchCards = useCallback(
    (next: CardListViewState) => {
      const typeIds = next.cardTypeIds.length > 0 ? next.cardTypeIds : allTypeIds;
      const { limit, offset } = toPagination(next);
      startTransition(async () => {
        const result = await searchCardsAction({
          cardTypeIds: typeIds,
          codeContains: next.search || undefined,
          filters: next.fieldFilters.length > 0 ? next.fieldFilters : undefined,
          status: next.status,
          limit,
          offset,
        });
        if (result.success) {
          setEntries(result.data.data);
          setTotal(result.data.total);
        }
      });
    },
    [allTypeIds],
  );

  /**
   * Apply a new view: render it, publish it to the URL, fetch it. Every control
   * goes through here so the three can never disagree.
   */
  const commit = useCallback(
    (next: CardListViewState) => {
      setState(next);
      if (typeof window !== "undefined") {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${buildCardListQuery(next)}`,
        );
      }
      fetchCards(next);
    },
    [fetchCards],
  );

  // A card-type change also drops the field filters: the builder offers only
  // fields common to the selected types, so a filter on a field the new
  // selection does not share would silently match nothing.
  const commitTypeSelection = (cardTypeIds: string[]) => {
    setPendingFieldFilters([]);
    commit({ ...state, cardTypeIds, fieldFilters: [], page: 1 });
  };

  const handleTypeToggle = (typeId: string) =>
    commitTypeSelection(
      selectedTypeIds.includes(typeId)
        ? selectedTypeIds.filter((id) => id !== typeId)
        : [...selectedTypeIds, typeId],
    );

  const handleSelectAll = () => commitTypeSelection([]);

  const handleSearch = (q: string) => commit({ ...state, search: q, page: 1 });

  const handleStatusChange = (next: CardSearchStatus) =>
    commit({ ...state, status: next, page: 1 });

  const handleApplyFilters = () =>
    commit({ ...state, fieldFilters: pendingFieldFilters, page: 1 });

  const handleClearFilters = () => {
    setPendingFieldFilters([]);
    commit({ ...state, fieldFilters: [], page: 1 });
  };

  const handlePageChange = (page: number) => commit({ ...state, page });

  const handleViewChange = (next: ViewMode) =>
    commit({ ...state, view: next, page: 1 });

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
            defaultValue={initialState.search}
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
            fields={mergedFields}
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
          fields={mergedFields}
          visibleColumns={visibleColumns}
          fieldIdToColumnId={fieldIdToColumnId}
          viewQuery={viewQuery}
        />
      ) : (
        <CardProfileView
          cards={entries}
          fields={mergedFields}
          summaryFieldIds={mergedSummaryFieldIds}
          fieldIdToColumnId={fieldIdToColumnId}
          viewQuery={viewQuery}
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

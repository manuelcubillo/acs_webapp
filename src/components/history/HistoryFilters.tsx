"use client";

/**
 * HistoryFilters
 *
 * Collapsible filter panel for the action history page.
 * Date range, card type, action, executed-by, card code + field-level filters.
 * "Apply" button commits the filters; "Clear" resets everything.
 */

import { useState, useEffect, useMemo } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import type {
  ActionHistoryFilters,
  HistoryFilterOptions,
  FieldFilter,
  LogType,
} from "@/lib/dal";
import { HISTORY_LOG_TYPES, LOG_TYPE_LABEL } from "@/lib/history/log-types";
import HistoryFieldFilters from "./HistoryFieldFilters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const TEXT = {
  TITLE:        "Filtros",
  FROM:         "Desde",
  TO:           "Hasta",
  CARD_TYPE:    "Tipo de carnet",
  OPERATOR:     "Operador",
  ALL_OPERATORS: "Todos los operadores",
  CARD_CODE:    "Código de carnet",
  CARD_CODE_PH: "Buscar por código…",
  ACTION:       "Acción",
  LOG_TYPE:     "Tipo de registro",
  CLEAR:        "Limpiar",
  APPLY:        "Aplicar filtros",
  /**
   * The one thing an operator cannot work out from the screen: a row can match
   * `saldo = 0` and display `saldo: 3`, because the filter reads the card as it
   * is now and the table reads it as it was. Without this line that looks like
   * a bug. See the ADR — filters staying on current values is settled.
   */
  VALUE_SCOPE_NOTE:
    "Los filtros buscan en los valores ACTUALES del carnet. La tabla muestra los valores de cada evento, tal como estaban en ese momento.",
} as const;

// Sentinel for the "all operators" option (Select cannot use an empty value).
const ALL_OPERATORS = "__all__";

interface HistoryFiltersProps {
  options: HistoryFilterOptions;
  appliedFilters: ActionHistoryFilters;
  onApply: (filters: ActionHistoryFilters) => void;
}

/**
 * `<input type="datetime-local">` speaks local wall-clock time with no zone,
 * and `handleApply` reads it back with `new Date(value)` — which also reads it
 * as local. Rendering the UTC instant instead would reopen a range set at 14:00
 * in UTC+2 as 12:00, and shift it again on every re-apply. Visible now that
 * filters round-trip through the URL and get re-seeded on return.
 */
function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

// Helper: convert ActionHistoryFilters → form state strings
function filtersToForm(filters: ActionHistoryFilters): FormState {
  return {
    dateFrom: filters.dateFrom ? toDateTimeLocal(filters.dateFrom) : "",
    dateTo: filters.dateTo ? toDateTimeLocal(filters.dateTo) : "",
    cardTypeIds: filters.cardTypeIds ?? [],
    logTypes: filters.logTypes ?? [],
    actionDefinitionIds: filters.actionDefinitionIds ?? [],
    executedBy: filters.executedBy ?? "",
    cardCode: filters.cardCode ?? "",
    fieldFilters: filters.fieldFilters ?? [],
  };
}

interface FormState {
  dateFrom: string;
  dateTo: string;
  /** Selected card type IDs — multi-select toggle buttons. */
  cardTypeIds: string[];
  /**
   * Selected log types. Empty means "no preference", NOT "none" — the DAL is
   * sent an explicit list by `toEffectiveFilters`, which fills the blank in.
   */
  logTypes: LogType[];
  actionDefinitionIds: string[];
  executedBy: string;
  cardCode: string;
  fieldFilters: FieldFilter[];
}

function emptyForm(): FormState {
  return {
    dateFrom: "",
    dateTo: "",
    cardTypeIds: [],
    logTypes: [],
    actionDefinitionIds: [],
    executedBy: "",
    cardCode: "",
    fieldFilters: [],
  };
}

export default function HistoryFilters({
  options,
  appliedFilters,
  onApply,
}: HistoryFiltersProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => filtersToForm(appliedFilters));

  // Sync form when applied filters change from outside (e.g. clear all)
  useEffect(() => {
    setForm(filtersToForm(appliedFilters));
  }, [appliedFilters]);

  // Filtered action definitions based on selected card types
  const visibleActions = form.cardTypeIds.length > 0
    ? options.actionDefinitions.filter((a) => form.cardTypeIds.includes(a.cardTypeId))
    : options.actionDefinitions;

  // The types the field filters run against. No selection means "all types",
  // exactly as the card list treats it (`CardList`'s `effectiveTypeIds`) — the
  // builder then offers the fields common to every active type instead of
  // nothing at all.
  const allTypeIds = useMemo(
    () => options.cardTypes.map((ct) => ct.id),
    [options.cardTypes],
  );
  const effectiveTypeIds =
    form.cardTypeIds.length > 0 ? form.cardTypeIds : allTypeIds;

  // Toggle a card type in/out of the multi-select; clear stale action + field filters
  const handleCardTypeToggle = (cardTypeId: string) => {
    setForm((f) => ({
      ...f,
      cardTypeIds: f.cardTypeIds.includes(cardTypeId)
        ? f.cardTypeIds.filter((id) => id !== cardTypeId)
        : [...f.cardTypeIds, cardTypeId],
      actionDefinitionIds: [],
      fieldFilters: [],
    }));
  };

  const handleLogTypeToggle = (lt: LogType) => {
    setForm((f) => ({
      ...f,
      logTypes: f.logTypes.includes(lt)
        ? f.logTypes.filter((x) => x !== lt)
        : [...f.logTypes, lt],
    }));
  };

  const handleActionToggle = (id: string) => {
    setForm((f) => ({
      ...f,
      actionDefinitionIds: f.actionDefinitionIds.includes(id)
        ? f.actionDefinitionIds.filter((x) => x !== id)
        : [...f.actionDefinitionIds, id],
    }));
  };

  const handleApply = () => {
    const filters: ActionHistoryFilters = {};
    if (form.dateFrom) filters.dateFrom = new Date(form.dateFrom);
    if (form.dateTo) filters.dateTo = new Date(form.dateTo);
    if (form.cardTypeIds.length > 0) filters.cardTypeIds = form.cardTypeIds;
    if (form.logTypes.length > 0) filters.logTypes = form.logTypes;
    if (form.actionDefinitionIds.length > 0)
      filters.actionDefinitionIds = form.actionDefinitionIds;
    if (form.executedBy) filters.executedBy = form.executedBy;
    if (form.cardCode.trim()) filters.cardCode = form.cardCode.trim();
    if (form.fieldFilters.length > 0) filters.fieldFilters = form.fieldFilters;
    onApply(filters);
  };

  const handleClear = () => {
    setForm(emptyForm());
    onApply({});
  };

  // The scan toggle lives outside this panel and is not counted here.
  const activeCount = [
    appliedFilters.dateFrom,
    appliedFilters.dateTo,
    appliedFilters.cardTypeIds?.length,
    appliedFilters.logTypes?.length,
    appliedFilters.actionDefinitionIds?.length,
    appliedFilters.executedBy,
    appliedFilters.cardCode,
    appliedFilters.fieldFilters?.length,
  ].filter(Boolean).length;

  const LABEL = "mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground";

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
      {/* Header toggle */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between bg-card px-4 py-3 text-left hover:bg-muted/50"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-3.5 text-muted-foreground" strokeWidth={2} />
          <span className="text-sm font-semibold text-foreground">{TEXT.TITLE}</span>
          {activeCount > 0 && (
            <Badge variant="outline" className="h-4.5 min-w-4.5 px-1.5 text-[11px]">{activeCount}</Badge>
          )}
        </div>
        {open
          ? <ChevronUp className="size-3.5 text-muted-foreground" strokeWidth={2} />
          : <ChevronDown className="size-3.5 text-muted-foreground" strokeWidth={2} />
        }
      </button>

      {/* Filter body */}
      {open && (
        <div className="border-t p-4">
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
            {/* Date from */}
            <div>
              <Label className={LABEL}>{TEXT.FROM}</Label>
              <Input
                type="datetime-local"
                value={form.dateFrom}
                onChange={(e) => setForm((f) => ({ ...f, dateFrom: e.target.value }))}
              />
            </div>

            {/* Date to */}
            <div>
              <Label className={LABEL}>{TEXT.TO}</Label>
              <Input
                type="datetime-local"
                value={form.dateTo}
                onChange={(e) => setForm((f) => ({ ...f, dateTo: e.target.value }))}
              />
            </div>

            {/* Card type — multi-select toggle buttons */}
            {options.cardTypes.length > 0 && (
              <div className="col-span-full">
                <Label className={LABEL}>{TEXT.CARD_TYPE}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {options.cardTypes.map((ct) => {
                    const selected = form.cardTypeIds.includes(ct.id);
                    return (
                      <button
                        key={ct.id}
                        type="button"
                        onClick={() => handleCardTypeToggle(ct.id)}
                        className={cn(
                          "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors",
                          selected
                            ? "border-primary bg-accent font-bold text-primary"
                            : "border-border bg-card font-medium text-foreground hover:bg-muted",
                        )}
                      >
                        {ct.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Log type — multi-select toggle buttons.
                All four types, because /history is the audit surface: scans,
                actions, manual edits and lifecycle transitions. Composed with
                the inline scan toggle by `toEffectiveFilters`; nothing selected
                means "no preference". */}
            <div className="col-span-full">
              <Label className={LABEL}>{TEXT.LOG_TYPE}</Label>
              <div className="flex flex-wrap gap-1.5">
                {HISTORY_LOG_TYPES.map((lt) => {
                  const selected = form.logTypes.includes(lt);
                  return (
                    <button
                      key={lt}
                      type="button"
                      onClick={() => handleLogTypeToggle(lt)}
                      className={cn(
                        "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors",
                        selected
                          ? "border-primary bg-accent font-bold text-primary"
                          : "border-border bg-card font-medium text-foreground hover:bg-muted",
                      )}
                    >
                      {LOG_TYPE_LABEL[lt]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Executed by */}
            <div>
              <Label className={LABEL}>{TEXT.OPERATOR}</Label>
              <Select
                value={form.executedBy || ALL_OPERATORS}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, executedBy: v === ALL_OPERATORS ? "" : v }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_OPERATORS}>{TEXT.ALL_OPERATORS}</SelectItem>
                  {options.users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Card code */}
            <div>
              <Label className={LABEL}>{TEXT.CARD_CODE}</Label>
              <Input
                type="text"
                value={form.cardCode}
                onChange={(e) => setForm((f) => ({ ...f, cardCode: e.target.value }))}
                placeholder={TEXT.CARD_CODE_PH}
              />
            </div>
          </div>

          {/* Actions — shown only when actions available */}
          {visibleActions.length > 0 && (
            <div className="mt-3.5">
              <Label className={LABEL}>{TEXT.ACTION}</Label>
              <div className="flex flex-wrap gap-1.5">
                {visibleActions.map((a) => {
                  const selected = form.actionDefinitionIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => handleActionToggle(a.id)}
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs transition-colors",
                        selected
                          ? "border-primary bg-primary font-semibold text-primary-foreground"
                          : "border-border bg-card font-medium text-foreground hover:bg-muted",
                      )}
                    >
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Field-level filters. Rendered whatever the type selection is; the
              builder itself renders nothing when the effective types share no
              filterable field. Guarded on a non-empty list because
              getCommonFieldDefinitionsAction rejects an empty one. */}
          {allTypeIds.length > 0 && (
            <div className="mt-3.5">
              <HistoryFieldFilters
                cardTypeIds={effectiveTypeIds}
                value={form.fieldFilters}
                onChange={(ff) => setForm((f) => ({ ...f, fieldFilters: ff }))}
              />
            </div>
          )}

          {/* Why a filtered row can display a value the filter would not match. */}
          <p className="mt-3.5 text-[11px] leading-relaxed text-muted-foreground">
            {TEXT.VALUE_SCOPE_NOTE}
          </p>

          {/* Apply / Clear */}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={handleClear}>
              {TEXT.CLEAR}
            </Button>
            <Button onClick={handleApply}>
              {TEXT.APPLY}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * HistoryFilters
 *
 * Collapsible filter panel for the action history page.
 * Date range, card type, action, executed-by, card code + field-level filters.
 * "Apply" button commits the filters; "Clear" resets everything.
 */

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import type { ActionHistoryFilters, HistoryFilterOptions, FieldFilter } from "@/lib/dal";
import HistoryFieldFilters from "./HistoryFieldFilters";

interface HistoryFiltersProps {
  options: HistoryFilterOptions;
  appliedFilters: ActionHistoryFilters;
  onApply: (filters: ActionHistoryFilters) => void;
}

// Helper: convert ActionHistoryFilters → form state strings
function filtersToForm(filters: ActionHistoryFilters): FormState {
  return {
    dateFrom: filters.dateFrom
      ? filters.dateFrom.toISOString().slice(0, 16)
      : "",
    dateTo: filters.dateTo
      ? filters.dateTo.toISOString().slice(0, 16)
      : "",
    cardTypeIds: filters.cardTypeIds ?? [],
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

  // Count active filters (excluding logTypes which is handled by the toggle)
  const activeCount = [
    appliedFilters.dateFrom,
    appliedFilters.dateTo,
    appliedFilters.cardTypeIds?.length,
    appliedFilters.actionDefinitionIds?.length,
    appliedFilters.executedBy,
    appliedFilters.cardCode,
    appliedFilters.fieldFilters?.length,
  ].filter(Boolean).length;

  const inputStyle: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid var(--color-border)",
    fontSize: 13,
    background: "#fff",
    color: "var(--color-dark)",
    width: "100%",
    boxSizing: "border-box",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: "pointer",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--color-muted)",
    display: "block",
    marginBottom: 5,
  };

  return (
    <div style={{
      border: "1px solid var(--color-border)",
      borderRadius: 12,
      overflow: "hidden",
      marginBottom: 16,
    }}>
      {/* Header toggle */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: "#fafafa",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SlidersHorizontal size={15} strokeWidth={2} style={{ color: "var(--color-muted)" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}>
            Filtros
          </span>
          {activeCount > 0 && (
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              background: "var(--color-primary, #2563eb)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              padding: "0 5px",
            }}>
              {activeCount}
            </span>
          )}
        </div>
        {open
          ? <ChevronUp size={15} strokeWidth={2} style={{ color: "var(--color-muted)" }} />
          : <ChevronDown size={15} strokeWidth={2} style={{ color: "var(--color-muted)" }} />
        }
      </button>

      {/* Filter body */}
      {open && (
        <div style={{ padding: 16, borderTop: "1px solid var(--color-border)" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 14,
          }}>
            {/* Date from */}
            <div>
              <label style={labelStyle}>Desde</label>
              <input
                type="datetime-local"
                style={inputStyle}
                value={form.dateFrom}
                onChange={(e) => setForm((f) => ({ ...f, dateFrom: e.target.value }))}
              />
            </div>

            {/* Date to */}
            <div>
              <label style={labelStyle}>Hasta</label>
              <input
                type="datetime-local"
                style={inputStyle}
                value={form.dateTo}
                onChange={(e) => setForm((f) => ({ ...f, dateTo: e.target.value }))}
              />
            </div>

            {/* Card type — multi-select toggle buttons */}
            {options.cardTypes.length > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Tipo de carnet</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {options.cardTypes.map((ct) => {
                    const selected = form.cardTypeIds.includes(ct.id);
                    return (
                      <button
                        key={ct.id}
                        type="button"
                        onClick={() => handleCardTypeToggle(ct.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "5px 13px",
                          borderRadius: 20,
                          border: selected
                            ? "1.5px solid var(--color-primary, #2563eb)"
                            : "1.5px solid var(--color-border)",
                          background: selected ? "#e0e7ff" : "#fff",
                          color: selected ? "var(--color-primary, #2563eb)" : "var(--color-dark)",
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
              </div>
            )}

            {/* Executed by */}
            <div>
              <label style={labelStyle}>Operador</label>
              <select
                style={selectStyle}
                value={form.executedBy}
                onChange={(e) => setForm((f) => ({ ...f, executedBy: e.target.value }))}
              >
                <option value="">Todos los operadores</option>
                {options.users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            {/* Card code */}
            <div>
              <label style={labelStyle}>Código de carnet</label>
              <input
                type="text"
                style={inputStyle}
                value={form.cardCode}
                onChange={(e) => setForm((f) => ({ ...f, cardCode: e.target.value }))}
                placeholder="Buscar por código…"
              />
            </div>
          </div>

          {/* Actions — shown only when actions available */}
          {visibleActions.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Acción</label>
              <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
              }}>
                {visibleActions.map((a) => {
                  const selected = form.actionDefinitionIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => handleActionToggle(a.id)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "5px 11px",
                        borderRadius: 20,
                        border: selected
                          ? "1.5px solid var(--color-primary, #2563eb)"
                          : "1.5px solid var(--color-border)",
                        background: selected
                          ? "var(--color-primary, #2563eb)"
                          : "#fff",
                        color: selected ? "#fff" : "var(--color-dark)",
                        fontSize: 12,
                        fontWeight: selected ? 600 : 500,
                        cursor: "pointer",
                        transition: "all 0.12s",
                      }}
                    >
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Field-level filters (only when at least one card type selected) */}
          {form.cardTypeIds.length > 0 && (
            <HistoryFieldFilters
              cardTypeIds={form.cardTypeIds}
              value={form.fieldFilters}
              onChange={(ff) => setForm((f) => ({ ...f, fieldFilters: ff }))}
            />
          )}

          {/* Apply / Clear */}
          <div style={{
            display: "flex",
            gap: 8,
            marginTop: 16,
            justifyContent: "flex-end",
          }}>
            <button
              onClick={handleClear}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid var(--color-border)",
                background: "#fff",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--color-muted)",
                cursor: "pointer",
              }}
            >
              Limpiar
            </button>
            <button
              onClick={handleApply}
              style={{
                padding: "8px 20px",
                borderRadius: 8,
                border: "none",
                background: "var(--color-primary, #2563eb)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Aplicar filtros
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

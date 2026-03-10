"use client";

/**
 * HistoryFieldFilters
 *
 * Dynamic field-level filter builder.
 * Appears when a card type is selected in HistoryFilters.
 * Loads filterable field definitions for that card type.
 */

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { getFieldDefinitionsForFilterAction } from "@/lib/actions/action-history";
import type { FilterableFieldDefinition, FieldFilter, FieldFilterOperator } from "@/lib/dal";

interface HistoryFieldFiltersProps {
  cardTypeId: string;
  value: FieldFilter[];
  onChange: (filters: FieldFilter[]) => void;
}

// ─── Operator options per field type ──────────────────────────────────────────

type OperatorDef = { value: FieldFilterOperator; label: string };

const TEXT_OPS: OperatorDef[] = [
  { value: "contains", label: "Contiene" },
  { value: "starts_with", label: "Empieza por" },
  { value: "equals_text", label: "Es igual a" },
];

const NUMBER_OPS: OperatorDef[] = [
  { value: "eq", label: "=" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
  { value: "between", label: "Entre" },
];

const BOOLEAN_OPS: OperatorDef[] = [
  { value: "is_true", label: "Es verdadero" },
  { value: "is_false", label: "Es falso" },
];

const DATE_OPS: OperatorDef[] = [
  { value: "date_eq", label: "Es igual a" },
  { value: "date_before", label: "Antes de" },
  { value: "date_after", label: "Después de" },
  { value: "date_between", label: "Entre" },
];

const SELECT_OPS: OperatorDef[] = [
  { value: "equals_text", label: "Es igual a" },
];

function getOperatorsForFieldType(fieldType: string): OperatorDef[] {
  switch (fieldType) {
    case "text":
      return TEXT_OPS;
    case "number":
      return NUMBER_OPS;
    case "boolean":
      return BOOLEAN_OPS;
    case "date":
      return DATE_OPS;
    case "select":
      return SELECT_OPS;
    default:
      return TEXT_OPS;
  }
}

function defaultOperator(fieldType: string): FieldFilterOperator {
  const ops = getOperatorsForFieldType(fieldType);
  return ops[0]?.value ?? "contains";
}

function getSelectOptions(validationRules: unknown): string[] {
  if (!validationRules || typeof validationRules !== "object") return [];
  const rules = validationRules as Record<string, unknown>;
  if (Array.isArray(rules.options)) {
    return rules.options.filter((o): o is string => typeof o === "string");
  }
  return [];
}

// ─── Value input component ─────────────────────────────────────────────────────

interface ValueInputProps {
  fieldDef: FilterableFieldDefinition;
  operator: FieldFilterOperator;
  value: unknown;
  onChange: (v: unknown) => void;
}

function ValueInput({ fieldDef, operator, value, onChange }: ValueInputProps) {
  const inputStyle: React.CSSProperties = {
    padding: "7px 10px",
    borderRadius: 7,
    border: "1px solid var(--color-border)",
    fontSize: 13,
    background: "#fff",
    color: "var(--color-dark)",
    width: "100%",
    boxSizing: "border-box",
  };

  // Boolean — no value needed
  if (operator === "is_true" || operator === "is_false") {
    return null;
  }

  // Select field
  if (fieldDef.fieldType === "select") {
    const options = getSelectOptions(fieldDef.validationRules);
    return (
      <select
        style={inputStyle}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Seleccionar…</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }

  // Date / datetime between
  if (operator === "date_between") {
    const range = value as { min?: string; max?: string } | null ?? {};
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }}>
        <input
          type="date"
          style={{ ...inputStyle, flex: 1 }}
          value={range.min ?? ""}
          onChange={(e) => onChange({ ...range, min: e.target.value })}
        />
        <span style={{ color: "var(--color-muted)", fontSize: 12, whiteSpace: "nowrap" }}>→</span>
        <input
          type="date"
          style={{ ...inputStyle, flex: 1 }}
          value={range.max ?? ""}
          onChange={(e) => onChange({ ...range, max: e.target.value })}
        />
      </div>
    );
  }

  // Number between
  if (operator === "between") {
    const range = value as { min?: string | number; max?: string | number } | null ?? {};
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }}>
        <input
          type="number"
          style={{ ...inputStyle, flex: 1 }}
          value={range.min ?? ""}
          placeholder="Mín"
          onChange={(e) => onChange({ ...range, min: e.target.value })}
        />
        <span style={{ color: "var(--color-muted)", fontSize: 12, whiteSpace: "nowrap" }}>→</span>
        <input
          type="number"
          style={{ ...inputStyle, flex: 1 }}
          value={range.max ?? ""}
          placeholder="Máx"
          onChange={(e) => onChange({ ...range, max: e.target.value })}
        />
      </div>
    );
  }

  // Date single
  if (
    operator === "date_eq" ||
    operator === "date_before" ||
    operator === "date_after" ||
    fieldDef.fieldType === "date"
  ) {
    return (
      <input
        type="date"
        style={inputStyle}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // Number single
  if (fieldDef.fieldType === "number") {
    return (
      <input
        type="number"
        style={inputStyle}
        value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Valor…"
      />
    );
  }

  // Text default
  return (
    <input
      type="text"
      style={inputStyle}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Valor…"
    />
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function HistoryFieldFilters({
  cardTypeId,
  value,
  onChange,
}: HistoryFieldFiltersProps) {
  const [fieldDefs, setFieldDefs] = useState<FilterableFieldDefinition[]>([]);
  const [loading, setLoading] = useState(false);

  // Load field definitions when cardTypeId changes
  useEffect(() => {
    if (!cardTypeId) {
      setFieldDefs([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getFieldDefinitionsForFilterAction(cardTypeId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.success) {
        setFieldDefs(res.data);
      }
    });
    return () => { cancelled = true; };
  }, [cardTypeId]);

  const addFilter = () => {
    if (fieldDefs.length === 0) return;
    const firstField = fieldDefs[0];
    const op = defaultOperator(firstField.fieldType);
    onChange([
      ...value,
      { fieldDefinitionId: firstField.id, operator: op, value: "" },
    ]);
  };

  const updateFilter = (idx: number, partial: Partial<FieldFilter>) => {
    const next = value.map((f, i) => {
      if (i !== idx) return f;
      const updated = { ...f, ...partial };
      // If field changed, reset operator and value
      if (partial.fieldDefinitionId && partial.fieldDefinitionId !== f.fieldDefinitionId) {
        const fd = fieldDefs.find((d) => d.id === partial.fieldDefinitionId);
        updated.operator = fd ? defaultOperator(fd.fieldType) : "contains";
        updated.value = "";
      }
      // If operator changed to boolean, clear value
      if (partial.operator && (partial.operator === "is_true" || partial.operator === "is_false")) {
        updated.value = null;
      }
      return updated;
    });
    onChange(next);
  };

  const removeFilter = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  if (loading) {
    return (
      <div style={{ fontSize: 12, color: "var(--color-muted)", padding: "8px 0" }}>
        Cargando campos…
      </div>
    );
  }

  if (fieldDefs.length === 0) return null;

  const selectStyle: React.CSSProperties = {
    padding: "7px 10px",
    borderRadius: 7,
    border: "1px solid var(--color-border)",
    fontSize: 13,
    background: "#fff",
    color: "var(--color-dark)",
    cursor: "pointer",
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "var(--color-muted)",
        marginBottom: 8,
      }}>
        Filtros de campo
      </div>

      {/* Filter rows */}
      {value.map((filter, idx) => {
        const fieldDef = fieldDefs.find((d) => d.id === filter.fieldDefinitionId);
        const operators = fieldDef ? getOperatorsForFieldType(fieldDef.fieldType) : TEXT_OPS;
        const isBooleanOp = filter.operator === "is_true" || filter.operator === "is_false";

        return (
          <div
            key={idx}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 6,
              flexWrap: "wrap",
            }}
          >
            {/* Field selector */}
            <select
              style={{ ...selectStyle, minWidth: 140, flex: "0 0 auto" }}
              value={filter.fieldDefinitionId}
              onChange={(e) => updateFilter(idx, { fieldDefinitionId: e.target.value })}
            >
              {fieldDefs.map((fd) => (
                <option key={fd.id} value={fd.id}>{fd.label}</option>
              ))}
            </select>

            {/* Operator selector */}
            <select
              style={{ ...selectStyle, minWidth: 110, flex: "0 0 auto" }}
              value={filter.operator}
              onChange={(e) =>
                updateFilter(idx, { operator: e.target.value as FieldFilterOperator })
              }
            >
              {operators.map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>

            {/* Value input */}
            {!isBooleanOp && fieldDef && (
              <div style={{ flex: 1, minWidth: 120 }}>
                <ValueInput
                  fieldDef={fieldDef}
                  operator={filter.operator}
                  value={filter.value}
                  onChange={(v) => updateFilter(idx, { value: v })}
                />
              </div>
            )}

            {/* Remove button */}
            <button
              onClick={() => removeFilter(idx)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "#fff",
                color: "var(--color-muted)",
                cursor: "pointer",
                flexShrink: 0,
              }}
              title="Eliminar filtro"
              aria-label="Eliminar filtro de campo"
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        );
      })}

      {/* Add filter button */}
      <button
        onClick={addFilter}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "6px 12px",
          borderRadius: 7,
          border: "1.5px dashed var(--color-border)",
          background: "transparent",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--color-muted)",
          cursor: "pointer",
          marginTop: 2,
          transition: "border-color 0.12s, color 0.12s",
        }}
      >
        <Plus size={13} strokeWidth={2.5} />
        Añadir filtro de campo
      </button>
    </div>
  );
}

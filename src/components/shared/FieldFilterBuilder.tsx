"use client";

/**
 * FieldFilterBuilder (shared)
 *
 * Dynamic field-level filter builder.
 * Receives already-fetched CommonFieldDefinition[] as a prop (no internal fetching).
 * Used by both the cards listing page and the history page.
 *
 * Each filter stores fieldDefinitionIds (one per card type) so that EXISTS
 * subqueries can use IN clauses when filtering across multiple card types.
 */

import { Plus, X } from "lucide-react";
import type { CommonFieldDefinition, FieldFilter, FieldFilterOperator } from "@/lib/dal";

export interface FieldFilterBuilderProps {
  fields: CommonFieldDefinition[];
  filters: FieldFilter[];
  onFiltersChange: (filters: FieldFilter[]) => void;
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

export function getOperatorsForFieldType(fieldType: string): OperatorDef[] {
  switch (fieldType) {
    case "text": return TEXT_OPS;
    case "number": return NUMBER_OPS;
    case "boolean": return BOOLEAN_OPS;
    case "date": return DATE_OPS;
    case "select": return SELECT_OPS;
    default: return TEXT_OPS;
  }
}

export function defaultOperatorForType(fieldType: string): FieldFilterOperator {
  return getOperatorsForFieldType(fieldType)[0]?.value ?? "contains";
}

function getSelectOptions(validationRules: unknown): string[] {
  if (!validationRules || typeof validationRules !== "object") return [];
  const rules = validationRules as Record<string, unknown>;
  if (Array.isArray(rules.options)) {
    return rules.options.filter((o): o is string => typeof o === "string");
  }
  return [];
}

// ─── Field lookup helpers ──────────────────────────────────────────────────────

/**
 * Stable option key for a CommonFieldDefinition.
 * Uses the first fieldDefinitionId as a unique-per-field identifier.
 */
function fieldKey(def: CommonFieldDefinition): string {
  return def.fieldDefinitionIds[0] ?? `${def.name}:${def.fieldType}`;
}

/**
 * Find the CommonFieldDefinition that corresponds to a filter's fieldDefinitionIds.
 * Matches by checking if any ID in the filter appears as the first ID of a field def.
 */
function findFieldDef(
  fields: CommonFieldDefinition[],
  filter: FieldFilter,
): CommonFieldDefinition | undefined {
  if (!filter.fieldDefinitionIds.length) return undefined;
  return fields.find((f) => f.fieldDefinitionIds[0] === filter.fieldDefinitionIds[0]);
}

// ─── Value input ───────────────────────────────────────────────────────────────

interface ValueInputProps {
  fieldDef: CommonFieldDefinition;
  operator: FieldFilterOperator;
  value: unknown;
  onChange: (v: unknown) => void;
}

function ValueInput({ fieldDef, operator, value, onChange }: ValueInputProps) {
  const inputStyle: React.CSSProperties = {
    padding: "7px 10px", borderRadius: 7,
    border: "1px solid var(--color-border)", fontSize: 13,
    background: "#fff", color: "var(--color-dark)",
    width: "100%", boxSizing: "border-box",
  };

  if (operator === "is_true" || operator === "is_false") return null;

  if (fieldDef.fieldType === "select") {
    const options = getSelectOptions(fieldDef.validationRules);
    return (
      <select style={inputStyle} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Seleccionar…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  if (operator === "date_between") {
    const r = value as { min?: string; max?: string } | null ?? {};
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }}>
        <input type="date" style={{ ...inputStyle, flex: 1 }} value={r.min ?? ""} onChange={(e) => onChange({ ...r, min: e.target.value })} />
        <span style={{ color: "var(--color-muted)", fontSize: 12 }}>→</span>
        <input type="date" style={{ ...inputStyle, flex: 1 }} value={r.max ?? ""} onChange={(e) => onChange({ ...r, max: e.target.value })} />
      </div>
    );
  }

  if (operator === "between") {
    const r = value as { min?: unknown; max?: unknown } | null ?? {};
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }}>
        <input type="number" style={{ ...inputStyle, flex: 1 }} value={String(r.min ?? "")} placeholder="Mín" onChange={(e) => onChange({ ...r, min: e.target.value })} />
        <span style={{ color: "var(--color-muted)", fontSize: 12 }}>→</span>
        <input type="number" style={{ ...inputStyle, flex: 1 }} value={String(r.max ?? "")} placeholder="Máx" onChange={(e) => onChange({ ...r, max: e.target.value })} />
      </div>
    );
  }

  if (operator === "date_eq" || operator === "date_before" || operator === "date_after" || fieldDef.fieldType === "date") {
    return <input type="date" style={inputStyle} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />;
  }

  if (fieldDef.fieldType === "number") {
    return <input type="number" style={inputStyle} value={typeof value === "string" || typeof value === "number" ? String(value) : ""} onChange={(e) => onChange(e.target.value)} placeholder="Valor…" />;
  }

  return <input type="text" style={inputStyle} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} placeholder="Valor…" />;
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function FieldFilterBuilder({ fields, filters, onFiltersChange }: FieldFilterBuilderProps) {
  if (fields.length === 0) return null;

  const addFilter = () => {
    const first = fields[0];
    onFiltersChange([
      ...filters,
      { fieldDefinitionIds: first.fieldDefinitionIds, operator: defaultOperatorForType(first.fieldType), value: "" },
    ]);
  };

  const updateFilter = (idx: number, partial: Partial<FieldFilter>) => {
    const next = filters.map((f, i) => {
      if (i !== idx) return f;
      const updated = { ...f, ...partial };
      // If field changed, reset operator and value
      if (
        partial.fieldDefinitionIds &&
        partial.fieldDefinitionIds[0] !== f.fieldDefinitionIds[0]
      ) {
        const fd = fields.find((d) => d.fieldDefinitionIds[0] === partial.fieldDefinitionIds![0]);
        updated.operator = fd ? defaultOperatorForType(fd.fieldType) : "contains";
        updated.value = "";
      }
      if (partial.operator === "is_true" || partial.operator === "is_false") {
        updated.value = null;
      }
      return updated;
    });
    onFiltersChange(next);
  };

  const removeFilter = (idx: number) => onFiltersChange(filters.filter((_, i) => i !== idx));

  const selectStyle: React.CSSProperties = {
    padding: "7px 10px", borderRadius: 7,
    border: "1px solid var(--color-border)", fontSize: 13,
    background: "#fff", color: "var(--color-dark)", cursor: "pointer",
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-muted)", marginBottom: 8 }}>
        Filtros de campo
      </div>

      {filters.map((filter, idx) => {
        const fieldDef = findFieldDef(fields, filter);
        const operators = fieldDef ? getOperatorsForFieldType(fieldDef.fieldType) : TEXT_OPS;
        const isBooleanOp = filter.operator === "is_true" || filter.operator === "is_false";
        const currentKey = filter.fieldDefinitionIds[0] ?? "";

        return (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            {/* Field selector — value is the first fieldDefinitionId of the CommonFieldDefinition */}
            <select
              style={{ ...selectStyle, minWidth: 140, flex: "0 0 auto" }}
              value={currentKey}
              onChange={(e) => {
                const fd = fields.find((d) => fieldKey(d) === e.target.value);
                if (fd) updateFilter(idx, { fieldDefinitionIds: fd.fieldDefinitionIds });
              }}
            >
              {fields.map((fd) => (
                <option key={fieldKey(fd)} value={fieldKey(fd)}>{fd.label}</option>
              ))}
            </select>

            <select
              style={{ ...selectStyle, minWidth: 110, flex: "0 0 auto" }}
              value={filter.operator}
              onChange={(e) => updateFilter(idx, { operator: e.target.value as FieldFilterOperator })}
            >
              {operators.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
            </select>

            {!isBooleanOp && fieldDef && (
              <div style={{ flex: 1, minWidth: 120 }}>
                <ValueInput fieldDef={fieldDef} operator={filter.operator} value={filter.value} onChange={(v) => updateFilter(idx, { value: v })} />
              </div>
            )}

            <button
              onClick={() => removeFilter(idx)}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: "1px solid var(--color-border)", background: "#fff", color: "var(--color-muted)", cursor: "pointer", flexShrink: 0 }}
              title="Eliminar filtro"
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        );
      })}

      <button
        onClick={addFilter}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: "1.5px dashed var(--color-border)", background: "transparent", fontSize: 12, fontWeight: 600, color: "var(--color-muted)", cursor: "pointer", marginTop: 2 }}
      >
        <Plus size={13} strokeWidth={2.5} />
        Añadir filtro de campo
      </button>
    </div>
  );
}

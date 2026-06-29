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

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { CommonFieldDefinition, FieldFilter, FieldFilterOperator } from "@/lib/dal";

const TEXT = {
  SECTION:        "Filtros de campo",
  ADD_FILTER:     "Añadir filtro de campo",
  REMOVE_FILTER:  "Eliminar filtro",
  PLACEHOLDER:    "Valor…",
  PLACEHOLDER_MIN: "Mín",
  PLACEHOLDER_MAX: "Máx",
  SELECT_VALUE:   "Seleccionar…",
} as const;

export interface FieldFilterBuilderProps {
  fields: CommonFieldDefinition[];
  filters: FieldFilter[];
  onFiltersChange: (filters: FieldFilter[]) => void;
}

// ─── Operator options per field type ────────────────────────────────────────

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
    case "text":    return TEXT_OPS;
    case "number":  return NUMBER_OPS;
    case "boolean": return BOOLEAN_OPS;
    case "date":    return DATE_OPS;
    case "select":  return SELECT_OPS;
    default:        return TEXT_OPS;
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

// ─── Field lookup helpers ───────────────────────────────────────────────────

function fieldKey(def: CommonFieldDefinition): string {
  return def.fieldDefinitionIds[0] ?? `${def.name}:${def.fieldType}`;
}

function findFieldDef(
  fields: CommonFieldDefinition[],
  filter: FieldFilter,
): CommonFieldDefinition | undefined {
  if (!filter.fieldDefinitionIds.length) return undefined;
  return fields.find((f) => f.fieldDefinitionIds[0] === filter.fieldDefinitionIds[0]);
}

// ─── Value input ────────────────────────────────────────────────────────────

interface ValueInputProps {
  fieldDef: CommonFieldDefinition;
  operator: FieldFilterOperator;
  value: unknown;
  onChange: (v: unknown) => void;
}

function ValueInput({ fieldDef, operator, value, onChange }: ValueInputProps) {
  if (operator === "is_true" || operator === "is_false") return null;

  if (fieldDef.fieldType === "select") {
    const options = getSelectOptions(fieldDef.validationRules);
    const current = typeof value === "string" ? value : "";
    return (
      <Select value={current || undefined} onValueChange={(v) => onChange(v)}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder={TEXT.SELECT_VALUE} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (operator === "date_between") {
    const r = (value as { min?: string; max?: string } | null) ?? {};
    return (
      <div className="flex flex-1 items-center gap-1.5">
        <Input
          type="date"
          className="h-9 flex-1 text-sm"
          value={r.min ?? ""}
          onChange={(e) => onChange({ ...r, min: e.target.value })}
        />
        <span aria-hidden className="text-xs text-muted-foreground">→</span>
        <Input
          type="date"
          className="h-9 flex-1 text-sm"
          value={r.max ?? ""}
          onChange={(e) => onChange({ ...r, max: e.target.value })}
        />
      </div>
    );
  }

  if (operator === "between") {
    const r = (value as { min?: unknown; max?: unknown } | null) ?? {};
    return (
      <div className="flex flex-1 items-center gap-1.5">
        <Input
          type="number"
          className="h-9 flex-1 text-sm"
          value={String(r.min ?? "")}
          placeholder={TEXT.PLACEHOLDER_MIN}
          onChange={(e) => onChange({ ...r, min: e.target.value })}
        />
        <span aria-hidden className="text-xs text-muted-foreground">→</span>
        <Input
          type="number"
          className="h-9 flex-1 text-sm"
          value={String(r.max ?? "")}
          placeholder={TEXT.PLACEHOLDER_MAX}
          onChange={(e) => onChange({ ...r, max: e.target.value })}
        />
      </div>
    );
  }

  if (
    operator === "date_eq" ||
    operator === "date_before" ||
    operator === "date_after" ||
    fieldDef.fieldType === "date"
  ) {
    return (
      <Input
        type="date"
        className="h-9 text-sm"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (fieldDef.fieldType === "number") {
    return (
      <Input
        type="number"
        className="h-9 text-sm"
        value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={TEXT.PLACEHOLDER}
      />
    );
  }

  return (
    <Input
      type="text"
      className="h-9 text-sm"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={TEXT.PLACEHOLDER}
    />
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function FieldFilterBuilder({
  fields,
  filters,
  onFiltersChange,
}: FieldFilterBuilderProps) {
  if (fields.length === 0) return null;

  const addFilter = () => {
    const first = fields[0];
    onFiltersChange([
      ...filters,
      {
        fieldDefinitionIds: first.fieldDefinitionIds,
        operator: defaultOperatorForType(first.fieldType),
        value: "",
      },
    ]);
  };

  const updateFilter = (idx: number, partial: Partial<FieldFilter>) => {
    const next = filters.map((f, i) => {
      if (i !== idx) return f;
      const updated = { ...f, ...partial };
      if (
        partial.fieldDefinitionIds &&
        partial.fieldDefinitionIds[0] !== f.fieldDefinitionIds[0]
      ) {
        const fd = fields.find(
          (d) => d.fieldDefinitionIds[0] === partial.fieldDefinitionIds![0],
        );
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

  const removeFilter = (idx: number) =>
    onFiltersChange(filters.filter((_, i) => i !== idx));

  return (
    <div className="mt-2">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {TEXT.SECTION}
      </div>

      {filters.map((filter, idx) => {
        const fieldDef = findFieldDef(fields, filter);
        const operators = fieldDef
          ? getOperatorsForFieldType(fieldDef.fieldType)
          : TEXT_OPS;
        const isBooleanOp =
          filter.operator === "is_true" || filter.operator === "is_false";
        const currentKey = filter.fieldDefinitionIds[0] ?? "";

        return (
          <div
            key={idx}
            className="mb-1.5 flex flex-wrap items-center gap-1.5"
          >
            <Select
              value={currentKey || undefined}
              onValueChange={(v) => {
                const fd = fields.find((d) => fieldKey(d) === v);
                if (fd) updateFilter(idx, { fieldDefinitionIds: fd.fieldDefinitionIds });
              }}
            >
              <SelectTrigger className="h-9 min-w-[140px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fields.map((fd) => (
                  <SelectItem key={fieldKey(fd)} value={fieldKey(fd)}>
                    {fd.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filter.operator}
              onValueChange={(v) =>
                updateFilter(idx, { operator: v as FieldFilterOperator })
              }
            >
              <SelectTrigger className="h-9 min-w-[110px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {operators.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {!isBooleanOp && fieldDef && (
              <div className={cn("min-w-[120px] flex-1")}>
                <ValueInput
                  fieldDef={fieldDef}
                  operator={filter.operator}
                  value={filter.value}
                  onChange={(v) => updateFilter(idx, { value: v })}
                />
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => removeFilter(idx)}
              title={TEXT.REMOVE_FILTER}
              aria-label={TEXT.REMOVE_FILTER}
            >
              <X />
            </Button>
          </div>
        );
      })}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={addFilter}
        className="mt-0.5 gap-1.5 border border-dashed border-border text-muted-foreground hover:text-foreground"
      >
        <Plus />
        {TEXT.ADD_FILTER}
      </Button>
    </div>
  );
}

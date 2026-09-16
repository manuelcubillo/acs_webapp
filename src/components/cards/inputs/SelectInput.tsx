"use client";

/**
 * SelectInput
 *
 * Two shapes behind one component, chosen by the field's `allowMultiple`
 * configuration:
 *
 *   - single   → a shadcn `Select`, emitting `string | null`
 *   - multiple → a popover of checkboxes, emitting `string[] | null`
 *
 * Both read their options from `getSelectOptions`. The multiple variant emits
 * `null` rather than `[]` when nothing is picked, so "no selection" has one
 * representation all the way down to `mapValueToColumn`.
 */

import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getAllowMultiple, getSelectOptions } from "@/lib/validation/rules";
import type { ValidationRules } from "@/lib/validation/types";

const TEXT = {
  PLACEHOLDER: "— Seleccionar —",
  PLACEHOLDER_MULTI: "— Seleccionar opciones —",
  CLEAR: "Quitar selección",
  NO_OPTIONS: "Este campo no tiene opciones configuradas.",
  SELECTED_ONE: "opción seleccionada",
  SELECTED_MANY: "opciones seleccionadas",
} as const;

interface SelectInputProps {
  fieldId: string;
  label: string;
  value: unknown;
  onChange: (value: string | string[] | null) => void;
  isRequired?: boolean;
  error?: string;
  disabled?: boolean;
  validationRules?: ValidationRules | null;
}

/**
 * Read the current value as a list, whatever shape it arrived in.
 *
 * A field switched from multiple back to single (or the other way) still holds
 * its old shape until the card is saved again, so neither variant may assume
 * the one it prefers.
 */
function toList(value: unknown): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) return value.map((v) => String(v));
  return [String(value)];
}

export default function SelectInput({
  fieldId,
  label,
  value,
  onChange,
  isRequired,
  error,
  disabled,
  validationRules,
}: SelectInputProps) {
  const options = getSelectOptions(validationRules);
  const allowMultiple = getAllowMultiple(validationRules);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId} className="text-sm font-semibold text-foreground">
        {label}
        {isRequired && <span className="ml-1 text-destructive">*</span>}
      </Label>

      {allowMultiple ? (
        <MultiSelect
          fieldId={fieldId}
          options={options}
          selected={toList(value)}
          onChange={(next) => onChange(next.length > 0 ? next : null)}
          error={error}
          disabled={disabled}
        />
      ) : (
        <SingleSelect
          fieldId={fieldId}
          options={options}
          // A stored multi value degrades to its first item rather than
          // rendering "[object Object]" or an empty control.
          selected={toList(value)[0] ?? ""}
          onChange={(next) => onChange(next)}
          error={error}
          disabled={disabled}
        />
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─── Single ──────────────────────────────────────────────────────────────────

interface SingleSelectProps {
  fieldId: string;
  options: string[];
  selected: string;
  onChange: (value: string | null) => void;
  error?: string;
  disabled?: boolean;
}

function SingleSelect({
  fieldId,
  options,
  selected,
  onChange,
  error,
  disabled,
}: SingleSelectProps) {
  return (
    <Select
      value={selected || undefined}
      onValueChange={(v) => onChange(v || null)}
      disabled={disabled}
    >
      <SelectTrigger
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={cn(
          "w-full",
          error && "border-destructive focus-visible:ring-destructive/40",
        )}
      >
        <SelectValue placeholder={TEXT.PLACEHOLDER} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Multiple ────────────────────────────────────────────────────────────────

interface MultiSelectProps {
  fieldId: string;
  options: string[];
  selected: string[];
  onChange: (value: string[]) => void;
  error?: string;
  disabled?: boolean;
}

function MultiSelect({
  fieldId,
  options,
  selected,
  onChange,
  error,
  disabled,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  function toggle(option: string) {
    onChange(
      selected.includes(option)
        ? selected.filter((o) => o !== option)
        : // Keep the configured option order, not the click order, so two
          // cards with the same selection store the same array.
          options.filter((o) => o === option || selected.includes(o)),
    );
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            id={fieldId}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={error ? true : undefined}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal",
              selected.length === 0 && "text-muted-foreground",
              error && "border-destructive focus-visible:ring-destructive/40",
            )}
          >
            <span className="truncate">
              {selected.length === 0
                ? TEXT.PLACEHOLDER_MULTI
                : `${selected.length} ${
                    selected.length === 1 ? TEXT.SELECTED_ONE : TEXT.SELECTED_MANY
                  }`}
            </span>
            <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" strokeWidth={1.8} />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-1.5"
        >
          {options.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              {TEXT.NO_OPTIONS}
            </div>
          ) : (
            <div className="flex max-h-64 flex-col gap-0.5 overflow-auto">
              {options.map((opt) => {
                const checked = selected.includes(opt);
                return (
                  <label
                    key={opt}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                      checked ? "bg-accent" : "hover:bg-muted",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(opt)}
                    />
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {opt}
                    </span>
                    {checked && (
                      <Check className="size-3.5 shrink-0 text-primary" strokeWidth={2} />
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Selected values, removable without reopening the popover */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((opt) => (
            <Badge
              key={opt}
              className="gap-1 bg-accent text-accent-foreground hover:bg-accent"
            >
              {opt}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggle(opt)}
                  aria-label={`${TEXT.CLEAR}: ${opt}`}
                  className="-mr-0.5 rounded-sm opacity-60 transition-opacity hover:opacity-100"
                >
                  <X className="size-3" strokeWidth={2.2} />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </>
  );
}

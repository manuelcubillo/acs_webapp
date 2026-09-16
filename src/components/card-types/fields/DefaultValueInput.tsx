"use client";

/**
 * DefaultValueInput
 *
 * The "Valor por defecto" control in the field editor, shaped by the field
 * type being defined: a number field gets a numeric input, a date field the
 * native date picker, a Sí/No field a two-way choice, a select the options
 * configured just below it.
 *
 * It used to be a free-text box for every type, which let a master save
 * "mañana" as the default of a date field or "quizá" as the default of a
 * boolean.
 *
 * ## Why the value stays a string
 *
 * `field_definitions.default_value` is a `text` column, so every type is
 * serialised the way its own input already produces it: `"true"` / `"false"`
 * for a boolean, `YYYY-MM-DD` for a date, the plain number for a number. The
 * control is what changes, not the storage — no migration, and the existing
 * Zod boundary (`z.string().nullable()`) is untouched.
 *
 * A `photo` field has no meaningful default, so this component renders nothing
 * for it and the parent hides the label with it.
 */

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FieldType } from "@/lib/validation/types";

const TEXT = {
  PLACEHOLDER:     "Dejar en blanco si no aplica",
  PLACEHOLDER_NUM: "ej: 0",
  CLEAR:           "Quitar valor por defecto",
  CHOOSE:          "— Sin valor por defecto —",
  YES:             "Sí",
  NO:              "No",
  NO_OPTIONS:      "Añade opciones abajo para poder elegir un valor por defecto.",
} as const;

/** Serialised form of a boolean default — matches what the engine reads back. */
const BOOLEAN_TRUE = "true";
const BOOLEAN_FALSE = "false";

interface DefaultValueInputProps {
  fieldType: FieldType;
  value: string | null;
  onChange: (value: string | null) => void;
  /** Configured options — only consulted for a `select` field. */
  selectOptions: string[];
}

/** Whether this field type offers a default value at all. */
export function hasDefaultValue(fieldType: FieldType): boolean {
  return fieldType !== "photo";
}

export default function DefaultValueInput({
  fieldType,
  value,
  onChange,
  selectOptions,
}: DefaultValueInputProps) {
  if (!hasDefaultValue(fieldType)) return null;

  if (fieldType === "number") {
    return (
      <Input
        id="fe-default"
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={TEXT.PLACEHOLDER_NUM}
      />
    );
  }

  if (fieldType === "date") {
    // The native date picker has no reliable way back to "empty" — clearing it
    // means selecting the text and deleting, which most browsers fight. Hence
    // the same explicit clear button the dropdowns below use.
    return (
      <Clearable value={value} onClear={() => onChange(null)}>
        <Input
          id="fe-default"
          type="date"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      </Clearable>
    );
  }

  if (fieldType === "boolean") {
    return (
      <ClearableSelect
        value={value}
        onChange={onChange}
        options={[
          { value: BOOLEAN_TRUE, label: TEXT.YES },
          { value: BOOLEAN_FALSE, label: TEXT.NO },
        ]}
      />
    );
  }

  if (fieldType === "select") {
    if (selectOptions.length === 0) {
      return (
        <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {TEXT.NO_OPTIONS}
        </div>
      );
    }
    return (
      <ClearableSelect
        value={value}
        onChange={onChange}
        options={selectOptions.map((o) => ({ value: o, label: o }))}
      />
    );
  }

  return (
    <Input
      id="fe-default"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      placeholder={TEXT.PLACEHOLDER}
    />
  );
}

// ─── An explicit "no default" escape ─────────────────────────────────────────

interface ClearableProps {
  value: string | null;
  onClear: () => void;
  children: React.ReactNode;
}

/**
 * Wrap a control that cannot express "nothing chosen" on its own, and put a
 * clear button beside it once it holds a value.
 *
 * Both users need it for the same reason: a `Select` cannot offer an empty
 * `SelectItem` (Radix forbids it), and a native date input cannot be emptied
 * without a fight. A text or number input needs no such thing — backspace
 * already works.
 */
function Clearable({ value, onClear, children }: ClearableProps) {
  return (
    <div className="flex gap-2">
      <div className="min-w-0 flex-1">{children}</div>
      {value !== null && value !== "" && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onClear}
          title={TEXT.CLEAR}
          className="shrink-0"
        >
          <X strokeWidth={1.8} />
        </Button>
      )}
    </div>
  );
}

interface ClearableSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options: { value: string; label: string }[];
}

function ClearableSelect({ value, onChange, options }: ClearableSelectProps) {
  return (
    <Clearable value={value} onClear={() => onChange(null)}>
      <Select value={value ?? undefined} onValueChange={(v) => onChange(v || null)}>
        <SelectTrigger id="fe-default" className="w-full">
          <SelectValue placeholder={TEXT.CHOOSE} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Clearable>
  );
}

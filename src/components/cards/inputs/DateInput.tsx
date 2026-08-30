"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toDateInputValue } from "@/lib/fields/date-input-value";
import { cn } from "@/lib/utils";

interface DateInputProps {
  fieldId: string;
  label: string;
  value: unknown;
  onChange: (value: string | null) => void;
  isRequired?: boolean;
  error?: string;
  disabled?: boolean;
}

export default function DateInput({
  fieldId,
  label,
  value,
  onChange,
  isRequired,
  error,
  disabled,
}: DateInputProps) {
  // Normalize value to YYYY-MM-DD string for the native date input. A field
  // with no stored value renders EMPTY: see `toDateInputValue`.
  const strValue = toDateInputValue(value);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId} className="text-sm font-semibold text-foreground">
        {label}
        {isRequired && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Input
        id={fieldId}
        type="date"
        value={strValue}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        className={cn(error && "border-destructive focus-visible:ring-destructive/40")}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ValidationRules } from "@/lib/validation/types";

const TEXT = {
  PLACEHOLDER: "— Seleccionar —",
} as const;

interface SelectInputProps {
  fieldId: string;
  label: string;
  value: unknown;
  onChange: (value: string | null) => void;
  isRequired?: boolean;
  error?: string;
  disabled?: boolean;
  validationRules?: ValidationRules | null;
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
  // Extract options from the "allowedValues" validation rule.
  const options: string[] = [];
  if (validationRules?.rules) {
    const rule = validationRules.rules.find((r) => r.rule === "allowedValues");
    if (rule && Array.isArray(rule.value)) {
      options.push(...(rule.value as string[]));
    }
  }

  const current = value === null || value === undefined ? "" : String(value);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId} className="text-sm font-semibold text-foreground">
        {label}
        {isRequired && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Select
        value={current || undefined}
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
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

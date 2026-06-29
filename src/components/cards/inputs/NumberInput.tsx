"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface NumberInputProps {
  fieldId: string;
  label: string;
  value: unknown;
  onChange: (value: number | null) => void;
  isRequired?: boolean;
  error?: string;
  disabled?: boolean;
}

export default function NumberInput({
  fieldId,
  label,
  value,
  onChange,
  isRequired,
  error,
  disabled,
}: NumberInputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId} className="text-sm font-semibold text-foreground">
        {label}
        {isRequired && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Input
        id={fieldId}
        type="number"
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : Number(v));
        }}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        className={cn(error && "border-destructive focus-visible:ring-destructive/40")}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

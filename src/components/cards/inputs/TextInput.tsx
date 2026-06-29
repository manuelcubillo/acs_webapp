"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface TextInputProps {
  fieldId: string;
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  isRequired?: boolean;
  error?: string;
  disabled?: boolean;
}

export default function TextInput({
  fieldId,
  label,
  value,
  onChange,
  isRequired,
  error,
  disabled,
}: TextInputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId} className="text-sm font-semibold text-foreground">
        {label}
        {isRequired && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Input
        id={fieldId}
        type="text"
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        className={cn(error && "border-destructive focus-visible:ring-destructive/40")}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

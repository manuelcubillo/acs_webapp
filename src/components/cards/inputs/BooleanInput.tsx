"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface BooleanInputProps {
  fieldId: string;
  label: string;
  value: unknown;
  onChange: (value: boolean) => void;
  isRequired?: boolean;
  error?: string;
  disabled?: boolean;
}

export default function BooleanInput({
  fieldId,
  label,
  value,
  onChange,
  error,
  disabled,
}: BooleanInputProps) {
  const checked = Boolean(value);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <Switch
          id={fieldId}
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
        />
        <Label htmlFor={fieldId} className="text-sm font-semibold text-foreground">
          {label}
        </Label>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

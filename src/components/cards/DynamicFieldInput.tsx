"use client";

import type { FieldDefinitionShape, ValidationRules } from "@/lib/validation/types";
import TextInput from "./inputs/TextInput";
import NumberInput from "./inputs/NumberInput";
import BooleanInput from "./inputs/BooleanInput";
import DateInput from "./inputs/DateInput";
import PhotoInput from "./inputs/PhotoInput";
import SelectInput from "./inputs/SelectInput";

interface DynamicFieldInputProps {
  field: FieldDefinitionShape;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled?: boolean;
  tenantId?: string;
}

export default function DynamicFieldInput({
  field,
  value,
  onChange,
  error,
  disabled,
  tenantId,
}: DynamicFieldInputProps) {
  const common = {
    fieldId: field.id,
    label: field.label,
    isRequired: field.isRequired,
    error,
    disabled,
  };

  switch (field.fieldType) {
    case "text":
      return (
        <TextInput
          {...common}
          value={value}
          onChange={(v) => onChange(v)}
        />
      );
    case "number":
      return (
        <NumberInput
          {...common}
          value={value}
          onChange={(v) => onChange(v)}
        />
      );
    case "boolean":
      return (
        <BooleanInput
          {...common}
          value={value}
          onChange={(v) => onChange(v)}
        />
      );
    case "date":
      return (
        <DateInput
          {...common}
          value={value}
          onChange={(v) => onChange(v)}
        />
      );
    case "photo":
      return (
        <PhotoInput
          {...common}
          value={value}
          onChange={(v) => onChange(v)}
          tenantId={tenantId}
        />
      );
    case "select":
      return (
        <SelectInput
          {...common}
          value={value}
          onChange={(v) => onChange(v)}
          validationRules={field.validationRules as ValidationRules | null}
        />
      );
    default:
      return (
        <TextInput
          {...common}
          value={value}
          onChange={(v) => onChange(v)}
        />
      );
  }
}

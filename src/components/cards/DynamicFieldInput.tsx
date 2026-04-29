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
  /** Card UUID when editing an existing card. Photo uploads use it as owner. */
  cardId?: string | null;
  /** Signed read URL for the field's current photo (photo fields only). */
  photoReadUrl?: string | null;
}

export default function DynamicFieldInput({
  field,
  value,
  onChange,
  error,
  disabled,
  cardId,
  photoReadUrl,
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
          cardId={cardId}
          initialReadUrl={photoReadUrl ?? null}
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

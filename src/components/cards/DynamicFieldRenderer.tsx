"use client";

import type { FieldType } from "@/lib/validation/types";
import TextRenderer from "./renderers/TextRenderer";
import NumberRenderer from "./renderers/NumberRenderer";
import BooleanRenderer from "./renderers/BooleanRenderer";
import DateRenderer from "./renderers/DateRenderer";
import PhotoRenderer from "./renderers/PhotoRenderer";
import SelectRenderer from "./renderers/SelectRenderer";

const TEXT = { DASH: "—" } as const;

interface DynamicFieldRendererProps {
  fieldType: FieldType;
  value: unknown;
  label?: string;
  /** Card code — forwarded to photo fields to enable a named download. */
  cardCode?: string;
  /** Field definition id — forwarded to photo fields to select the object. */
  fieldDefinitionId?: string;
}

export default function DynamicFieldRenderer({
  fieldType,
  value,
  label,
  cardCode,
  fieldDefinitionId,
}: DynamicFieldRendererProps) {
  switch (fieldType) {
    case "text":
      return <TextRenderer value={value} />;
    case "number":
      return <NumberRenderer value={value} />;
    case "boolean":
      return <BooleanRenderer value={value} />;
    case "date":
      return <DateRenderer value={value} />;
    case "photo":
      return (
        <PhotoRenderer
          value={value}
          label={label}
          cardCode={cardCode}
          fieldDefinitionId={fieldDefinitionId}
        />
      );
    case "select":
      return <SelectRenderer value={value} />;
    default:
      return (
        <span className="text-muted-foreground">
          {String(value ?? TEXT.DASH)}
        </span>
      );
  }
}

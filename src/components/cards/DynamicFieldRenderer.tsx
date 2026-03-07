"use client";

import type { FieldType } from "@/lib/validation/types";
import TextRenderer from "./renderers/TextRenderer";
import NumberRenderer from "./renderers/NumberRenderer";
import BooleanRenderer from "./renderers/BooleanRenderer";
import DateRenderer from "./renderers/DateRenderer";
import PhotoRenderer from "./renderers/PhotoRenderer";
import SelectRenderer from "./renderers/SelectRenderer";

interface DynamicFieldRendererProps {
  fieldType: FieldType;
  value: unknown;
  label?: string;
}

export default function DynamicFieldRenderer({
  fieldType,
  value,
  label,
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
      return <PhotoRenderer value={value} label={label} />;
    case "select":
      return <SelectRenderer value={value} />;
    default:
      return (
        <span style={{ color: "var(--color-muted)" }}>
          {String(value ?? "—")}
        </span>
      );
  }
}

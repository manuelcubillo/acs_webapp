/**
 * mock-preview-data — generates plausible sample data for the in-editor
 * design preview. Keys every field definition by ID with a value derived
 * from its type, so a "bound" preview shows realistic content without
 * requiring a real Card.
 */

import type { CommonFieldDefinition, FieldType } from "@/lib/dal";

export interface MockPreviewData {
  fieldValues: Record<string, string>;
  photoValues: Record<string, string>;
  cardCode: string;
}

const SAMPLE_PHOTO_DATA_URI =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200" viewBox="0 0 160 200">
  <defs>
    <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#cbd5f5"/>
      <stop offset="1" stop-color="#8a99c8"/>
    </linearGradient>
  </defs>
  <rect width="160" height="200" fill="url(#bg)"/>
  <circle cx="80" cy="76" r="30" fill="#f1f5ff"/>
  <path d="M30 180 C 30 130 130 130 130 180 Z" fill="#f1f5ff"/>
  <text x="80" y="195" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#33406a">Foto de muestra</text>
</svg>`,
  );

/**
 * Returns a sample display string for the given field type.
 * Uses the field label (when provided) so the preview echoes the schema.
 */
function sampleFor(fieldType: FieldType, label: string): string {
  const trimmed = (label || "").trim();
  switch (fieldType) {
    case "text":
      return trimmed ? `${trimmed} de muestra` : "Texto de muestra";
    case "number":
      return "42";
    case "date":
      return new Date().toLocaleDateString("es-ES");
    case "boolean":
      return "Sí";
    case "select":
      return "Opción";
    case "photo":
      return SAMPLE_PHOTO_DATA_URI;
    default:
      return trimmed || "Valor";
  }
}

/**
 * Builds mock field/photo values for every field definition referenced by
 * the editor's available common fields.
 */
export function buildMockPreviewData(
  availableFields: CommonFieldDefinition[],
): MockPreviewData {
  const fieldValues: Record<string, string> = {};
  const photoValues: Record<string, string> = {};

  for (const field of availableFields) {
    const sample = sampleFor(field.fieldType, field.label || field.name);
    if (field.fieldType === "photo") {
      for (const id of field.fieldDefinitionIds) photoValues[id] = sample;
    } else {
      for (const id of field.fieldDefinitionIds) fieldValues[id] = sample;
    }
  }

  return {
    fieldValues,
    photoValues,
    cardCode: "VRD-DEMO-0001",
  };
}

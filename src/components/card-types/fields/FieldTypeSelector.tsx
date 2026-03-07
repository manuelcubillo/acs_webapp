"use client";

/**
 * FieldTypeSelector
 *
 * A visual grid for selecting the type of a field definition.
 * Each type shows an icon, label, and brief description.
 */

import {
  Type,
  Hash,
  ToggleLeft,
  Calendar,
  Camera,
  List,
} from "lucide-react";
import type { FieldType } from "@/hooks/useCardTypeWizard";

interface FieldTypeMeta {
  type: FieldType;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  color: string;
  bg: string;
}

const FIELD_TYPES: FieldTypeMeta[] = [
  {
    type: "text",
    label: "Texto",
    description: "Nombres, descripciones, códigos",
    icon: Type,
    color: "#4f5bff",
    bg: "#eef0ff",
  },
  {
    type: "number",
    label: "Número",
    description: "Valores numéricos enteros o decimales",
    icon: Hash,
    color: "#059669",
    bg: "#ecfdf5",
  },
  {
    type: "boolean",
    label: "Sí / No",
    description: "Casilla verdadero o falso",
    icon: ToggleLeft,
    color: "#d97706",
    bg: "#fffbeb",
  },
  {
    type: "date",
    label: "Fecha",
    description: "Fechas con validación de rango",
    icon: Calendar,
    color: "#7c3aed",
    bg: "#f5f3ff",
  },
  {
    type: "photo",
    label: "Foto",
    description: "Imagen o fotografía adjunta",
    icon: Camera,
    color: "#db2777",
    bg: "#fdf2f8",
  },
  {
    type: "select",
    label: "Selección",
    description: "Lista de opciones predefinidas",
    icon: List,
    color: "#0284c7",
    bg: "#f0f9ff",
  },
];

interface FieldTypeSelectorProps {
  value: FieldType | null;
  onChange?: (type: FieldType) => void;
  /** If true, the selector is read-only (used in detail view). */
  readOnly?: boolean;
}

export default function FieldTypeSelector({
  value,
  onChange,
  readOnly = false,
}: FieldTypeSelectorProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 10,
      }}
    >
      {FIELD_TYPES.map((ft) => {
        const Icon = ft.icon;
        const selected = value === ft.type;
        return (
          <button
            key={ft.type}
            type="button"
            disabled={readOnly}
            onClick={() => !readOnly && onChange?.(ft.type)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 8,
              padding: "14px 16px",
              borderRadius: 12,
              border: selected
                ? `2px solid ${ft.color}`
                : "1.5px solid var(--color-border)",
              background: selected ? ft.bg : "#fff",
              cursor: readOnly ? "default" : "pointer",
              transition: "all 0.15s ease",
              textAlign: "left",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                background: selected ? ft.color : "#f3f4f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: selected ? "#fff" : "#6b7094",
                transition: "all 0.15s ease",
                flexShrink: 0,
              }}
            >
              <Icon size={18} strokeWidth={1.8} />
            </div>
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: selected ? ft.color : "var(--color-dark)",
                  marginBottom: 2,
                  fontFamily: "var(--font-heading)",
                }}
              >
                {ft.label}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--color-muted)",
                  lineHeight: 1.4,
                }}
              >
                {ft.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

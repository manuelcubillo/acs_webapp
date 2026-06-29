"use client";

/**
 * FieldTypeSelector
 *
 * A visual grid for selecting the type of a field definition.
 * Each type shows an icon, label, and brief description.
 *
 * Field types are color-coded for quick recognition. These are decorative
 * category accents (NOT access-control state) and use the Tailwind palette +
 * brand/neutral tokens, consistent with CardActions.tsx.
 */

import {
  Type,
  Hash,
  ToggleLeft,
  Calendar,
  Camera,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FieldType } from "@/hooks/useCardTypeWizard";

export interface FieldTypeMeta {
  type: FieldType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Border when selected. */
  selectedBorder: string;
  /** Card background when selected. */
  selectedBg: string;
  /** Label color when selected. */
  selectedLabel: string;
  /** Icon chip when selected. */
  selectedIcon: string;
}

export const FIELD_TYPES: FieldTypeMeta[] = [
  {
    type: "text",
    label: "Texto",
    description: "Nombres, descripciones, códigos",
    icon: Type,
    selectedBorder: "border-primary",
    selectedBg: "bg-accent",
    selectedLabel: "text-primary",
    selectedIcon: "bg-primary text-primary-foreground",
  },
  {
    type: "number",
    label: "Número",
    description: "Valores numéricos enteros o decimales",
    icon: Hash,
    selectedBorder: "border-emerald-500",
    selectedBg: "bg-emerald-500/10",
    selectedLabel: "text-emerald-600 dark:text-emerald-400",
    selectedIcon: "bg-emerald-600 text-white",
  },
  {
    type: "boolean",
    label: "Sí / No",
    description: "Casilla verdadero o falso",
    icon: ToggleLeft,
    selectedBorder: "border-amber-500",
    selectedBg: "bg-amber-500/10",
    selectedLabel: "text-amber-600 dark:text-amber-400",
    selectedIcon: "bg-amber-600 text-white",
  },
  {
    type: "date",
    label: "Fecha",
    description: "Fechas con validación de rango",
    icon: Calendar,
    selectedBorder: "border-violet-500",
    selectedBg: "bg-violet-500/10",
    selectedLabel: "text-violet-600 dark:text-violet-400",
    selectedIcon: "bg-violet-600 text-white",
  },
  {
    type: "photo",
    label: "Foto",
    description: "Imagen o fotografía adjunta",
    icon: Camera,
    selectedBorder: "border-pink-500",
    selectedBg: "bg-pink-500/10",
    selectedLabel: "text-pink-600 dark:text-pink-400",
    selectedIcon: "bg-pink-600 text-white",
  },
  {
    type: "select",
    label: "Selección",
    description: "Lista de opciones predefinidas",
    icon: List,
    selectedBorder: "border-sky-500",
    selectedBg: "bg-sky-500/10",
    selectedLabel: "text-sky-600 dark:text-sky-400",
    selectedIcon: "bg-sky-600 text-white",
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
    <div className="grid grid-cols-3 gap-2.5">
      {FIELD_TYPES.map((ft) => {
        const Icon = ft.icon;
        const selected = value === ft.type;
        return (
          <button
            key={ft.type}
            type="button"
            disabled={readOnly}
            onClick={() => !readOnly && onChange?.(ft.type)}
            className={cn(
              "flex flex-col items-start gap-2 rounded-xl border-2 px-4 py-3.5 text-left transition-all",
              readOnly ? "cursor-default" : "cursor-pointer",
              selected
                ? cn(ft.selectedBorder, ft.selectedBg)
                : "border-border bg-card",
            )}
          >
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-[9px] transition-all",
                selected ? ft.selectedIcon : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-4.5" strokeWidth={1.8} />
            </div>
            <div>
              <div
                className={cn(
                  "mb-0.5 font-heading text-sm font-semibold",
                  selected ? ft.selectedLabel : "text-foreground",
                )}
              >
                {ft.label}
              </div>
              <div className="text-xs leading-snug text-muted-foreground">
                {ft.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

interface FieldTypeDisplayProps {
  value: FieldType;
}

/**
 * FieldTypeDisplay
 *
 * Read-only, single-type rendering of a field's type — a compact chip showing the
 * type's icon and label inline. Used in detail views where only one type applies
 * (unlike FieldTypeSelector, which renders the full picker grid).
 */
export function FieldTypeDisplay({ value }: FieldTypeDisplayProps) {
  const ft = FIELD_TYPES.find((t) => t.type === value);
  if (!ft) return null;

  const Icon = ft.icon;
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "flex size-8.5 shrink-0 items-center justify-center rounded-[9px]",
          ft.selectedIcon,
        )}
      >
        <Icon className="size-4" strokeWidth={1.8} />
      </div>
      <span className={cn("font-heading text-sm font-semibold", ft.selectedLabel)}>
        {ft.label}
      </span>
    </div>
  );
}

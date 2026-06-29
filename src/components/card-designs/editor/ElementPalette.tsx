"use client";

/**
 * ElementPalette — left panel of the card design editor.
 * Each item supports two interactions:
 *   - Drag onto the canvas to drop at the cursor position.
 *   - Double-click to add the element centered on the canvas.
 */

import { Type, ImageIcon, QrCode, Barcode, Square, Minus } from "lucide-react";
import type { LayoutNode } from "@/lib/card-designs/types";

const LABELS = {
  title: "Elementos",
  text: "Texto",
  image: "Imagen",
  qr: "Código QR",
  barcode: "Código de barras",
  rect: "Rectángulo",
  line: "Línea",
  hint: "Arrastra un elemento al canvas para añadirlo, o haz doble clic para insertarlo centrado.",
} as const;

interface PaletteItem {
  type: LayoutNode["type"];
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const ITEMS: PaletteItem[] = [
  { type: "text", label: LABELS.text, icon: Type },
  { type: "image", label: LABELS.image, icon: ImageIcon },
  { type: "qr", label: LABELS.qr, icon: QrCode },
  { type: "barcode128", label: LABELS.barcode, icon: Barcode },
  { type: "rect", label: LABELS.rect, icon: Square },
  { type: "line", label: LABELS.line, icon: Minus },
];

interface Props {
  onAddCentered: (type: LayoutNode["type"]) => void;
}

export default function ElementPalette({ onAddCentered }: Props) {
  function handleDragStart(e: React.DragEvent, type: LayoutNode["type"]) {
    e.dataTransfer.setData("nodeType", type);
    e.dataTransfer.effectAllowed = "copy";
  }

  return (
    <div className="flex w-45 shrink-0 flex-col overflow-hidden border-r bg-card">
      {/* Header */}
      <div className="border-b px-4 pt-3.5 pb-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {LABELS.title}
      </div>

      {/* Items */}
      <div className="flex flex-col gap-0.5 px-2.5 py-2">
        {ITEMS.map(({ type, label, icon: Icon }) => (
          <div
            key={type}
            draggable
            onDragStart={(e) => handleDragStart(e, type)}
            onDoubleClick={() => onAddCentered(type)}
            title={label}
            className="flex cursor-grab select-none items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-primary"
          >
            <Icon className="size-4" strokeWidth={1.8} />
            {label}
          </div>
        ))}
      </div>

      {/* Hint */}
      <div className="mx-2.5 mt-auto mb-3.5 rounded-lg bg-muted px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        {LABELS.hint}
      </div>
    </div>
  );
}

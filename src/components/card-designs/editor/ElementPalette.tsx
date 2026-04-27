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
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
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
    <div
      style={{
        width: 180,
        flexShrink: 0,
        background: "#fff",
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px 10px",
          borderBottom: "1px solid var(--color-border-soft)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--color-muted)",
        }}
      >
        {LABELS.title}
      </div>

      {/* Items */}
      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        {ITEMS.map(({ type, label, icon: Icon }) => (
          <div
            key={type}
            draggable
            onDragStart={(e) => handleDragStart(e, type)}
            onDoubleClick={() => onAddCentered(type)}
            title={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 10px",
              borderRadius: 8,
              cursor: "grab",
              userSelect: "none",
              color: "var(--color-dark)",
              fontSize: 13,
              fontWeight: 500,
              transition: "background 0.1s",
            }}
            onMouseOver={(e) => {
              (e.currentTarget as HTMLDivElement).style.background =
                "var(--color-primary-light)";
              (e.currentTarget as HTMLDivElement).style.color =
                "var(--color-primary)";
            }}
            onMouseOut={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = "transparent";
              (e.currentTarget as HTMLDivElement).style.color = "var(--color-dark)";
            }}
          >
            <Icon size={16} strokeWidth={1.8} />
            {label}
          </div>
        ))}
      </div>

      {/* Hint */}
      <div
        style={{
          margin: "auto 10px 14px",
          padding: "10px 12px",
          background: "var(--color-border-soft)",
          borderRadius: 8,
          fontSize: 11.5,
          color: "var(--color-muted)",
          lineHeight: 1.5,
        }}
      >
        {LABELS.hint}
      </div>
    </div>
  );
}

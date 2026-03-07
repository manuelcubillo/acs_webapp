"use client";

import { LayoutList, Table2 } from "lucide-react";

export type ViewMode = "table" | "profile";

interface CardViewToggleProps {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
}

const VIEWS = [
  { mode: "table" as const, Icon: Table2, label: "Tabla" },
  { mode: "profile" as const, Icon: LayoutList, label: "Fichas" },
];

export default function CardViewToggle({ view, onChange }: CardViewToggleProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        background: "#f3f4f6",
        borderRadius: 8,
        padding: 2,
      }}
    >
      {VIEWS.map(({ mode, Icon, label }) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          title={label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 12px",
            borderRadius: 6,
            background: view === mode ? "#fff" : "transparent",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            color:
              view === mode ? "var(--color-dark)" : "var(--color-muted)",
            boxShadow:
              view === mode ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            transition: "all 0.15s",
          }}
        >
          <Icon size={14} strokeWidth={1.8} />
          {label}
        </button>
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Columns3, Check } from "lucide-react";
import type { FieldDefinition } from "@/lib/dal/types";

interface CardColumnSelectorProps {
  fields: FieldDefinition[];
  visibleColumns: string[];
  onToggle: (fieldId: string) => void;
  onReset: () => void;
}

export default function CardColumnSelector({
  fields,
  visibleColumns,
  onToggle,
  onReset,
}: CardColumnSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          borderRadius: 8,
          border: "1.5px solid var(--color-border)",
          background: "#fff",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--color-dark)",
          whiteSpace: "nowrap",
        }}
      >
        <Columns3 size={15} strokeWidth={1.8} />
        Columnas
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 10 }}
          />

          {/* Dropdown */}
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              background: "#fff",
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              padding: "6px 0",
              zIndex: 20,
              minWidth: 210,
              boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
            }}
          >
            {fields.map((f) => {
              const visible = visibleColumns.includes(f.id);
              return (
                <button
                  key={f.id}
                  onClick={() => onToggle(f.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "8px 14px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--color-dark)",
                    textAlign: "left",
                  }}
                >
                  <span>{f.label}</span>
                  {visible && (
                    <Check size={14} color="var(--color-primary)" />
                  )}
                </button>
              );
            })}

            <div
              style={{
                borderTop: "1px solid var(--color-border-soft)",
                marginTop: 4,
                paddingTop: 4,
              }}
            >
              <button
                onClick={() => {
                  onReset();
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px 14px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--color-muted)",
                  textAlign: "left",
                }}
              >
                Restaurar predeterminadas
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

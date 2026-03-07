"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface PhotoRendererProps {
  value: unknown;
  label?: string;
}

export default function PhotoRenderer({ value, label }: PhotoRendererProps) {
  const [lightbox, setLightbox] = useState(false);

  if (!value) {
    return (
      <span style={{ color: "var(--color-muted)", fontStyle: "italic" }}>—</span>
    );
  }

  const src = String(value);

  return (
    <>
      <img
        src={src}
        alt={label ?? "Foto"}
        onClick={() => setLightbox(true)}
        style={{
          width: 48,
          height: 48,
          borderRadius: 8,
          objectFit: "cover",
          cursor: "pointer",
          border: "1px solid var(--color-border)",
          display: "block",
        }}
      />

      {lightbox && (
        <div
          onClick={() => setLightbox(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <button
            onClick={() => setLightbox(false)}
            style={{
              position: "absolute",
              top: 20,
              right: 20,
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <X size={20} />
          </button>
          <img
            src={src}
            alt={label ?? "Foto"}
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              borderRadius: 12,
              objectFit: "contain",
            }}
          />
        </div>
      )}
    </>
  );
}

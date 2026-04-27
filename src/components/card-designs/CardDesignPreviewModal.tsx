"use client";

/**
 * CardDesignPreviewModal — renders a card design with real (or sample) data
 * and allows the user to download the result as a PNG.
 *
 * Uses renderDesignToDataURL from @/lib/card-designs/render (Canvas API).
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Download, Loader2, AlertCircle } from "lucide-react";
import type { CardDesignLayout } from "@/lib/card-designs/types";
import { renderDesignToDataURL } from "@/lib/card-designs/render";

const LABELS = {
  title: "Vista previa del diseño",
  downloading: "Generando…",
  download: "Descargar PNG",
  close: "Cerrar",
  renderError: "No se pudo generar la vista previa.",
  loading: "Renderizando diseño…",
} as const;

interface Props {
  layout: CardDesignLayout;
  fieldValues: Record<string, string>;
  photoValues: Record<string, string>;
  cardCode: string;
  designName: string;
  onClose: () => void;
}

export default function CardDesignPreviewModal({
  layout,
  fieldValues,
  photoValues,
  cardCode,
  designName,
  onClose,
}: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Render on mount
  useEffect(() => {
    let cancelled = false;
    renderDesignToDataURL({ layout, fieldValues, photoValues, cardCode, scale: 2 })
      .then((url) => { if (!cancelled) setDataUrl(url); })
      .catch(() => { if (!cancelled) setError(LABELS.renderError); });
    return () => { cancelled = true; };
  }, [layout, fieldValues, photoValues, cardCode]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  function handleDownload() {
    if (!dataUrl) return;
    setDownloading(true);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${designName.replace(/[^a-z0-9]/gi, "_")}.png`;
    a.click();
    setTimeout(() => setDownloading(false), 500);
  }

  const modal = (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          maxWidth: 640,
          width: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-border-soft)",
            gap: 12,
          }}
        >
          <span
            style={{
              flex: 1,
              fontSize: 15,
              fontWeight: 700,
              fontFamily: "var(--font-heading)",
              color: "var(--color-dark)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {LABELS.title} — {designName}
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--color-muted)",
              display: "flex",
              padding: 4,
            }}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Preview area */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "#f3f4f6",
            minHeight: 200,
          }}
        >
          {error ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "#dc2626" }}>
              <AlertCircle size={28} strokeWidth={1.5} />
              <span style={{ fontSize: 13 }}>{error}</span>
            </div>
          ) : !dataUrl ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "var(--color-muted)" }}>
              <Loader2 size={28} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: 13 }}>{LABELS.loading}</span>
            </div>
          ) : (
            <img
              src={dataUrl}
              alt={designName}
              style={{
                maxWidth: "100%",
                maxHeight: "60vh",
                objectFit: "contain",
                borderRadius: 8,
                boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "14px 20px",
            borderTop: "1px solid var(--color-border-soft)",
          }}
        >
          <button onClick={onClose} className="btn btn-secondary">
            {LABELS.close}
          </button>
          <button
            onClick={handleDownload}
            disabled={!dataUrl || downloading}
            className="btn btn-primary"
          >
            {downloading ? (
              <Loader2 size={14} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <Download size={14} strokeWidth={2} />
            )}
            {downloading ? LABELS.downloading : LABELS.download}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

"use client";

/**
 * TemplatePicker — modal that lets the user load a starter template into
 * the current design. Only templates whose kind matches the design's kind
 * are shown. Each tile previews the template via renderDesignToDataURL.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Sparkles } from "lucide-react";
import {
  SAMPLE_TEMPLATES,
  cloneTemplateLayout,
  type DesignTemplate,
} from "@/lib/card-designs/templates";
import type { CardDesignLayout } from "@/lib/card-designs/types";
import { renderDesignToDataURL } from "@/lib/card-designs/render";

const LABELS = {
  title: "Cargar plantilla",
  subtitle:
    "Las plantillas reemplazan completamente el diseño actual. Después puedes editar cualquier elemento.",
  empty: "No hay plantillas disponibles para este tipo de diseño.",
  apply: "Usar esta plantilla",
  cancel: "Cancelar",
  thumbLoading: "Generando vista previa…",
  customizable: "Personalizable",
  warningTitle: "Reemplazar diseño actual",
  warningBody:
    "Vas a sobrescribir el diseño actual con la plantilla seleccionada. Esta acción se puede deshacer con Ctrl+Z.",
  warningConfirm: "Reemplazar",
  close: "Cerrar",
} as const;

interface Props {
  /** Restrict the picker to templates of this kind (matches the current design). */
  kind: "card" | "passbook";
  /** True when the current design has nodes — used to show the replace warning. */
  designHasContent: boolean;
  onApply: (layout: CardDesignLayout) => void;
  onClose: () => void;
}

export default function TemplatePicker({
  kind,
  designHasContent,
  onApply,
  onClose,
}: Props) {
  const templates = useMemo(
    () => SAMPLE_TEMPLATES.filter((t) => t.kind === kind),
    [kind],
  );

  const [pendingTemplate, setPendingTemplate] = useState<DesignTemplate | null>(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (pendingTemplate) setPendingTemplate(null);
        else onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pendingTemplate]);

  function handleApply(template: DesignTemplate) {
    if (designHasContent) {
      setPendingTemplate(template);
      return;
    }
    onApply(cloneTemplateLayout(template));
    onClose();
  }

  function confirmApply() {
    if (!pendingTemplate) return;
    onApply(cloneTemplateLayout(pendingTemplate));
    setPendingTemplate(null);
    onClose();
  }

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,18,40,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          maxWidth: 920,
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
            padding: "18px 22px",
            borderBottom: "1px solid var(--color-border-soft)",
            gap: 12,
          }}
        >
          <Sparkles size={18} strokeWidth={1.8} style={{ color: "var(--color-primary)" }} />
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                fontFamily: "var(--font-heading)",
                color: "var(--color-dark)",
              }}
            >
              {LABELS.title}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 2 }}>
              {LABELS.subtitle}
            </div>
          </div>
          <button
            onClick={onClose}
            title={LABELS.close}
            style={iconBtnStyle()}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 22, background: "#f8fafc" }}>
          {templates.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-muted)", textAlign: "center", padding: 24 }}>
              {LABELS.empty}
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 16,
              }}
            >
              {templates.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  template={tpl}
                  onApply={() => handleApply(tpl)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation modal nested for replace warning */}
      {pendingTemplate && (
        <ConfirmReplace
          template={pendingTemplate}
          onCancel={() => setPendingTemplate(null)}
          onConfirm={confirmApply}
        />
      )}
    </div>
  );

  return createPortal(modal, document.body);
}

// ─── Template card ──────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onApply,
}: {
  template: DesignTemplate;
  onApply: () => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [thumbErr, setThumbErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    renderDesignToDataURL({
      layout: template.layout,
      fieldValues: {},
      photoValues: {},
      cardCode: "VRD-DEMO-0001",
      scale: 1,
    })
      .then((url) => {
        if (!cancelled) setThumb(url);
      })
      .catch(() => {
        if (!cancelled) setThumbErr(true);
      });
    return () => {
      cancelled = true;
    };
  }, [template]);

  const aspect =
    template.layout.canvas.width / Math.max(1, template.layout.canvas.height);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid var(--color-border)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 2px 6px rgba(15,23,42,0.06)",
      }}
    >
      {/* Thumbnail */}
      <div
        style={{
          aspectRatio: String(aspect),
          background: "#f1f5f9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 12,
        }}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={template.name}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              borderRadius: 6,
              boxShadow: "0 4px 14px rgba(15,23,42,0.12)",
            }}
          />
        ) : thumbErr ? (
          <span style={{ fontSize: 12, color: "var(--color-muted)" }}>—</span>
        ) : (
          <Loader2 size={20} strokeWidth={2} style={{ animation: "spin 1s linear infinite", color: "var(--color-muted)" }} />
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--color-dark)",
              fontFamily: "var(--font-heading)",
            }}
          >
            {template.name}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--color-muted)", marginTop: 2, lineHeight: 1.45 }}>
            {template.description}
          </div>
        </div>

        {template.customizableHints.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {template.customizableHints.map((hint) => (
              <span
                key={hint}
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  padding: "3px 7px",
                  borderRadius: 999,
                  background: "var(--color-primary-light)",
                  color: "var(--color-primary)",
                }}
              >
                {hint}
              </span>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onApply}
          className="btn btn-primary"
          style={{ marginTop: 4, height: 34, fontSize: 13 }}
        >
          {LABELS.apply}
        </button>
      </div>
    </div>
  );
}

// ─── Confirmation overlay ───────────────────────────────────────────────────

function ConfirmReplace({
  template,
  onCancel,
  onConfirm,
}: {
  template: DesignTemplate;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,18,40,0.55)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 14,
          maxWidth: 420,
          width: "100%",
          padding: "22px 24px 20px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            fontFamily: "var(--font-heading)",
            color: "var(--color-dark)",
            marginBottom: 8,
          }}
        >
          {LABELS.warningTitle}
        </div>
        <p style={{ fontSize: 13, color: "var(--color-secondary)", lineHeight: 1.5, margin: 0 }}>
          {LABELS.warningBody}
        </p>
        <p style={{ fontSize: 12.5, color: "var(--color-muted)", margin: "10px 0 0", fontStyle: "italic" }}>
          {template.name}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onCancel} className="btn btn-secondary">
            {LABELS.cancel}
          </button>
          <button onClick={onConfirm} className="btn btn-primary">
            {LABELS.warningConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function iconBtnStyle(): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "1.5px solid var(--color-border)",
    background: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--color-muted)",
  };
}

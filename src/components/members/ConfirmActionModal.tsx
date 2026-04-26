"use client";

/**
 * ConfirmActionModal — generic confirmation modal for member management actions.
 * Supports a default (neutral) and destructive (red) variant.
 */

import { useEffect } from "react";
import { AlertTriangle, Loader2, X, Info } from "lucide-react";

export interface ConfirmActionModalProps {
  isOpen: boolean;
  isLoading: boolean;
  /** Modal title. */
  title: string;
  /** Subtitle shown under the title (e.g. "Esta acción no se puede deshacer."). */
  subtitle?: string;
  /** Body text. */
  body: string;
  /** Cancel button label. */
  cancelLabel?: string;
  /** Confirm button label. */
  confirmLabel: string;
  /** Label shown while loading. */
  confirmingLabel?: string;
  /** When true, uses red destructive styling. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmActionModal({
  isOpen,
  isLoading,
  title,
  subtitle,
  body,
  cancelLabel = "Cancelar",
  confirmLabel,
  confirmingLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmActionModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    document.getElementById("confirm-modal-cancel")?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isLoading) onCancel();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  const headerBg = destructive ? "#fff7f7" : "#f8f9ff";
  const headerBorder = destructive ? "#fee2e2" : "#e0e7ff";
  const iconBg = destructive ? "#fef2f2" : "#eff2ff";
  const iconBorder = destructive ? "#fca5a5" : "#c7d2fe";
  const iconColor = destructive ? "#dc2626" : "#4f5bff";
  const titleColor = destructive ? "#991b1b" : "var(--color-dark)";
  const subtitleColor = destructive ? "#dc2626" : "var(--color-muted)";
  const btnBg = destructive ? "#dc2626" : "var(--color-primary)";
  const btnBorder = destructive ? "#dc2626" : "var(--color-primary)";
  const btnBgLoading = destructive ? "#fca5a5" : "#a5b4fc";

  return (
    <>
      <div
        onClick={() => !isLoading && onCancel()}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 9998,
        }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 9999,
          width: "min(440px, calc(100vw - 32px))",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.1)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "20px 20px 16px",
          borderBottom: `1px solid ${headerBorder}`,
          background: headerBg,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: iconBg,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            border: `1.5px solid ${iconBorder}`,
          }}>
            {destructive
              ? <AlertTriangle size={20} color={iconColor} strokeWidth={2} />
              : <Info size={20} color={iconColor} strokeWidth={2} />
            }
          </div>
          <div style={{ flex: 1 }}>
            <div id="confirm-modal-title" style={{ fontSize: 15, fontWeight: 700, color: titleColor }}>
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: 12.5, color: subtitleColor, marginTop: 2 }}>
                {subtitle}
              </div>
            )}
          </div>
          {!isLoading && (
            <button
              onClick={onCancel}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: 4, borderRadius: 6, color: "#9ca3af",
                display: "flex", alignItems: "center",
              }}
              aria-label="Cerrar"
            >
              <X size={18} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: "18px 20px" }}>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--color-secondary)", lineHeight: 1.6 }}>
            {body}
          </p>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", gap: 10, justifyContent: "flex-end",
          padding: "14px 20px",
          borderTop: "1px solid var(--color-border-soft)",
          background: "#f9fafb",
        }}>
          <button
            id="confirm-modal-cancel"
            onClick={onCancel}
            disabled={isLoading}
            style={{
              padding: "9px 18px", borderRadius: 9,
              border: "1.5px solid var(--color-border)",
              background: "#fff", cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 600,
              color: "var(--color-secondary)",
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 18px", borderRadius: 9,
              border: `1.5px solid ${btnBorder}`,
              background: isLoading ? btnBgLoading : btnBg,
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 600,
              color: "#fff",
            }}
          >
            {isLoading && (
              <Loader2 size={14} strokeWidth={2} style={{ animation: "spin 0.8s linear infinite" }} />
            )}
            {isLoading ? (confirmingLabel ?? "Procesando…") : confirmLabel}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </>
  );
}

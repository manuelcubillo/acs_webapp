"use client";

import { useEffect } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

const LABELS = {
  title: "Eliminar cuenta",
  subtitle: "Esta acción no se puede deshacer.",
  body: "Tu cuenta y datos de perfil serán eliminados permanentemente. Los datos del tenant no se verán afectados.",
  cancel: "Cancelar",
  confirm: "Eliminar mi cuenta",
  confirming: "Eliminando…",
  closeAriaLabel: "Cerrar",
} as const;

export interface DeleteAccountModalProps {
  isOpen: boolean;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteAccountModal({
  isOpen,
  isLoading,
  onConfirm,
  onCancel,
}: DeleteAccountModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    document.getElementById("delete-account-cancel")?.focus();
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
        aria-labelledby="delete-account-title"
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
          borderBottom: "1px solid #fee2e2",
          background: "#fff7f7",
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "#fef2f2",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            border: "1.5px solid #fca5a5",
          }}>
            <AlertTriangle size={20} color="#dc2626" strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div
              id="delete-account-title"
              style={{ fontSize: 15, fontWeight: 700, color: "#991b1b" }}
            >
              {LABELS.title}
            </div>
            <div style={{ fontSize: 12.5, color: "#dc2626", marginTop: 2 }}>
              {LABELS.subtitle}
            </div>
          </div>
          {!isLoading && (
            <button
              onClick={onCancel}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: 4, borderRadius: 6, color: "#9ca3af",
                display: "flex", alignItems: "center",
              }}
              aria-label={LABELS.closeAriaLabel}
            >
              <X size={18} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: "18px 20px" }}>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--color-secondary)", lineHeight: 1.6 }}>
            {LABELS.body}
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
            id="delete-account-cancel"
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
            {LABELS.cancel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 18px", borderRadius: 9,
              border: "1.5px solid #dc2626",
              background: isLoading ? "#fca5a5" : "#dc2626",
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 600,
              color: "#fff",
            }}
          >
            {isLoading && (
              <Loader2 size={14} strokeWidth={2} style={{ animation: "spin 0.8s linear infinite" }} />
            )}
            {isLoading ? LABELS.confirming : LABELS.confirm}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

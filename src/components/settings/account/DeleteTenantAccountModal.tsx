"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

const CONFIRM_PHRASE = "confirmar borrado de datos";

const LABELS = {
  title: "Eliminar cuenta y organización",
  subtitle: "Todos los datos serán eliminados permanentemente.",
  warningIntro: (tenantName: string) =>
    `Eres el único master activo de ${tenantName}. Si eliminas tu cuenta, toda la información de la organización será eliminada de forma permanente e irrecuperable.`,
  warningListTitle: "Se eliminará permanentemente:",
  warningItems: [
    "Todos los tipos de carnet y sus definiciones",
    "Todos los carnets emitidos y sus datos",
    "El historial completo de acciones",
    "La configuración del panel",
    "Todos los miembros del tenant",
  ],
  phraseLabel: "Para confirmar, escribe exactamente:",
  phrasePlaceholder: CONFIRM_PHRASE,
  cancel: "Cancelar",
  confirm: "Eliminar cuenta y todos los datos",
  confirming: "Eliminando…",
  closeAriaLabel: "Cerrar",
} as const;

export interface DeleteTenantAccountModalProps {
  isOpen: boolean;
  isLoading: boolean;
  tenantName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteTenantAccountModal({
  isOpen,
  isLoading,
  tenantName,
  onConfirm,
  onCancel,
}: DeleteTenantAccountModalProps) {
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const canConfirm = confirmPhrase.trim() === CONFIRM_PHRASE;

  useEffect(() => {
    if (!isOpen) {
      setConfirmPhrase("");
      return;
    }
    document.getElementById("delete-tenant-cancel")?.focus();
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
        aria-labelledby="delete-tenant-title"
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 9999,
          width: "min(500px, calc(100vw - 32px))",
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
            <AlertTriangle size={22} color="#dc2626" strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div
              id="delete-tenant-title"
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
        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--color-secondary)", lineHeight: 1.6 }}>
            {LABELS.warningIntro(tenantName)}
          </p>

          <div style={{
            padding: "10px 14px",
            background: "#fef2f2",
            borderRadius: 8,
            border: "1px solid #fca5a5",
            fontSize: 12.5,
            color: "#991b1b",
            lineHeight: 1.6,
          }}>
            <strong>{LABELS.warningListTitle}</strong>
            <ul style={{ margin: "6px 0 0 0", paddingLeft: 18 }}>
              {LABELS.warningItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div>
            <label
              htmlFor="delete-tenant-phrase"
              style={{
                display: "block",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--color-dark)",
                marginBottom: 6,
              }}
            >
              {LABELS.phraseLabel}{" "}
              <code style={{
                background: "#f3f4f6",
                padding: "1px 5px",
                borderRadius: 4,
                fontSize: 12,
                color: "#dc2626",
                fontFamily: "monospace",
              }}>
                {CONFIRM_PHRASE}
              </code>
            </label>
            <input
              id="delete-tenant-phrase"
              type="text"
              className="form-input"
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
              placeholder={LABELS.phrasePlaceholder}
              disabled={isLoading}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", gap: 10, justifyContent: "flex-end",
          padding: "14px 20px",
          borderTop: "1px solid var(--color-border-soft)",
          background: "#f9fafb",
        }}>
          <button
            id="delete-tenant-cancel"
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
            disabled={!canConfirm || isLoading}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 18px", borderRadius: 9,
              border: `1.5px solid ${canConfirm && !isLoading ? "#dc2626" : "#fca5a5"}`,
              background: canConfirm ? (isLoading ? "#fca5a5" : "#dc2626") : "#fee2e2",
              cursor: (!canConfirm || isLoading) ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 600,
              color: canConfirm ? "#fff" : "#fca5a5",
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

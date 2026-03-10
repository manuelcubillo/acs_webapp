"use client";

/**
 * ConfirmActionModal
 *
 * Shown when an operator attempts to execute a manual action on a card
 * that has error-level validation failures AND allow_override_on_error is enabled.
 *
 * Forces explicit confirmation before proceeding. The execution is logged
 * as an operator override in action_log metadata.
 */

import { useEffect, useRef } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import type { ScanValidationCheck } from "@/lib/validation/scan-validator";

export interface ConfirmActionModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  actionName: string;
  /** Only error-level failed checks to display. */
  validationErrors: ScanValidationCheck[];
  isLoading?: boolean;
}

export default function ConfirmActionModal({
  isOpen,
  onConfirm,
  onCancel,
  actionName,
  validationErrors,
  isLoading = false,
}: ConfirmActionModalProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Focus trap: focus the Cancel button on open (safer default)
  useEffect(() => {
    if (!isOpen) return;
    const cancelBtn = document.getElementById("confirm-action-cancel");
    cancelBtn?.focus();
  }, [isOpen]);

  // Close on Escape key
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
      {/* Backdrop */}
      <div
        onClick={() => !isLoading && onCancel()}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 9998,
        }}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-action-title"
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 9999,
          width: "min(480px, calc(100vw - 32px))",
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
              id="confirm-action-title"
              style={{ fontSize: 15, fontWeight: 700, color: "#991b1b" }}
            >
              Errores de validación detectados
            </div>
            <div style={{ fontSize: 12.5, color: "#dc2626", marginTop: 2 }}>
              Este carnet tiene errores que requieren confirmación.
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
              aria-label="Cerrar"
            >
              <X size={18} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Validation error list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {validationErrors.map((check) => (
              <div
                key={check.scanValidationId}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "8px 12px",
                  background: "#fef2f2",
                  borderRadius: 8,
                  borderLeft: "3px solid #dc2626",
                }}
              >
                <AlertTriangle
                  size={13}
                  color="#dc2626"
                  strokeWidth={2}
                  style={{ flexShrink: 0, marginTop: 1 }}
                />
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#991b1b" }}>
                    {check.fieldLabel}:
                  </span>{" "}
                  <span style={{ fontSize: 12, color: "#b91c1c" }}>
                    {check.message}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Action context */}
          <div style={{
            padding: "10px 12px",
            background: "#f8f9fa",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            fontSize: 12.5,
            color: "var(--color-secondary)",
          }}>
            Vas a ejecutar: <strong style={{ color: "var(--color-dark)" }}>{actionName}</strong>
          </div>

          {/* Warning */}
          <div style={{
            fontSize: 12,
            color: "#92400e",
            background: "#fffbeb",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #fde68a",
          }}>
            ⚠️ Este carnet tiene errores de validación. Si continúas, la acción quedará registrada como{" "}
            <strong>intervención manual del operador</strong>.
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
            id="confirm-action-cancel"
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
            Cancelar
          </button>
          <button
            ref={confirmBtnRef}
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
              transition: "background 0.15s",
            }}
          >
            {isLoading && (
              <Loader2 size={14} strokeWidth={2} style={{ animation: "spin 0.8s linear infinite" }} />
            )}
            Confirmar y ejecutar
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

"use client";

/**
 * AutoActionConfirmModal
 *
 * Shown when the auto-action loop pauses mid-execution because a re-validation
 * after an action produced error-level failures, AND allow_override_on_error is enabled.
 *
 * Shows completed actions, the stopped action, remaining pending actions, and
 * validation errors. Operator can choose to continue (override) or stop here.
 */

import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, Circle, Loader2, ShieldAlert, X } from "lucide-react";
import type { ScanValidationCheck } from "@/lib/validation/scan-validator";
import type { AutoActionResult } from "@/lib/dal";

export interface AutoActionConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Auto-actions that already executed successfully. */
  completedActions: AutoActionResult[];
  /** Name of the action after which validation errors were detected. */
  stoppedAtAction: string;
  /** Error-level failed checks that caused the pause. */
  validationErrors: ScanValidationCheck[];
  /** Names of actions not yet executed. */
  remainingActions: string[];
  isLoading?: boolean;
}

export default function AutoActionConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  completedActions,
  stoppedAtAction,
  validationErrors,
  remainingActions,
  isLoading = false,
}: AutoActionConfirmModalProps) {
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
        aria-labelledby="auto-action-confirm-title"
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 9999,
          width: "min(520px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
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
          borderBottom: "1px solid #fde68a",
          background: "#fffbeb",
          flexShrink: 0,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "#fef3c7",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            border: "1.5px solid #fcd34d",
          }}>
            <ShieldAlert size={20} color="#d97706" strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div
              id="auto-action-confirm-title"
              style={{ fontSize: 15, fontWeight: 700, color: "#92400e" }}
            >
              Acciones automáticas pausadas
            </div>
            <div style={{ fontSize: 12.5, color: "#d97706", marginTop: 2 }}>
              Se detectaron errores de validación durante la ejecución.
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

        {/* Scrollable body */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>

          {/* Progress section */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.05em", color: "var(--color-muted)", marginBottom: 8,
            }}>
              Progreso de acciones
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {/* Completed */}
              {completedActions.filter((a) => a.success).map((a) => (
                <div key={a.actionDefinitionId} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 8,
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                }}>
                  <CheckCircle2 size={14} color="#16a34a" strokeWidth={2} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "#166534" }}>
                    {a.actionName}
                  </span>
                </div>
              ))}

              {/* Stopped action */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 10px", borderRadius: 8,
                background: "#fffbeb",
                border: "1px solid #fcd34d",
              }}>
                <AlertTriangle size={14} color="#d97706" strokeWidth={2} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#92400e" }}>
                  {stoppedAtAction}
                </span>
                <span style={{ fontSize: 11, color: "#d97706", marginLeft: "auto" }}>
                  ejecutado — errores detectados después
                </span>
              </div>

              {/* Remaining */}
              {remainingActions.map((name, idx) => (
                <div key={idx} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 8,
                  background: "#f8f9fa",
                  border: "1px solid var(--color-border)",
                  opacity: 0.65,
                }}>
                  <Circle size={14} color="#9ca3af" strokeWidth={2} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "#6b7280" }}>
                    {name}
                  </span>
                  <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto" }}>
                    pendiente
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Validation errors */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.05em", color: "var(--color-muted)", marginBottom: 8,
            }}>
              Errores de validación detectados
            </div>
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
          </div>

          {/* Warning text */}
          <div style={{
            fontSize: 12,
            color: "#92400e",
            background: "#fffbeb",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #fde68a",
          }}>
            ⚠️ Se detectaron errores después de ejecutar <strong>{stoppedAtAction}</strong>.
            Puedes continuar con las acciones restantes o detener aquí.
            Tu decisión quedará registrada.
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", gap: 10, justifyContent: "flex-end",
          padding: "14px 20px",
          borderTop: "1px solid var(--color-border-soft)",
          background: "#f9fafb",
          flexShrink: 0,
        }}>
          <button
            id="auto-action-stop-here"
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
            Detener aquí
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 18px", borderRadius: 9,
              border: "1.5px solid #d97706",
              background: isLoading ? "#fcd34d" : "#d97706",
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 600,
              color: "#fff",
              transition: "background 0.15s",
            }}
          >
            {isLoading && (
              <Loader2 size={14} strokeWidth={2} style={{ animation: "spin 0.8s linear infinite" }} />
            )}
            Continuar acciones automáticas
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

"use client";

/**
 * ActiveCardZone
 *
 * Displays the card most recently scanned in the operational dashboard.
 * Shows:
 *   - Card code + status + summary fields
 *   - Current validation alerts (from finalValidationResult, not just initial scan)
 *   - Auto-action feedback (if any is_auto_execute actions were triggered)
 *   - Manual action buttons — disabled when hasBlockingErrors is true
 *
 * Execution is delegated entirely to DashboardView via onManualAction.
 * This component is display + dispatch only.
 */

import { useEffect, useState } from "react";
import { ExternalLink, AlertCircle, CheckCircle2, Zap, Loader2 } from "lucide-react";
import Link from "next/link";
import AutoActionFeedback from "./AutoActionFeedback";
import ScanAlerts from "@/components/cards/ScanAlerts";
import type { AutoActionResult, ActionDefinitionWithField, CardWithFields } from "@/lib/dal";
import type { ScanValidationResult } from "@/lib/validation/scan-validator";

interface ActiveCardZoneProps {
  activeCard: CardWithFields | null;
  autoActions: AutoActionResult[];
  stoppedByValidation: boolean;
  stoppedAtAction: string | null;
  manualActions: ActionDefinitionWithField[];
  /** True when finalValidationResult has error-level failures. */
  hasBlockingErrors: boolean;
  /**
   * When true and hasBlockingErrors is true:
   *   Buttons shown in amber "warning" state — clicking triggers modal via onManualAction.
   * When false and hasBlockingErrors is true:
   *   Buttons DISABLED — no interaction.
   */
  allowOverrideOnError: boolean;
  /** Current validation state (updated after each manual action). */
  finalValidationResult: ScanValidationResult | null;
  /** Called when an action button is clicked — DashboardView handles validate + execute + refresh. */
  onManualAction: (actionId: string) => void;
  /** ID of the action currently being executed (set by DashboardView). */
  isExecutingActionId: string | null;
  /** Inline error message from the last failed execution attempt. */
  actionError: string | null;
}

export default function ActiveCardZone({
  activeCard,
  autoActions,
  stoppedByValidation,
  stoppedAtAction,
  manualActions,
  hasBlockingErrors,
  allowOverrideOnError,
  finalValidationResult,
  onManualAction,
  isExecutingActionId,
  actionError,
}: ActiveCardZoneProps) {
  const [autoFeedback, setAutoFeedback] = useState<AutoActionResult[] | null>(null);

  // Update auto-action feedback whenever autoActions changes (new scan)
  useEffect(() => {
    if (autoActions.length > 0) {
      setAutoFeedback(autoActions);
    } else {
      setAutoFeedback(null);
    }
  }, [autoActions]);

  const handleAutoFeedbackDismiss = () => setAutoFeedback(null);

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!activeCard) {
    return (
      <div style={{
        padding: "36px 24px",
        background: "var(--color-subtle-bg)",
        border: "1.5px dashed var(--color-border)",
        borderRadius: 14,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🪪</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-secondary)" }}>
          Esperando escaneo
        </div>
        <div style={{ fontSize: 12.5, color: "var(--color-muted)", marginTop: 4 }}>
          Escanea un carnet o introduce el código manualmente para continuar.
        </div>
      </div>
    );
  }

  // ── Derive visual state from finalValidationResult ─────────────────────────

  const failedChecks = finalValidationResult
    ? finalValidationResult.results.filter((r) => !r.passed)
    : [];
  const hasAlerts = failedChecks.length > 0;

  // Border color: red if blocking errors, amber for warnings, green if clean
  const borderColor = hasBlockingErrors ? "#fca5a5" : hasAlerts ? "#fcd34d" : "#bbf7d0";
  const iconBg      = hasBlockingErrors ? "#fef2f2" : hasAlerts ? "#fffbeb" : "#f0fdf4";
  const Icon        = hasBlockingErrors ? AlertCircle : hasAlerts ? AlertCircle : CheckCircle2;
  const iconColor   = hasBlockingErrors ? "#dc2626" : hasAlerts ? "#d97706" : "#16a34a";

  const anyActionRunning = !!isExecutingActionId;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Card info panel */}
      <div style={{
        padding: "16px",
        background: "#fff",
        border: `2px solid ${borderColor}`,
        borderRadius: 14,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: iconBg,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Icon size={22} color={iconColor} strokeWidth={1.8} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 20, fontWeight: 800,
                fontFamily: "var(--font-heading)", color: "var(--color-dark)",
              }}>
                {activeCard.code}
              </span>
              <span style={{
                fontSize: 12, color: "var(--color-muted)",
                background: "var(--color-subtle-bg)",
                padding: "2px 8px", borderRadius: 6,
                border: "1px solid var(--color-border-soft)",
              }}>
                {activeCard.status}
              </span>
            </div>
          </div>
          <Link
            href={`/cards/${encodeURIComponent(activeCard.code)}`}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              fontSize: 12, fontWeight: 600,
              color: "var(--color-primary)",
              textDecoration: "none", flexShrink: 0,
            }}
          >
            Ver detalle
            <ExternalLink size={12} strokeWidth={2} />
          </Link>
        </div>

        {/* Field summary */}
        {activeCard.fields.length > 0 && (
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 12,
            marginTop: 14, paddingTop: 12,
            borderTop: "1px solid var(--color-border-soft)",
          }}>
            {activeCard.fields.slice(0, 6).map((f) => {
              const val = f.value === null || f.value === undefined
                ? "—"
                : f.fieldType === "boolean"
                  ? (f.value ? "Sí" : "No")
                  : String(f.value);
              return (
                <div key={f.fieldDefinitionId}>
                  <div style={{ fontSize: 11, color: "var(--color-muted)" }}>{f.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}>{val}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Current validation alerts (from finalValidationResult — updated after each action) */}
      {finalValidationResult && !finalValidationResult.passed && (
        <ScanAlerts scanResult={finalValidationResult} />
      )}

      {/* Auto-action feedback */}
      {autoFeedback && autoFeedback.length > 0 && (
        <AutoActionFeedback
          results={autoFeedback}
          stoppedByValidation={stoppedByValidation}
          stoppedAtAction={stoppedAtAction}
          onDismiss={handleAutoFeedbackDismiss}
        />
      )}

      {/* Manual action buttons — three visual states:
          1. No errors: normal enabled buttons
          2. Errors + no override: disabled (gray), blocked message
          3. Errors + override allowed: warning styling (amber), click triggers modal
      */}
      {manualActions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {hasBlockingErrors && !allowOverrideOnError && (
            <div style={{
              padding: "8px 12px",
              background: "#fef2f2",
              border: "1px solid #fca5a5",
              borderRadius: 8,
              fontSize: 12,
              color: "#dc2626",
              fontWeight: 600,
            }}>
              Acciones bloqueadas: se detectaron errores de validación.
            </div>
          )}
          {hasBlockingErrors && allowOverrideOnError && (
            <div style={{
              padding: "8px 12px",
              background: "#fffbeb",
              border: "1px solid #fcd34d",
              borderRadius: 8,
              fontSize: 12,
              color: "#92400e",
              fontWeight: 600,
            }}>
              Errores de validación detectados. Las acciones requieren confirmación manual.
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {manualActions.map((action) => {
              const isRunning = isExecutingActionId === action.id;
              // State 2: errors + no override → disabled
              const isHardDisabled = hasBlockingErrors && !allowOverrideOnError;
              // State 3: errors + override → warning mode (still clickable, amber style)
              const isWarning = hasBlockingErrors && allowOverrideOnError;
              const isDisabled = isHardDisabled || anyActionRunning;

              return (
                <button
                  key={action.id}
                  onClick={() => !isHardDisabled && onManualAction(action.id)}
                  disabled={isDisabled}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "9px 16px", borderRadius: 10,
                    border: `1.5px solid ${
                      isHardDisabled && !isRunning ? "#e5e7eb"
                      : isWarning ? "#fcd34d"
                      : "var(--color-border)"
                    }`,
                    background: isRunning
                      ? "var(--color-subtle-bg)"
                      : isHardDisabled ? "#f9fafb"
                      : isWarning ? "#fffbeb"
                      : "#fff",
                    cursor: isHardDisabled ? "not-allowed" : anyActionRunning ? "wait" : "pointer",
                    fontSize: 13, fontWeight: 600,
                    color: isHardDisabled ? "#9ca3af" : isWarning ? "#92400e" : "var(--color-dark)",
                    opacity: anyActionRunning && !isRunning ? 0.5 : isHardDisabled && !isRunning ? 0.5 : 1,
                    transition: "all 0.15s",
                  }}
                >
                  {isRunning
                    ? <Loader2 size={14} strokeWidth={2} style={{ animation: "spin 0.8s linear infinite" }} />
                    : <Zap size={14} strokeWidth={2} />
                  }
                  {isRunning ? "Ejecutando…" : action.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Execution error */}
      {actionError && (
        <div style={{
          padding: "10px 14px", background: "#fef2f2",
          border: "1px solid #fca5a5", borderRadius: 8,
          fontSize: 12.5, color: "#dc2626",
        }}>
          {actionError}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

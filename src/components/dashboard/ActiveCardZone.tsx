"use client";

/**
 * ActiveCardZone
 *
 * Displays the card that was most recently scanned in the operational dashboard.
 * Shows:
 *   - Card code + card type name
 *   - Scan validation alerts (errors / warnings) from the latest scan
 *   - Auto-action feedback (if any is_auto_execute actions were triggered)
 *   - Manual action buttons (non-auto-execute actions the operator can click)
 *
 * This component orchestrates the operational scan flow:
 *   1. Parent calls onScan(code) → returns ScanWithAutoActionsResult
 *   2. Card + scan results + auto-action results are displayed here
 *   3. Manual action buttons call executeActionAction on demand
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, AlertCircle, AlertTriangle, CheckCircle2, Zap } from "lucide-react";
import Link from "next/link";
import AutoActionFeedback from "./AutoActionFeedback";
import { executeActionAction } from "@/lib/actions/actions";
import type { ScanWithAutoActionsResult, AutoActionResult, ActionDefinitionWithField } from "@/lib/dal";

interface ActiveCardZoneProps {
  result: ScanWithAutoActionsResult | null;
  manualActions: ActionDefinitionWithField[];
  /** Called after a manual action executes so the parent can refresh the feed. */
  onActionExecuted?: () => void;
}

export default function ActiveCardZone({ result, manualActions, onActionExecuted }: ActiveCardZoneProps) {
  const router = useRouter();
  const [autoFeedback, setAutoFeedback] = useState<AutoActionResult[] | null>(null);
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Show auto-action feedback whenever result changes
  useState(() => {
    if (result && result.autoActions.length > 0) {
      setAutoFeedback(result.autoActions);
    }
  });

  const handleAutoFeedbackDismiss = useCallback(() => {
    setAutoFeedback(null);
  }, []);

  const handleManualAction = useCallback(async (actionId: string) => {
    if (!result || executingActionId) return;
    setExecutingActionId(actionId);
    setActionError(null);
    try {
      const res = await executeActionAction({ cardId: result.card.id, actionDefinitionId: actionId });
      if (!res.success) {
        setActionError(res.error);
      } else {
        onActionExecuted?.();
        router.refresh();
      }
    } catch {
      setActionError("Error al ejecutar la acción");
    } finally {
      setExecutingActionId(null);
    }
  }, [result, executingActionId, onActionExecuted, router]);

  if (!result) {
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

  const { card, scanResult, autoActions } = result;
  // Failed checks are the "alerts" we surface to the operator
  const failedChecks = scanResult.results.filter((r) => !r.passed);
  const hasAlerts = failedChecks.length > 0;
  const hasErrors = failedChecks.some((r) => r.severity === "error");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Card info */}
      <div style={{
        padding: "16px",
        background: "#fff",
        border: `2px solid ${hasErrors ? "#fca5a5" : hasAlerts ? "#fcd34d" : "#bbf7d0"}`,
        borderRadius: 14,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: hasErrors ? "#fef2f2" : hasAlerts ? "#fffbeb" : "#f0fdf4",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            {hasErrors
              ? <AlertCircle size={22} color="#dc2626" strokeWidth={1.8} />
              : hasAlerts
                ? <AlertTriangle size={22} color="#d97706" strokeWidth={1.8} />
                : <CheckCircle2 size={22} color="#16a34a" strokeWidth={1.8} />
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}>
                {card.code}
              </span>
              <span style={{
                fontSize: 12, color: "var(--color-muted)",
                background: "var(--color-subtle-bg)",
                padding: "2px 8px", borderRadius: 6,
                border: "1px solid var(--color-border-soft)",
              }}>
                {card.cardTypeId}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--color-secondary)", marginTop: 4 }}>
              Estado: <strong>{card.status}</strong>
            </div>
          </div>
          <Link
            href={`/cards/${encodeURIComponent(card.code)}`}
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
        {card.fields.length > 0 && (
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 12,
            marginTop: 14, paddingTop: 12,
            borderTop: "1px solid var(--color-border-soft)",
          }}>
            {card.fields.slice(0, 6).map((f) => {
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

        {/* Scan alerts — only failed checks */}
        {hasAlerts && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
            {failedChecks.map((check, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: check.severity === "error" ? "#fef2f2" : "#fffbeb",
                  border: `1px solid ${check.severity === "error" ? "#fca5a5" : "#fcd34d"}`,
                }}
              >
                {check.severity === "error"
                  ? <AlertCircle size={14} color="#dc2626" strokeWidth={2} style={{ marginTop: 1, flexShrink: 0 }} />
                  : <AlertTriangle size={14} color="#d97706" strokeWidth={2} style={{ marginTop: 1, flexShrink: 0 }} />
                }
                <span style={{ fontSize: 12.5, color: check.severity === "error" ? "#dc2626" : "#b45309" }}>
                  {check.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auto-action feedback */}
      {autoActions.length > 0 && (
        <AutoActionFeedback
          results={autoActions}
          onDismiss={handleAutoFeedbackDismiss}
        />
      )}

      {/* Manual action buttons */}
      {manualActions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {manualActions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleManualAction(action.id)}
              disabled={!!executingActionId}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 16px", borderRadius: 10,
                border: "1.5px solid var(--color-border)",
                background: executingActionId === action.id ? "var(--color-subtle-bg)" : "#fff",
                cursor: executingActionId ? "not-allowed" : "pointer",
                fontSize: 13, fontWeight: 600,
                color: executingActionId === action.id ? "var(--color-muted)" : "var(--color-dark)",
                opacity: executingActionId && executingActionId !== action.id ? 0.6 : 1,
                transition: "all 0.15s",
              }}
            >
              <Zap size={14} strokeWidth={2} />
              {executingActionId === action.id ? "Ejecutando…" : action.name}
            </button>
          ))}
        </div>
      )}

      {/* Action error */}
      {actionError && (
        <div style={{
          padding: "10px 14px", background: "#fef2f2",
          border: "1px solid #fca5a5", borderRadius: 8,
          fontSize: 12.5, color: "#dc2626",
        }}>
          {actionError}
        </div>
      )}
    </div>
  );
}

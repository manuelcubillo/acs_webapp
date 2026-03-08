"use client";

/**
 * AutoActionFeedback
 *
 * Displays the results of auto-executed actions after an operational scan.
 * Shown briefly below the active card zone when auto-actions run.
 *
 * Each result shows:
 *   - Action name
 *   - Success (green checkmark) or failure (red X + error message)
 *
 * Auto-dismisses after `autoDismissMs` milliseconds if all actions succeeded.
 * Failures remain visible until manually dismissed.
 */

import { useEffect } from "react";
import { CheckCircle2, XCircle, Zap, X } from "lucide-react";
import type { AutoActionResult } from "@/lib/dal";

interface AutoActionFeedbackProps {
  results: AutoActionResult[];
  onDismiss: () => void;
  /** Auto-dismiss timeout in ms (only when all succeeded). Default: 4000. */
  autoDismissMs?: number;
}

export default function AutoActionFeedback({
  results,
  onDismiss,
  autoDismissMs = 4000,
}: AutoActionFeedbackProps) {
  const allSucceeded = results.every((r) => r.success);

  // Auto-dismiss when all actions succeed
  useEffect(() => {
    if (!allSucceeded) return;
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [allSucceeded, autoDismissMs, onDismiss]);

  if (results.length === 0) return null;

  return (
    <div style={{
      padding: "14px 16px",
      background: allSucceeded ? "#f0fdf4" : "#fef9ec",
      border: `1.5px solid ${allSucceeded ? "#bbf7d0" : "#fcd34d"}`,
      borderRadius: 12,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Zap size={14} strokeWidth={2} color={allSucceeded ? "#16a34a" : "#d97706"} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: allSucceeded ? "#15803d" : "#b45309" }}>
            Acciones automáticas {allSucceeded ? "ejecutadas" : "— algunos errores"}
          </span>
        </div>
        <button
          onClick={onDismiss}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 24, height: 24, borderRadius: 6,
            border: "none", background: "transparent", cursor: "pointer",
            color: "var(--color-muted)",
          }}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Result rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {results.map((r) => (
          <div key={r.actionDefinitionId} style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "8px 10px",
            background: "#fff",
            borderRadius: 8,
            border: `1px solid ${r.success ? "#bbf7d0" : "#fecaca"}`,
          }}>
            {r.success
              ? <CheckCircle2 size={15} strokeWidth={2} color="#16a34a" style={{ flexShrink: 0, marginTop: 1 }} />
              : <XCircle size={15} strokeWidth={2} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-dark)" }}>
                {r.actionName}
              </div>
              {!r.success && r.error && (
                <div style={{ fontSize: 11.5, color: "#dc2626", marginTop: 2 }}>
                  {r.error}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

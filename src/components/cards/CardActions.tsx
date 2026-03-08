"use client";

/**
 * CardActions
 *
 * Renders executable action buttons for a card.
 * Uses ActionDefinitionWithField so it knows the target field name and type.
 * Displays before→after value preview in the feedback after execution.
 */

import { useState } from "react";
import { TrendingUp, TrendingDown, CheckSquare, Square, Loader2 } from "lucide-react";
import type { ActionDefinitionWithField } from "@/lib/dal/types";
import type { ActionExecutionResult } from "@/lib/dal/types";
import { executeActionAction } from "@/lib/actions/actions";

// ─── Action display metadata ──────────────────────────────────────────────────

const ACTION_STYLE: Record<
  string,
  {
    icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
    color: string;
    bg: string;
    border: string;
    labelColor: string;
  }
> = {
  increment: { icon: TrendingUp,   color: "#fff",              bg: "#059669", border: "#059669", labelColor: "#fff" },
  decrement: { icon: TrendingDown, color: "#fff",              bg: "#dc2626", border: "#dc2626", labelColor: "#fff" },
  check:     { icon: CheckSquare,  color: "#fff",              bg: "#4f5bff", border: "#4f5bff", labelColor: "#fff" },
  uncheck:   { icon: Square,       color: "var(--color-dark)", bg: "#f3f4f6", border: "#d1d5db", labelColor: "var(--color-dark)" },
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (v instanceof Date) return v.toLocaleDateString("es-ES");
  if (typeof v === "boolean") return v ? "Sí" : "No";
  return String(v);
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface CardActionsProps {
  cardId: string;
  actions: ActionDefinitionWithField[];
  /** Called after a successful action execution — use to trigger refresh. */
  onActionExecuted?: () => void;
}

export default function CardActions({
  cardId,
  actions,
  onActionExecuted,
}: CardActionsProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    actionId: string;
    result: ActionExecutionResult;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeActions = actions.filter((a) => a.isActive);
  if (activeActions.length === 0) return null;

  async function execute(action: ActionDefinitionWithField) {
    setLoadingId(action.id);
    setFeedback(null);
    setErrorMsg(null);

    const res = await executeActionAction({
      cardId,
      actionDefinitionId: action.id,
    });

    setLoadingId(null);

    if (res.success) {
      setFeedback({ actionId: action.id, result: res.data });
      onActionExecuted?.();
    } else {
      setErrorMsg(res.error ?? "Error al ejecutar la acción.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--color-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          margin: 0,
        }}
      >
        Acciones
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {activeActions.map((action) => {
          const style = ACTION_STYLE[action.actionType] ?? ACTION_STYLE.increment;
          const Icon = style.icon;
          const isLoading = loadingId === action.id;

          // Preview text: what this action will do
          const actionConfig = action.config as { amount?: number } | null;
          const amountLabel =
            (action.actionType === "increment" || action.actionType === "decrement") &&
            actionConfig?.amount != null
              ? ` ${actionConfig.amount}`
              : "";

          const previewLabel = `${action.targetFieldLabel}${amountLabel}`;

          return (
            <button
              key={action.id}
              onClick={() => execute(action)}
              disabled={loadingId !== null}
              title={previewLabel}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "10px 14px",
                borderRadius: 10,
                background: style.bg,
                color: style.labelColor,
                border: `1.5px solid ${style.border}`,
                cursor: loadingId !== null ? "wait" : "pointer",
                fontSize: 13,
                fontWeight: 600,
                textAlign: "left",
                opacity: isLoading ? 0.7 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {isLoading ? (
                <span style={{ animation: "spin 0.8s linear infinite", flexShrink: 0, display: "flex" }}>
                  <Loader2 size={14} strokeWidth={2} />
                </span>
              ) : (
                <span style={{ flexShrink: 0, display: "flex" }}>
                  <Icon size={14} strokeWidth={2} />
                </span>
              )}
              <span style={{ flex: 1 }}>{action.name}</span>
            </button>
          );
        })}
      </div>

      {/* Feedback: before → after */}
      {feedback && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: "#dcfce7",
            color: "#166534",
            fontSize: 12.5,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            ✓ {activeActions.find((a) => a.id === feedback.actionId)?.name ?? "Acción"} ejecutada
          </div>
          <div style={{ color: "#15803d" }}>
            {feedback.result.targetFieldLabel}:{" "}
            <span style={{ textDecoration: "line-through", opacity: 0.7 }}>
              {formatValue(feedback.result.previousValue)}
            </span>
            {" → "}
            <strong>{formatValue(feedback.result.newValue)}</strong>
          </div>
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: "#fee2e2",
            color: "#991b1b",
            fontSize: 12.5,
          }}
        >
          {errorMsg}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

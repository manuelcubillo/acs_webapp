"use client";

import { useState } from "react";
import type { ActionDefinition } from "@/lib/dal/types";
import { executeActionAction } from "@/lib/actions/actions";

interface CardActionsProps {
  cardId: string;
  actions: ActionDefinition[];
  /** Called after a successful action execution. */
  onActionExecuted?: () => void;
}

export default function CardActions({
  cardId,
  actions,
  onActionExecuted,
}: CardActionsProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    message: string;
    success: boolean;
  } | null>(null);

  const activeActions = actions.filter((a) => a.isActive);
  if (activeActions.length === 0) return null;

  async function execute(action: ActionDefinition) {
    setLoadingId(action.id);
    setFeedback(null);

    const res = await executeActionAction({
      cardId,
      actionDefinitionId: action.id,
    });

    setLoadingId(null);

    if (res.success) {
      setFeedback({
        message: `"${action.name}" ejecutado correctamente.`,
        success: true,
      });
      onActionExecuted?.();
    } else {
      setFeedback({
        message: res.error ?? "Error al ejecutar la acción.",
        success: false,
      });
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
        {activeActions.map((action) => (
          <button
            key={action.id}
            onClick={() => execute(action)}
            disabled={loadingId !== null}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              background:
                action.actionType === "guest_exit" ? "#f3f4f6" : "var(--color-primary)",
              color:
                action.actionType === "guest_exit"
                  ? "var(--color-dark)"
                  : "#fff",
              border:
                action.actionType === "guest_exit"
                  ? "1.5px solid var(--color-border)"
                  : "none",
              cursor: loadingId !== null ? "wait" : "pointer",
              fontSize: 13,
              fontWeight: 600,
              textAlign: "left",
              opacity: loadingId === action.id ? 0.7 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {loadingId === action.id ? "Ejecutando..." : action.name}
          </button>
        ))}
      </div>

      {feedback && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: feedback.success ? "#dcfce7" : "#fee2e2",
            color: feedback.success ? "#166534" : "#991b1b",
            fontSize: 13,
          }}
        >
          {feedback.message}
        </div>
      )}
    </div>
  );
}

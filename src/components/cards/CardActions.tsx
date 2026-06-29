"use client";

/**
 * CardActions
 *
 * Renders executable action buttons for a card.
 * Uses ActionDefinitionWithField so it knows the target field name and type.
 * Displays before→after value preview in the feedback after execution.
 *
 * Action-type colors map to the four `action_type` enum values
 * (increment / decrement / check / uncheck). These are NOT access-control
 * outcomes — they're categorical labels for the kind of mutation. Using
 * Tailwind built-in palette (emerald / rose / brand / neutral) keeps the
 * --state-* tokens reserved for scan / validation outcomes.
 */

import { useState } from "react";
import { CheckCircle2, CheckSquare, Loader2, Square, TrendingDown, TrendingUp, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ActionDefinitionWithField, ActionExecutionResult } from "@/lib/dal/types";
import { executeActionAction } from "@/lib/actions/actions";

const TEXT = {
  SECTION:       "Acciones",
  BLOCKED:       "Acciones bloqueadas: se detectaron errores de validación.",
  WARNING:       "Errores de validación detectados. Las acciones requieren confirmación manual.",
  TITLE_BLOCKED: "Acciones bloqueadas por errores de validación",
  TITLE_WARNING: "Requiere confirmación — hay errores de validación",
  EXECUTED:      "ejecutada",
  FALLBACK_NAME: "Acción",
  FALLBACK_ERR:  "Error al ejecutar la acción.",
  YES:           "Sí",
  NO:            "No",
  DASH:          "—",
} as const;

const ACTION_STYLE: Record<
  string,
  {
    Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    classes: string;
  }
> = {
  increment: {
    Icon: TrendingUp,
    classes: "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700",
  },
  decrement: {
    Icon: TrendingDown,
    classes: "bg-rose-600 text-white border-rose-600 hover:bg-rose-700",
  },
  check: {
    Icon: CheckSquare,
    classes: "bg-primary text-primary-foreground border-primary hover:bg-primary/90",
  },
  uncheck: {
    Icon: Square,
    classes: "bg-muted text-foreground border-border hover:bg-muted/80",
  },
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return TEXT.DASH;
  if (v instanceof Date) return v.toLocaleDateString("es-ES");
  if (typeof v === "boolean") return v ? TEXT.YES : TEXT.NO;
  return String(v);
}

interface CardActionsProps {
  cardId: string;
  actions: ActionDefinitionWithField[];
  onActionExecuted?: () => void;
  /**
   * When true, all buttons are rendered but disabled — used when blocking
   * errors are detected AND override is not allowed.
   */
  disabled?: boolean;
  /**
   * When true, buttons render with warning styling and clicking calls
   * onActionClick (parent shows a confirmation modal).
   * Ignored when disabled=true.
   */
  warningMode?: boolean;
  onActionClick?: (actionId: string, actionName: string) => void;
  /** When true, is_auto_execute actions are hidden from the button list. */
  filterAutoExecute?: boolean;
}

export default function CardActions({
  cardId,
  actions,
  onActionExecuted,
  disabled = false,
  warningMode = false,
  onActionClick,
  filterAutoExecute = false,
}: CardActionsProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    actionId: string;
    result: ActionExecutionResult;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  let activeActions = actions.filter((a) => a.isActive);
  if (filterAutoExecute) {
    activeActions = activeActions.filter((a) => !a.isAutoExecute);
  }
  if (activeActions.length === 0) return null;

  function handleClick(action: ActionDefinitionWithField) {
    if (disabled) return;
    if (warningMode && onActionClick) {
      onActionClick(action.id, action.name);
      return;
    }
    execute(action);
  }

  async function execute(action: ActionDefinitionWithField) {
    if (disabled) return;
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
      setErrorMsg(res.error ?? TEXT.FALLBACK_ERR);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {TEXT.SECTION}
      </p>

      {disabled && (
        <div
          role="alert"
          className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2 text-xs font-semibold",
            "bg-state-denied border-state-denied-border text-state-denied-foreground",
          )}
        >
          <XCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-state-denied-icon" />
          {TEXT.BLOCKED}
        </div>
      )}

      {!disabled && warningMode && (
        <div
          role="alert"
          className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2 text-xs font-semibold",
            "bg-state-warning border-state-warning-border text-state-warning-foreground",
          )}
        >
          <Square aria-hidden className="mt-0.5 size-4 shrink-0 text-state-warning-icon" />
          {TEXT.WARNING}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {activeActions.map((action) => {
          const style = ACTION_STYLE[action.actionType] ?? ACTION_STYLE.increment;
          const { Icon } = style;
          const isLoading = loadingId === action.id;
          const isDisabled = disabled || loadingId !== null;
          const isWarning = !disabled && warningMode;

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
              type="button"
              onClick={() => handleClick(action)}
              disabled={isDisabled}
              title={
                disabled
                  ? TEXT.TITLE_BLOCKED
                  : isWarning
                    ? TEXT.TITLE_WARNING
                    : previewLabel
              }
              className={cn(
                "flex items-center gap-2.5 rounded-lg border-2 px-3.5 py-2.5 text-left text-sm font-semibold",
                "transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                disabled
                  ? "cursor-not-allowed border-border bg-muted text-muted-foreground opacity-50"
                  : isWarning
                    ? "bg-state-warning border-state-warning-border text-state-warning-foreground hover:bg-state-warning-border/40"
                    : style.classes,
                isLoading && "opacity-70",
                !isDisabled && !isWarning && "cursor-pointer",
              )}
            >
              {isLoading ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin" strokeWidth={2} />
              ) : (
                <Icon className="size-3.5 shrink-0" strokeWidth={2} />
              )}
              <span className="flex-1">{action.name}</span>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div
          role="status"
          className={cn(
            "rounded-md border px-3 py-2.5 text-xs",
            "bg-state-granted border-state-granted-border text-state-granted-foreground",
          )}
        >
          <div className="mb-0.5 flex items-center gap-1.5 font-semibold">
            <CheckCircle2 className="size-3.5 text-state-granted-icon" />
            {activeActions.find((a) => a.id === feedback.actionId)?.name ?? TEXT.FALLBACK_NAME}{" "}
            {TEXT.EXECUTED}
          </div>
          <div>
            {feedback.result.targetFieldLabel}:{" "}
            <span className="line-through opacity-70">
              {formatValue(feedback.result.previousValue)}
            </span>
            {" → "}
            <strong>{formatValue(feedback.result.newValue)}</strong>
          </div>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className={cn(
            "rounded-md border px-3 py-2.5 text-xs",
            "bg-state-denied border-state-denied-border text-state-denied-foreground",
          )}
        >
          {errorMsg}
        </div>
      )}
    </div>
  );
}

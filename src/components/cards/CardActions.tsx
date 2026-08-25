"use client";

/**
 * CardActions
 *
 * Renders executable action buttons for a card.
 * Uses ActionDefinitionWithField so it knows the target field name and type.
 * Displays before→after value preview in the feedback after execution.
 *
 * Action-type colors map to the `action_type` enum values. These are NOT
 * access-control outcomes — they're categorical labels for the kind of
 * mutation. Using Tailwind built-in palette (emerald / rose / brand / neutral)
 * keeps the --state-* tokens reserved for scan / validation outcomes.
 *
 * `toggle` actions render as a shadcn Switch rather than a Button: a toggle has
 * a state, and a button cannot show it. The switch reflects the CURRENT value
 * of the target boolean field and executes through the same
 * `executeActionAction` path as every other action — no second execution route.
 * There is deliberately no optimistic update: the server's returned value is
 * the one shown, because it is the one that was logged.
 */

import { useState } from "react";
import { CheckCircle2, CheckSquare, Loader2, Square, TrendingDown, TrendingUp, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import PresenceControl from "@/components/presence/PresenceControl";
import { Label } from "@/components/ui/label";
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
  /**
   * When true, only `is_operator_visible` actions are rendered.
   *
   * This replaced a `!isAutoExecute` filter. The two used to be the same thing;
   * they are now separate columns, because a presence toggle must BOTH run on
   * scan and be correctable by hand. Migration 0021 backfilled
   * `is_operator_visible = NOT is_auto_execute`, so existing data renders
   * exactly as before.
   */
  onlyOperatorVisible?: boolean;
  /**
   * Current on/off state per toggle action id, from `buildToggleStates`.
   * Only the parent holds both the card's values and the action list, so the
   * lookup happens there. A missing entry reads as `false`.
   */
  toggleStates?: Record<string, boolean>;
  /**
   * The card type's system presence action id, when it has one.
   *
   * That ONE action renders as `PresenceControl` ("Entrada" / "Salida").
   * Every other toggle — a tenant's own "Ha desayunado", "Material devuelto" —
   * keeps rendering as a plain `Switch` with its own name. The branch is on
   * presence identity, never on `action_type === "toggle"`: labelling an
   * arbitrary boolean "Entrada / Salida" would be nonsense.
   */
  presenceActionDefinitionId?: string | null;
  /**
   * Use override (orange) styling instead of warning (amber) for warningMode —
   * used when the confirmation is a lifecycle (off-state) override rather than a
   * scan-validation override.
   */
  overrideTone?: boolean;
  /** Suppress the internal banners when the parent shows its own lifecycle banner. */
  hideBanner?: boolean;
}

export default function CardActions({
  cardId,
  actions,
  onActionExecuted,
  disabled = false,
  warningMode = false,
  onActionClick,
  onlyOperatorVisible = false,
  toggleStates = {},
  presenceActionDefinitionId = null,
  overrideTone = false,
  hideBanner = false,
}: CardActionsProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    actionId: string;
    result: ActionExecutionResult;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  let activeActions = actions.filter((a) => a.isActive);
  if (onlyOperatorVisible) {
    activeActions = activeActions.filter((a) => a.isOperatorVisible);
  }
  if (activeActions.length === 0) return null;

  // The "confirm before executing" surface is amber for scan-validation
  // overrides and orange for lifecycle (off-state) overrides.
  const confirmBg = overrideTone ? "bg-state-override" : "bg-state-warning";
  const confirmBorder = overrideTone ? "border-state-override-border" : "border-state-warning-border";
  const confirmText = overrideTone ? "text-state-override-foreground" : "text-state-warning-foreground";
  const confirmIcon = overrideTone ? "text-state-override-icon" : "text-state-warning-icon";

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

      {!hideBanner && disabled && (
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

      {!hideBanner && !disabled && warningMode && (
        <div
          role="alert"
          className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2 text-xs font-semibold",
            confirmBg, confirmBorder, confirmText,
          )}
        >
          <Square aria-hidden className={cn("mt-0.5 size-4 shrink-0", confirmIcon)} />
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

          // The presence action gets the named two-segment control; every
          // other toggle keeps the generic switch.
          if (action.id === presenceActionDefinitionId) {
            return (
              <div
                key={action.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border-2 px-3.5 py-2.5",
                  disabled
                    ? "border-border bg-muted text-muted-foreground opacity-50"
                    : isWarning
                      ? cn(confirmBg, confirmBorder, confirmText)
                      : "border-border bg-card text-foreground",
                )}
              >
                <span className="text-sm font-semibold">{action.name}</span>
                <PresenceControl
                  isInside={toggleStates[action.id] ?? false}
                  onChange={() => handleClick(action)}
                  isPending={isLoading}
                  disabled={isDisabled}
                  ariaLabel={action.name}
                />
              </div>
            );
          }

          // A toggle has a state, so it renders as a switch rather than a
          // button. Same execution path, same disabled rules, same loading
          // semantics — only the control differs.
          if (action.actionType === "toggle") {
            const switchId = `card-action-${action.id}`;
            return (
              <div
                key={action.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border-2 px-3.5 py-2.5",
                  disabled
                    ? "border-border bg-muted text-muted-foreground opacity-50"
                    : isWarning
                      ? cn(confirmBg, confirmBorder, confirmText)
                      : "border-border bg-card text-foreground",
                )}
              >
                <Label
                  htmlFor={switchId}
                  className={cn(
                    "text-sm font-semibold",
                    !isDisabled && "cursor-pointer",
                  )}
                >
                  {action.name}
                </Label>
                {isLoading ? (
                  <Loader2 className="size-4 shrink-0 animate-spin" strokeWidth={2} />
                ) : (
                  <Switch
                    id={switchId}
                    checked={toggleStates[action.id] ?? false}
                    disabled={isDisabled}
                    onCheckedChange={() => handleClick(action)}
                    aria-label={action.name}
                  />
                )}
              </div>
            );
          }

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
                    ? cn(confirmBg, confirmBorder, confirmText, "hover:opacity-90")
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

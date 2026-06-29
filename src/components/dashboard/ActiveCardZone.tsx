"use client";

/**
 * ActiveCardZone — displays the card most recently scanned.
 *
 * State semantics (color + icon + label, never color alone):
 *   - All checks passed              → state-granted (green)   + CheckCircle2
 *   - Warning-level failures only    → state-warning (amber)   + AlertTriangle
 *   - Error-level (blocking)         → state-denied  (red)     + AlertCircle
 *
 * The override decision lives in the modals, not here; this surface only
 * communicates the current validation outcome.
 *
 * Behavior preserved EXACTLY:
 *   - All execution is delegated to onManualAction (parent handles validate +
 *     execute + refresh).
 *   - Three visual states for manual actions:
 *       1. no blocking errors           → enabled buttons
 *       2. blocking errors + no override → disabled buttons + denied banner
 *       3. blocking errors + override   → warning-styled buttons + warning banner
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, ShieldAlert, Zap } from "lucide-react";

import AutoActionFeedback from "./AutoActionFeedback";
import ScanAlerts from "@/components/cards/ScanAlerts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AutoActionResult, ActionDefinitionWithField, CardWithFields } from "@/lib/dal";
import type { ScanValidationResult } from "@/lib/validation/scan-validator";

// ─── Text constants ─────────────────────────────────────────────────────────

const TEXT = {
  EMPTY_TITLE:        "Esperando escaneo",
  EMPTY_BODY:         "Escanea un carnet o introduce el código manualmente para continuar.",
  STATUS_LABEL_GRANTED: "Acceso correcto",
  STATUS_LABEL_WARNING: "Advertencia",
  STATUS_LABEL_DENIED:  "Bloqueado",
  BANNER_BLOCKED:     "Acciones bloqueadas: se detectaron errores de validación.",
  BANNER_OVERRIDE:    "Errores de validación detectados. Las acciones requieren confirmación manual.",
  ACTION_RUNNING:     "Ejecutando…",
  YES:                "Sí",
  NO:                 "No",
  DASH:               "—",
} as const;

// ─── Props ──────────────────────────────────────────────────────────────────

interface ActiveCardZoneProps {
  activeCard: CardWithFields | null;
  autoActions: AutoActionResult[];
  stoppedByValidation: boolean;
  stoppedAtAction: string | null;
  manualActions: ActionDefinitionWithField[];
  hasBlockingErrors: boolean;
  allowOverrideOnError: boolean;
  finalValidationResult: ScanValidationResult | null;
  onManualAction: (actionId: string) => void;
  isExecutingActionId: string | null;
  actionError: string | null;
}

// ─── Component ──────────────────────────────────────────────────────────────

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

  useEffect(() => {
    setAutoFeedback(autoActions.length > 0 ? autoActions : null);
  }, [autoActions]);

  const handleAutoFeedbackDismiss = () => setAutoFeedback(null);

  if (!activeCard) {
    return <EmptyState />;
  }

  const failedChecks = finalValidationResult
    ? finalValidationResult.results.filter((r) => !r.passed)
    : [];
  const hasAlerts = failedChecks.length > 0;

  // Choose state token based on validation outcome.
  const state: "granted" | "warning" | "denied" =
    hasBlockingErrors ? "denied" : hasAlerts ? "warning" : "granted";

  const anyActionRunning = !!isExecutingActionId;

  return (
    <div className="flex flex-col gap-3">
      {/* Card summary panel — surfaces the scan outcome via state token */}
      <ResultPanel state={state} activeCard={activeCard} />

      {/* Live validation alerts */}
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

      {/* Manual action controls */}
      {manualActions.length > 0 && (
        <ManualActions
          actions={manualActions}
          hasBlockingErrors={hasBlockingErrors}
          allowOverrideOnError={allowOverrideOnError}
          anyActionRunning={anyActionRunning}
          isExecutingActionId={isExecutingActionId}
          onManualAction={onManualAction}
        />
      )}

      {/* Inline execution error */}
      {actionError && (
        <div
          role="alert"
          className={cn(
            "flex items-start gap-2 rounded-lg border-2 px-4 py-3 text-sm",
            "bg-state-denied border-state-denied-border text-state-denied-foreground",
          )}
        >
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-state-denied-icon" />
          <span>{actionError}</span>
        </div>
      )}
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 px-6 py-12 text-center">
      <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-card text-muted-foreground">
        <Zap aria-hidden className="size-6" strokeWidth={1.6} />
      </div>
      <div className="font-heading text-base font-semibold text-foreground">
        {TEXT.EMPTY_TITLE}
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">
        {TEXT.EMPTY_BODY}
      </p>
    </div>
  );
}

// ─── Result panel (granted / warning / denied) ──────────────────────────────

interface ResultPanelProps {
  state: "granted" | "warning" | "denied";
  activeCard: CardWithFields;
}

function ResultPanel({ state, activeCard }: ResultPanelProps) {
  const { Icon, label, classes, iconColorClass } = stateMeta(state);

  return (
    <Link
      href={`/cards/${encodeURIComponent(activeCard.code)}`}
      className={cn(
        "block rounded-2xl border-2 p-5 transition-shadow",
        "hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        classes,
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-xl border-2 bg-card",
            state === "granted" && "border-state-granted-border",
            state === "warning" && "border-state-warning-border",
            state === "denied"  && "border-state-denied-border",
          )}
        >
          <Icon aria-hidden className={cn("size-6", iconColorClass)} strokeWidth={1.8} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
              {activeCard.code}
            </span>
            <Badge variant="outline" className="bg-card text-muted-foreground">
              {activeCard.status}
            </Badge>
            <span
              className={cn(
                "ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider",
                state === "granted" && "bg-state-granted-border/50 text-state-granted-foreground",
                state === "warning" && "bg-state-warning-border/50 text-state-warning-foreground",
                state === "denied"  && "bg-state-denied-border/50  text-state-denied-foreground",
              )}
            >
              {label}
            </span>
          </div>
        </div>
      </div>

      {activeCard.fields.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border/60 pt-4 sm:grid-cols-3">
          {activeCard.fields.slice(0, 6).map((f) => (
            <div key={f.fieldDefinitionId} className="min-w-0">
              <dt className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                {f.label}
              </dt>
              <dd className="mt-0.5 truncate text-sm font-semibold text-foreground">
                {formatFieldValue(f.value, f.fieldType)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Link>
  );
}

function stateMeta(state: "granted" | "warning" | "denied") {
  switch (state) {
    case "granted":
      return {
        Icon: CheckCircle2,
        label: TEXT.STATUS_LABEL_GRANTED,
        classes: "bg-state-granted border-state-granted-border text-state-granted-foreground",
        iconColorClass: "text-state-granted-icon",
      };
    case "warning":
      return {
        Icon: AlertTriangle,
        label: TEXT.STATUS_LABEL_WARNING,
        classes: "bg-state-warning border-state-warning-border text-state-warning-foreground",
        iconColorClass: "text-state-warning-icon",
      };
    case "denied":
      return {
        Icon: AlertCircle,
        label: TEXT.STATUS_LABEL_DENIED,
        classes: "bg-state-denied border-state-denied-border text-state-denied-foreground",
        iconColorClass: "text-state-denied-icon",
      };
  }
}

function formatFieldValue(value: unknown, fieldType: string): string {
  if (value === null || value === undefined) return TEXT.DASH;
  if (fieldType === "boolean") return value ? TEXT.YES : TEXT.NO;
  return String(value);
}

// ─── Manual actions ─────────────────────────────────────────────────────────

interface ManualActionsProps {
  actions: ActionDefinitionWithField[];
  hasBlockingErrors: boolean;
  allowOverrideOnError: boolean;
  anyActionRunning: boolean;
  isExecutingActionId: string | null;
  onManualAction: (actionId: string) => void;
}

function ManualActions({
  actions,
  hasBlockingErrors,
  allowOverrideOnError,
  anyActionRunning,
  isExecutingActionId,
  onManualAction,
}: ManualActionsProps) {
  const isHardBlocked = hasBlockingErrors && !allowOverrideOnError;
  const isWarningMode = hasBlockingErrors && allowOverrideOnError;

  return (
    <div className="flex flex-col gap-2">
      {isHardBlocked && (
        <div
          role="alert"
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold",
            "bg-state-denied border-state-denied-border text-state-denied-foreground",
          )}
        >
          <AlertCircle aria-hidden className="size-4 shrink-0 text-state-denied-icon" />
          {TEXT.BANNER_BLOCKED}
        </div>
      )}
      {isWarningMode && (
        <div
          role="alert"
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold",
            "bg-state-warning border-state-warning-border text-state-warning-foreground",
          )}
        >
          <ShieldAlert aria-hidden className="size-4 shrink-0 text-state-warning-icon" />
          {TEXT.BANNER_OVERRIDE}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const isRunning = isExecutingActionId === action.id;
          const disabled = isHardBlocked || anyActionRunning;
          return (
            <Button
              key={action.id}
              type="button"
              variant={isWarningMode ? "outline" : "secondary"}
              size="sm"
              disabled={disabled}
              onClick={() => !isHardBlocked && onManualAction(action.id)}
              className={cn(
                "h-9 px-4 text-sm font-semibold",
                isWarningMode &&
                  "border-state-warning-border bg-state-warning text-state-warning-foreground hover:bg-state-warning-border/50",
              )}
            >
              {isRunning ? <Loader2 className="animate-spin" /> : <Zap />}
              <span>{isRunning ? TEXT.ACTION_RUNNING : action.name}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

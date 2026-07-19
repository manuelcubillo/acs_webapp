"use client";

/**
 * ActiveCardZone — displays the card most recently scanned.
 *
 * State semantics (color + icon + label, never color alone):
 *   - Lifecycle takes precedence over scan validation:
 *       archived         → state-denied  (red)    + AlertCircle, no actions
 *       inactive/expired → state-override(orange) + ShieldAlert, override/blocked
 *   - Otherwise, scan-validation outcome drives the surface:
 *       all checks passed              → state-granted (green)  + CheckCircle2
 *       warning-level failures only    → state-warning (amber)  + AlertTriangle
 *       error-level (blocking)         → state-denied  (red)    + AlertCircle
 *
 * The override decision lives in the modals, not here; this surface only
 * communicates the current outcome.
 *
 * Behavior preserved for active cards:
 *   - All execution is delegated to onManualAction (parent handles validate +
 *     execute + refresh).
 *   - Three visual states for manual actions:
 *       1. no blocking errors           → enabled buttons
 *       2. blocking errors + no override → disabled buttons + denied banner
 *       3. blocking errors + override   → warning-styled buttons + warning banner
 */

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, ShieldAlert, Zap } from "lucide-react";

import AutoActionFeedback from "./AutoActionFeedback";
import ScanAlerts from "@/components/cards/ScanAlerts";
import CardStatusBadge from "@/components/shared/CardStatusBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AutoActionResult, ActionDefinitionWithField, CardWithFields } from "@/lib/dal";
import type { LifecycleGateResult } from "@/lib/server/lifecycle/scan-gate";
import type { ScanValidationResult } from "@/lib/validation/scan-validator";

// ─── Text constants ─────────────────────────────────────────────────────────

const TEXT = {
  EMPTY_TITLE:        "Esperando escaneo",
  EMPTY_BODY:         "Escanea un carnet o introduce el código manualmente para continuar.",
  STATUS_LABEL_GRANTED: "Acceso correcto",
  STATUS_LABEL_WARNING: "Advertencia",
  STATUS_LABEL_DENIED:  "Bloqueado",
  STATUS_LABEL_OVERRIDE: "Requiere override",
  STATUS_LABEL_BLOCKED:  "Bloqueado",
  STATUS_LABEL_ARCHIVED: "Acceso denegado",
  LC_TITLE_OVERRIDE:  "Requiere override",
  LC_TITLE_BLOCKED:   "Bloqueado",
  LC_TITLE_ARCHIVED:  "Acceso denegado",
  BANNER_BLOCKED:     "Acciones bloqueadas: se detectaron errores de validación.",
  BANNER_OVERRIDE:    "Errores de validación detectados. Las acciones requieren confirmación manual.",
  ACTION_RUNNING:     "Ejecutando…",
  YES:                "Sí",
  NO:                 "No",
  DASH:               "—",
} as const;

type SurfaceState = "granted" | "warning" | "denied" | "override";

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
  /** Lifecycle gate verdict for the scanned card (phase 2). Null when idle. */
  lifecycleGate: LifecycleGateResult | null;
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
  lifecycleGate,
  onManualAction,
  isExecutingActionId,
  actionError,
}: ActiveCardZoneProps) {
  // Show auto-action feedback until dismissed; a new scan (a new `autoActions`
  // reference) resets the dismissal. Adjusting state during render avoids a
  // setState-in-effect cascade.
  const [prevAutoActions, setPrevAutoActions] = useState(autoActions);
  const [autoFeedbackDismissed, setAutoFeedbackDismissed] = useState(false);
  if (autoActions !== prevAutoActions) {
    setPrevAutoActions(autoActions);
    setAutoFeedbackDismissed(false);
  }
  const autoFeedback =
    !autoFeedbackDismissed && autoActions.length > 0 ? autoActions : null;

  const handleAutoFeedbackDismiss = () => setAutoFeedbackDismissed(true);

  if (!activeCard) {
    return <EmptyState />;
  }

  const lcOutcome = lifecycleGate?.outcome ?? "allowed";
  const isArchivedDenied = lcOutcome === "denied_archived";
  const isLifecycleOff = lcOutcome === "requires_override" || lcOutcome === "blocked";

  // The synthetic lifecycle check is surfaced by the lifecycle banner below, so
  // strip it from the scan-alert list to avoid showing the same reason twice.
  const alertResult = finalValidationResult
    ? {
        ...finalValidationResult,
        results: finalValidationResult.results.filter((r) => r.rule !== "lifecycle_status"),
      }
    : null;
  const failedChecks = alertResult ? alertResult.results.filter((r) => !r.passed) : [];
  const hasAlerts = failedChecks.length > 0;

  // Lifecycle precedence: archived → red, off → orange, else scan-validation.
  const state: SurfaceState = isArchivedDenied
    ? "denied"
    : isLifecycleOff
      ? "override"
      : hasBlockingErrors
        ? "denied"
        : hasAlerts
          ? "warning"
          : "granted";

  const panelLabel = isArchivedDenied
    ? TEXT.STATUS_LABEL_ARCHIVED
    : lcOutcome === "requires_override"
      ? TEXT.STATUS_LABEL_OVERRIDE
      : lcOutcome === "blocked"
        ? TEXT.STATUS_LABEL_BLOCKED
        : state === "granted"
          ? TEXT.STATUS_LABEL_GRANTED
          : state === "warning"
            ? TEXT.STATUS_LABEL_WARNING
            : TEXT.STATUS_LABEL_DENIED;

  const anyActionRunning = !!isExecutingActionId;

  return (
    <div className="flex flex-col gap-3">
      {/* Card summary panel — surfaces the outcome via state token */}
      <ResultPanel state={state} label={panelLabel} activeCard={activeCard} />

      {/* Lifecycle banner — the dominant reason when the card is off/archived */}
      {(isArchivedDenied || isLifecycleOff) && lifecycleGate && (
        <LifecycleBanner outcome={lcOutcome} reason={lifecycleGate.reason} />
      )}

      {/* Live validation alerts (real scan validations only) */}
      {!isArchivedDenied && alertResult && !alertResult.passed && (
        <ScanAlerts scanResult={alertResult} />
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

      {/* Manual action controls — never shown for an archived (denied) card */}
      {!isArchivedDenied && manualActions.length > 0 && (
        <ManualActions
          actions={manualActions}
          hasBlockingErrors={hasBlockingErrors}
          allowOverrideOnError={allowOverrideOnError}
          overrideTone={isLifecycleOff}
          hideBanner={isLifecycleOff}
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

// ─── Lifecycle banner ────────────────────────────────────────────────────────

interface LifecycleBannerProps {
  outcome: LifecycleGateResult["outcome"];
  reason: string | null;
}

function LifecycleBanner({ outcome, reason }: LifecycleBannerProps) {
  const isArchived = outcome === "denied_archived";
  const title = isArchived
    ? TEXT.LC_TITLE_ARCHIVED
    : outcome === "requires_override"
      ? TEXT.LC_TITLE_OVERRIDE
      : TEXT.LC_TITLE_BLOCKED;
  const Icon = isArchived ? AlertCircle : ShieldAlert;

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border-2 px-4 py-3 text-sm font-semibold",
        isArchived
          ? "bg-state-denied border-state-denied-border text-state-denied-foreground"
          : "bg-state-override border-state-override-border text-state-override-foreground",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          isArchived ? "text-state-denied-icon" : "text-state-override-icon",
        )}
      />
      <span>
        {title}
        {reason ? ` — ${reason}` : ""}
      </span>
    </div>
  );
}

// ─── Result panel (granted / warning / denied / override) ────────────────────

interface ResultPanelProps {
  state: SurfaceState;
  label: string;
  activeCard: CardWithFields;
}

function ResultPanel({ state, label, activeCard }: ResultPanelProps) {
  const { Icon, classes, iconColorClass, chipClass, borderClass } = stateMeta(state);

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
            borderClass,
          )}
        >
          <Icon aria-hidden className={cn("size-6", iconColorClass)} strokeWidth={1.8} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
              {activeCard.code}
            </span>
            <CardStatusBadge status={activeCard.status} />
            <span
              className={cn(
                "ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider",
                chipClass,
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
              <dd className="mt-0.5 text-sm font-semibold text-foreground">
                {f.fieldType === "photo" ? (
                  typeof f.value === "string" && f.value.length > 0 ? (
                    // Signed read URL; click navigates to the card detail, where
                    // the full lightbox lives.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.value}
                      alt={f.label}
                      className="block h-auto max-h-16 w-auto max-w-16 rounded-md border border-border"
                    />
                  ) : (
                    <span className="text-muted-foreground">{TEXT.DASH}</span>
                  )
                ) : (
                  <span className="block truncate">
                    {formatFieldValue(f.value, f.fieldType)}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Link>
  );
}

function stateMeta(state: SurfaceState) {
  switch (state) {
    case "granted":
      return {
        Icon: CheckCircle2,
        classes: "bg-state-granted border-state-granted-border text-state-granted-foreground",
        iconColorClass: "text-state-granted-icon",
        borderClass: "border-state-granted-border",
        chipClass: "bg-state-granted-border/50 text-state-granted-foreground",
      };
    case "warning":
      return {
        Icon: AlertTriangle,
        classes: "bg-state-warning border-state-warning-border text-state-warning-foreground",
        iconColorClass: "text-state-warning-icon",
        borderClass: "border-state-warning-border",
        chipClass: "bg-state-warning-border/50 text-state-warning-foreground",
      };
    case "override":
      return {
        Icon: ShieldAlert,
        classes: "bg-state-override border-state-override-border text-state-override-foreground",
        iconColorClass: "text-state-override-icon",
        borderClass: "border-state-override-border",
        chipClass: "bg-state-override-border/50 text-state-override-foreground",
      };
    case "denied":
      return {
        Icon: AlertCircle,
        classes: "bg-state-denied border-state-denied-border text-state-denied-foreground",
        iconColorClass: "text-state-denied-icon",
        borderClass: "border-state-denied-border",
        chipClass: "bg-state-denied-border/50 text-state-denied-foreground",
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
  /** Use override (orange) styling instead of warning (amber) for the confirm mode. */
  overrideTone: boolean;
  /** Suppress the internal banner when the parent already shows a lifecycle banner. */
  hideBanner: boolean;
  anyActionRunning: boolean;
  isExecutingActionId: string | null;
  onManualAction: (actionId: string) => void;
}

function ManualActions({
  actions,
  hasBlockingErrors,
  allowOverrideOnError,
  overrideTone,
  hideBanner,
  anyActionRunning,
  isExecutingActionId,
  onManualAction,
}: ManualActionsProps) {
  const isHardBlocked = hasBlockingErrors && !allowOverrideOnError;
  const isWarningMode = hasBlockingErrors && allowOverrideOnError;

  // The "confirm before executing" surface is amber for scan-validation
  // overrides and orange for lifecycle (off-state) overrides.
  const confirmBg = overrideTone ? "bg-state-override" : "bg-state-warning";
  const confirmBorder = overrideTone ? "border-state-override-border" : "border-state-warning-border";
  const confirmText = overrideTone ? "text-state-override-foreground" : "text-state-warning-foreground";
  const confirmIcon = overrideTone ? "text-state-override-icon" : "text-state-warning-icon";
  const confirmHover = overrideTone
    ? "hover:bg-state-override-border/50"
    : "hover:bg-state-warning-border/50";

  return (
    <div className="flex flex-col gap-2">
      {!hideBanner && isHardBlocked && (
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
      {!hideBanner && isWarningMode && (
        <div
          role="alert"
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold",
            confirmBg, confirmBorder, confirmText,
          )}
        >
          <ShieldAlert aria-hidden className={cn("size-4 shrink-0", confirmIcon)} />
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
                isWarningMode && cn(confirmBorder, confirmBg, confirmText, confirmHover),
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

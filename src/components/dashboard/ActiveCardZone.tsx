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
import { colOf, rowOf } from "@/lib/dashboard/active-zone-layout";
import { cn } from "@/lib/utils";
import type {
  AutoActionResult,
  ActionDefinitionWithField,
  ActiveZoneFieldConfig,
  CardWithFields,
} from "@/lib/dal";
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
  /**
   * The card type's configured 3×3 grid layout, ordered by position. Empty when
   * the card type has never been configured, which falls back to the legacy
   * "first fields that hold a value" behaviour.
   */
  summaryLayout: ActiveZoneFieldConfig[];
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
  summaryLayout,
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
      <ResultPanel
        state={state}
        label={panelLabel}
        activeCard={activeCard}
        summaryLayout={summaryLayout}
      />

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
  summaryLayout: ActiveZoneFieldConfig[];
}

function ResultPanel({ state, label, activeCard, summaryLayout }: ResultPanelProps) {
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

      <SummaryGrid activeCard={activeCard} layout={summaryLayout} />
    </Link>
  );
}

// ─── Summary grid ───────────────────────────────────────────────────────────

/**
 * Explicit grid placement classes.
 *
 * Tailwind compiles from literal class strings found in source, so these cannot
 * be built by interpolation (`sm:col-start-${n}` would never be generated).
 * Small enough to enumerate, and the lookup keeps the JSX readable.
 */
const COL_START_CLASS = [
  "sm:col-start-1",
  "sm:col-start-2",
  "sm:col-start-3",
] as const;

const ROW_START_CLASS = [
  "sm:row-start-1",
  "sm:row-start-2",
  "sm:row-start-3",
] as const;

/** How many fields the unconfigured panel shows — the pre-grid behaviour. */
const LEGACY_FIELD_COUNT = 6;

interface SummaryGridProps {
  activeCard: CardWithFields;
  layout: ActiveZoneFieldConfig[];
}

/**
 * The card's field values beneath the header.
 *
 * Two modes:
 *   - CONFIGURED — the card type has a layout: render exactly those cells at
 *     their grid positions, honouring a photo's two-row span.
 *   - UNCONFIGURED — no layout stored: fall back to the first fields that hold
 *     a value, which is what this panel did before the grid existed. Keeping the
 *     fallback means the feature ships without blanking every tenant's panel
 *     until a master visits the settings page.
 *
 * Responsive behaviour: the explicit placement applies from the `sm` breakpoint
 * up, matching the grid the master arranged. Below it the panel is a single
 * column — three columns of label + value are unreadable on a phone, and the
 * dashboard's own two-column work area collapses at the same point. Cells then
 * flow in position order (reading order), and a spanning photo reverts to a
 * normal cell since "two rows" carries no meaning in a single-column stack.
 */
function SummaryGrid({ activeCard, layout }: SummaryGridProps) {
  if (layout.length === 0) {
    // ── Unconfigured: legacy behaviour ──────────────────────────────────────
    if (activeCard.fields.length === 0) return null;
    return (
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border/60 pt-4 sm:grid-cols-3">
        {activeCard.fields.slice(0, LEGACY_FIELD_COUNT).map((f) => (
          <SummaryCell
            key={f.fieldDefinitionId}
            label={f.label}
            fieldType={f.fieldType}
            value={f.value}
            tall={false}
          />
        ))}
      </dl>
    );
  }

  // ── Configured: place each cell at its position ───────────────────────────
  // Values are resolved by field definition id, not by walking `card.fields`:
  // a field with no value has no `field_values` row and is therefore absent
  // from `card.fields` entirely. Looking it up here yields undefined and the
  // cell renders "—", which keeps the arrangement the master built intact
  // instead of silently collapsing.
  const valueByFieldId = new Map(
    activeCard.fields.map((f) => [f.fieldDefinitionId, f.value]),
  );

  return (
    <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-border/60 pt-4 sm:grid-cols-3">
      {layout.map((cell) => {
        const tall = cell.rowSpan === 2 && cell.fieldType === "photo";
        return (
          <SummaryCell
            key={cell.fieldDefinitionId}
            label={cell.label}
            fieldType={cell.fieldType}
            value={valueByFieldId.get(cell.fieldDefinitionId)}
            tall={tall}
            className={cn(
              COL_START_CLASS[colOf(cell.position)],
              ROW_START_CLASS[rowOf(cell.position)],
              tall && "sm:row-span-2",
            )}
          />
        );
      })}
    </dl>
  );
}

interface SummaryCellProps {
  label: string;
  fieldType: string;
  value: unknown;
  /** Two-row photo cell — renders a larger thumbnail. */
  tall: boolean;
  className?: string;
}

function SummaryCell({ label, fieldType, value, tall, className }: SummaryCellProps) {
  const hasPhoto = typeof value === "string" && value.length > 0;

  return (
    <div className={cn("min-w-0", className)}>
      <dt className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-foreground">
        {fieldType === "photo" ? (
          hasPhoto ? (
            // Signed read URL, re-minted by every scan; click falls through the
            // wrapping Link to the card detail, where the full lightbox lives.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value as string}
              alt={label}
              className={cn(
                "block h-auto w-auto rounded-md border border-border object-contain",
                tall
                  ? "max-h-[var(--photo-thumbnail-size-tall)] max-w-full"
                  : "max-h-[var(--photo-thumbnail-size)] max-w-[var(--photo-thumbnail-size)]",
              )}
            />
          ) : (
            <span className="text-muted-foreground">{TEXT.DASH}</span>
          )
        ) : (
          <span className="block truncate">{formatFieldValue(value, fieldType)}</span>
        )}
      </dd>
    </div>
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

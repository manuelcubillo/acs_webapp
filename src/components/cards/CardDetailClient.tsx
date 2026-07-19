"use client";

/**
 * CardDetailClient
 *
 * Client wrapper for the /cards/[code] detail page.
 * Manages card and validation state that updates after each manual action execution.
 *
 * Responsibilities:
 *   - Holds mutable card state (refreshed after actions)
 *   - Holds scan validation state (re-evaluated after each action)
 *   - Three action-button states:
 *       1. Normal (no blocking errors): direct execution via CardActions
 *       2. Hard block (errors, no override): buttons disabled
 *       3. Warning mode (errors, override allowed): warning-styled buttons →
 *          ConfirmActionModal
 *   - Does NOT log a scan entry — informational consultation only
 *   - Does NOT execute auto-actions — only manual button-triggered actions
 */

import { useState, useCallback } from "react";
import { AlertCircle, ShieldAlert } from "lucide-react";

import DynamicFieldRenderer from "./DynamicFieldRenderer";
import CardActions from "./CardActions";
import ScanAlerts from "./ScanAlerts";
import ConfirmActionModal from "@/components/shared/ConfirmActionModal";
import { cn } from "@/lib/utils";
import { getCardByCodeAction } from "@/lib/actions/cards";
import { executeActionAction } from "@/lib/actions/actions";
import { hasErrorLevelFailures, getErrorLevelChecks } from "@/lib/validation/scan-validator";
// Pure module (not the barrel) so the client bundle avoids the DB-backed service.
import { buildLifecycleScanCheck } from "@/lib/server/lifecycle/scan-gate";
import type { CardWithFields, ActionDefinitionWithField } from "@/lib/dal";
import type { LifecycleGateResult } from "@/lib/server/lifecycle/scan-gate";
import type { ScanValidationResult, ScanValidationCheck } from "@/lib/validation/scan-validator";

const TEXT = {
  EMPTY:            "Este carnet no tiene campos.",
  ERR_FALLBACK:     "Error al ejecutar la acción.",
  LC_TITLE_OVERRIDE: "Requiere override",
  LC_TITLE_BLOCKED:  "Bloqueado",
  LC_TITLE_ARCHIVED: "Acceso denegado",
} as const;

interface CardDetailClientProps {
  initialCard: CardWithFields;
  actions: ActionDefinitionWithField[];
  initialScanResult: ScanValidationResult;
  initialHasBlockingErrors: boolean;
  allowOverrideOnError: boolean;
  /** Lifecycle gate verdict for this card (phase 2). Gates the action buttons. */
  lifecycleGate: LifecycleGateResult;
}

export default function CardDetailClient({
  initialCard,
  actions,
  initialScanResult,
  initialHasBlockingErrors,
  allowOverrideOnError,
  lifecycleGate,
}: CardDetailClientProps) {
  const [card, setCard] = useState<CardWithFields>(initialCard);
  const [scanResult, setScanResult] = useState<ScanValidationResult>(initialScanResult);
  const [hasBlockingErrors, setHasBlockingErrors] = useState(initialHasBlockingErrors);

  const [actionError, setActionError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [pendingActionName, setPendingActionName] = useState<string>("");
  const [modalErrors, setModalErrors] = useState<ScanValidationCheck[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);

  const refreshCard = useCallback(async () => {
    const result = await getCardByCodeAction(card.code);
    if (result.success) {
      setCard(result.data.card);
      setScanResult(result.data.scanResult);
      setHasBlockingErrors(hasErrorLevelFailures(result.data.scanResult));
    }
  }, [card.code]);

  const handleActionExecuted = useCallback(async () => {
    setActionError(null);
    await refreshCard();
  }, [refreshCard]);

  const handleActionClick = useCallback(
    (actionId: string, actionName: string) => {
      const scanErrors = getErrorLevelChecks(scanResult);
      // For a switched-off card the override is a lifecycle override — surface
      // its reason in the modal (and thus in the audit trail) ahead of any
      // scan-validation errors.
      const errorChecks =
        lifecycleGate.outcome === "requires_override"
          ? [buildLifecycleScanCheck(lifecycleGate.status), ...scanErrors]
          : scanErrors;
      setPendingActionId(actionId);
      setPendingActionName(actionName);
      setModalErrors(errorChecks);
      setActionError(null);
      setShowModal(true);
    },
    [scanResult, lifecycleGate],
  );

  const handleModalConfirm = useCallback(async () => {
    if (!pendingActionId) return;
    setShowModal(false);
    setIsConfirming(true);
    setActionError(null);

    try {
      const res = await executeActionAction({
        cardId: card.id,
        actionDefinitionId: pendingActionId,
        operatorOverride: true,
        overrideValidationErrors: modalErrors.map((e) => e.message),
      });

      if (!res.success) {
        setActionError(res.error ?? TEXT.ERR_FALLBACK);
        return;
      }

      await refreshCard();
    } finally {
      setPendingActionId(null);
      setIsConfirming(false);
    }
  }, [pendingActionId, card.id, modalErrors, refreshCard]);

  const handleModalCancel = useCallback(() => {
    setShowModal(false);
    setPendingActionId(null);
    setModalErrors([]);
  }, []);

  // Lifecycle gate takes precedence over scan validation on the action buttons:
  //   archived → hard-disabled (denied), inactive/expired → override or blocked.
  const lcOutcome = lifecycleGate.outcome;
  const lcArchived = lcOutcome === "denied_archived";
  const lcBlocked = lcOutcome === "blocked";
  const lcOverride = lcOutcome === "requires_override";
  const lcOff = lcOverride || lcBlocked;

  const isHardDisabled = lcArchived || lcBlocked || (hasBlockingErrors && !allowOverrideOnError);
  const isWarningMode = !isHardDisabled && (lcOverride || (hasBlockingErrors && allowOverrideOnError));

  return (
    <>
      <ConfirmActionModal
        isOpen={showModal}
        onConfirm={handleModalConfirm}
        onCancel={handleModalCancel}
        actionName={pendingActionName}
        validationErrors={modalErrors}
        isLoading={isConfirming}
      />

      {!scanResult.passed && <ScanAlerts scanResult={scanResult} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto]">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-5">
            <span className="inline-block rounded-md bg-muted px-2.5 py-1 font-mono text-sm font-bold text-muted-foreground">
              {card.code}
            </span>
          </div>

          {card.fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">{TEXT.EMPTY}</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
              {card.fields.map((fv) => (
                <div key={fv.fieldDefinitionId} className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {fv.label}
                  </span>
                  <DynamicFieldRenderer
                    fieldType={fv.fieldType}
                    value={fv.value}
                    label={fv.label}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {actions.length > 0 && (
          <div className="self-start rounded-xl border border-border bg-card p-5 lg:min-w-[200px]">
            {(lcArchived || lcOff) && (
              <LifecycleActionBanner outcome={lcOutcome} reason={lifecycleGate.reason} />
            )}

            <CardActions
              cardId={card.id}
              actions={actions}
              onActionExecuted={handleActionExecuted}
              disabled={isHardDisabled}
              warningMode={isWarningMode}
              onActionClick={handleActionClick}
              filterAutoExecute
              overrideTone={lcOff}
              hideBanner={lcArchived || lcOff}
            />

            {actionError && (
              <div
                role="alert"
                className={cn(
                  "mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
                  "bg-state-denied border-state-denied-border text-state-denied-foreground",
                )}
              >
                <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-state-denied-icon" />
                {actionError}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Lifecycle action banner ──────────────────────────────────────────────────

interface LifecycleActionBannerProps {
  outcome: LifecycleGateResult["outcome"];
  reason: string | null;
}

/**
 * Explains why the action buttons are gated by the card's lifecycle status.
 * Archived → red (denied); inactive/expired → orange (override / blocked). These
 * ARE action-outcome surfaces, so the reserved `--state-*` tokens apply here
 * (unlike the neutral status badge in the page header).
 */
function LifecycleActionBanner({ outcome, reason }: LifecycleActionBannerProps) {
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
        "mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs font-semibold",
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

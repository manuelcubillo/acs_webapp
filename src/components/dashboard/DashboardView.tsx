"use client";

/**
 * DashboardView
 *
 * Main client-side orchestrator for the operational dashboard.
 *
 * ALL state, handlers and effects are byte-identical to the previous version —
 * the scan pipeline (executeScanWithAutoActionsAction / resumeAutoActionsAction),
 * useExternalScanner integration and the history DAL are untouched. Only the
 * JSX presentation is rebuilt on token-driven shadcn primitives.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────┐
 *   │   DashboardSearchBar                              │
 *   ├──────────────────────────────────────────────────┤
 *   │   DashboardKpis (Scans / Actions / Types / Last)  │
 *   ├──────────────────────┬───────────────────────────┤
 *   │   ActiveCardZone     │   ActivityFeed            │
 *   └──────────────────────┴───────────────────────────┘
 */

import { useState, useCallback } from "react";

import DashboardSearchBar from "./DashboardSearchBar";
import ActiveCardZone from "./ActiveCardZone";
import ActivityFeed from "./ActivityFeed";
import DashboardKpis, { type DashboardKpiData } from "./DashboardKpis";
import ConfirmActionModal from "@/components/shared/ConfirmActionModal";
import AutoActionConfirmModal from "@/components/shared/AutoActionConfirmModal";
import { cn } from "@/lib/utils";
import {
  executeScanWithAutoActionsAction,
  validateBeforeActionAction,
  getCardByCodeAction,
  resumeAutoActionsAction,
} from "@/lib/actions/cards";
import { getActionsForCardTypeAction, executeActionAction } from "@/lib/actions/actions";
import {
  hasErrorLevelFailures,
  getErrorLevelChecks,
} from "@/lib/validation/scan-validator";
import type {
  ScanWithAutoActionsResult,
  ActivityFeedEntry,
  DashboardSettings,
  ActionDefinitionWithField,
  CardWithFields,
  AutoActionResult,
} from "@/lib/dal";
import type { ScanValidationResult, ScanValidationCheck } from "@/lib/validation/scan-validator";

const TEXT = {
  COLUMN_ACTIVE: "Último carnet escaneado",
  ERR_VALIDATE:  "Error al validar el estado del carnet.",
  ERR_STATE:     "El estado del carnet ha cambiado — se detectaron errores de validación.",
  ERR_RESUME:    "Error al reanudar las acciones automáticas.",
  ERR_EXEC:      "Error al ejecutar la acción.",
  ERR_ACTION:    "Acción",
} as const;

interface DashboardViewProps {
  initialFeedEntries: ActivityFeedEntry[];
  settings: DashboardSettings | null;
  allowOverrideOnError: boolean;
  kpiData: DashboardKpiData;
}

export default function DashboardView({
  initialFeedEntries,
  settings,
  allowOverrideOnError,
  kpiData,
}: DashboardViewProps) {
  // ── State (UNCHANGED from previous implementation) ────────────────────────
  const [scanResult, setScanResult] = useState<ScanWithAutoActionsResult | null>(null);
  const [activeCard, setActiveCard] = useState<CardWithFields | null>(null);
  const [hasBlockingErrors, setHasBlockingErrors] = useState(false);
  const [finalValidationResult, setFinalValidationResult] = useState<ScanValidationResult | null>(null);

  const [manualActions, setManualActions] = useState<ActionDefinitionWithField[]>([]);

  const [isExecutingActionId, setIsExecutingActionId] = useState<string | null>(null);
  const [manualActionError, setManualActionError] = useState<string | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [feedKey, setFeedKey] = useState(0);

  // Auto-action modal state
  const [showAutoActionModal, setShowAutoActionModal] = useState(false);
  const [pendingAutoActionIds, setPendingAutoActionIds] = useState<string[]>([]);
  const [pendingAutoActionNames, setPendingAutoActionNames] = useState<string[]>([]);
  const [pauseValidationErrors, setPauseValidationErrors] = useState<ScanValidationCheck[]>([]);
  const [completedAutoActions, setCompletedAutoActions] = useState<AutoActionResult[]>([]);
  const [pausedAtAction, setPausedAtAction] = useState<string>("");
  const [isResumingAutoActions, setIsResumingAutoActions] = useState(false);

  // Manual action modal state
  const [showManualActionModal, setShowManualActionModal] = useState(false);
  const [pendingManualActionId, setPendingManualActionId] = useState<string | null>(null);
  const [manualActionModalErrors, setManualActionModalErrors] = useState<ScanValidationCheck[]>([]);
  const [pendingManualActionName, setPendingManualActionName] = useState<string>("");
  const [isConfirmingManualAction, setIsConfirmingManualAction] = useState(false);

  // ── Handlers (UNCHANGED) ──────────────────────────────────────────────────

  const handleScanResult = useCallback(async (data: ScanWithAutoActionsResult) => {
    setScanResult(data);
    setActiveCard(data.card);
    setHasBlockingErrors(data.hasBlockingErrors);
    setFinalValidationResult(data.finalValidationResult);

    if (data.pausedForConfirmation && data.pendingAutoActionIds) {
      setCompletedAutoActions(data.autoActions);
      setPendingAutoActionIds(data.pendingAutoActionIds);
      setPendingAutoActionNames(data.pendingAutoActionNames ?? []);
      setPauseValidationErrors(data.pauseValidationErrors ?? []);
      setPausedAtAction(data.stoppedAtAction ?? "");
      setShowAutoActionModal(true);
    }

    setFeedKey((k) => k + 1);
  }, []);

  const handleScan = useCallback(async (code: string) => {
    setIsScanning(true);
    setScanError(null);
    setManualActionError(null);
    try {
      const result = await executeScanWithAutoActionsAction(code);
      if (!result.success) {
        setScanError(result.error);
        setScanResult(null);
        setActiveCard(null);
        return;
      }

      await handleScanResult(result.data);

      const actionsResult = await getActionsForCardTypeAction(result.data.card.cardTypeId);
      if (actionsResult.success) {
        setManualActions(actionsResult.data.filter((a) => !a.isAutoExecute));
      }
    } finally {
      setIsScanning(false);
    }
  }, [handleScanResult]);

  const handleAutoActionResume = useCallback(async () => {
    if (!activeCard) return;
    setShowAutoActionModal(false);
    setIsResumingAutoActions(true);

    try {
      const resumeResult = await resumeAutoActionsAction({
        cardCode: activeCard.code,
        pendingActionIds: pendingAutoActionIds,
        overrideValidationErrors: pauseValidationErrors.map((e) => e.message),
      });

      
      
      if (resumeResult.success) {
        // avoid checking again the card
        setActiveCard(resumeResult.data.card);
        //await handleScanResult(resumeResult.data);
      } else {
        setManualActionError(resumeResult.error ?? TEXT.ERR_RESUME);
      }


    } finally {
      setIsResumingAutoActions(false);
    }
  }, [activeCard, pendingAutoActionIds, pauseValidationErrors, handleScanResult]);

  const handleAutoActionStop = useCallback(() => {
    setShowAutoActionModal(false);
  }, []);

  const executeAndRefresh = useCallback(async (
    actionId: string,
    withOverride = false,
    overrideErrors?: ScanValidationCheck[],
  ) => {
    if (!activeCard) return;

    const execResult = await executeActionAction({
      cardId: activeCard.id,
      actionDefinitionId: actionId,
      ...(withOverride && {
        operatorOverride: true,
        overrideValidationErrors: overrideErrors?.map((e) => e.message),
      }),
    });

    if (!execResult.success) {
      setManualActionError(execResult.error ?? TEXT.ERR_EXEC);
      return;
    }

    const cardResult = await getCardByCodeAction(activeCard.code);
    if (cardResult.success) {
      setActiveCard(cardResult.data.card);
      const newScanResult = cardResult.data.scanResult;
      setFinalValidationResult(newScanResult);
      setHasBlockingErrors(hasErrorLevelFailures(newScanResult));
    }

    setFeedKey((k) => k + 1);
  }, [activeCard]);

  const handleManualAction = useCallback(async (actionId: string) => {
    if (!activeCard || isExecutingActionId) return;
    setIsExecutingActionId(actionId);
    setManualActionError(null);

    try {
      const preCheck = await validateBeforeActionAction(activeCard.id);
      if (!preCheck.success) {
        setManualActionError(preCheck.error ?? TEXT.ERR_VALIDATE);
        return;
      }

      if (preCheck.data.hasBlockingErrors) {
        const errorChecks = getErrorLevelChecks(preCheck.data.scanResult);
        setFinalValidationResult(preCheck.data.scanResult);
        setHasBlockingErrors(true);

        if (allowOverrideOnError) {
          const action = manualActions.find((a) => a.id === actionId);
          setPendingManualActionId(actionId);
          setPendingManualActionName(action?.name ?? TEXT.ERR_ACTION);
          setManualActionModalErrors(errorChecks);
          setShowManualActionModal(true);
        } else {
          setManualActionError(TEXT.ERR_STATE);
        }
        return;
      }

      await executeAndRefresh(actionId);
    } finally {
      setIsExecutingActionId(null);
    }
  }, [activeCard, isExecutingActionId, allowOverrideOnError, manualActions, executeAndRefresh]);

  const handleManualActionConfirm = useCallback(async () => {
    if (!pendingManualActionId) return;
    setShowManualActionModal(false);
    setIsConfirmingManualAction(true);
    setIsExecutingActionId(pendingManualActionId);

    try {
      await executeAndRefresh(pendingManualActionId, true, manualActionModalErrors);
    } finally {
      setPendingManualActionId(null);
      setIsConfirmingManualAction(false);
      setIsExecutingActionId(null);
    }
  }, [pendingManualActionId, manualActionModalErrors, executeAndRefresh]);

  const handleManualActionCancel = useCallback(() => {
    setShowManualActionModal(false);
    setPendingManualActionId(null);
    setManualActionModalErrors([]);
  }, []);

  // ── Render (REBUILT on tokens + shadcn primitives) ────────────────────────

  return (
    <>
      <AutoActionConfirmModal
        isOpen={showAutoActionModal}
        onConfirm={handleAutoActionResume}
        onCancel={handleAutoActionStop}
        completedActions={completedAutoActions}
        stoppedAtAction={pausedAtAction}
        validationErrors={pauseValidationErrors}
        remainingActions={pendingAutoActionNames}
        isLoading={isResumingAutoActions}
      />

      <ConfirmActionModal
        isOpen={showManualActionModal}
        onConfirm={handleManualActionConfirm}
        onCancel={handleManualActionCancel}
        actionName={pendingManualActionName}
        validationErrors={manualActionModalErrors}
        isLoading={isConfirmingManualAction}
      />

      <div className="flex flex-col gap-6">
        {/* 1. Primary operational action — the focal point */}
        <DashboardSearchBar onScan={handleScan} isScanning={isScanning} />

        {/* Scan error toast (from execute action layer) */}
        {scanError && (
          <div
            role="alert"
            className={cn(
              "rounded-lg border-2 px-4 py-3 text-sm font-medium",
              "bg-state-denied border-state-denied-border text-state-denied-foreground",
            )}
          >
            {scanError}
          </div>
        )}

        {/* 2. KPI row */}
        <DashboardKpis data={kpiData} />

        {/* 3. Two-column work area */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <section aria-label={TEXT.COLUMN_ACTIVE} className="flex flex-col gap-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {TEXT.COLUMN_ACTIVE}
            </h2>
            <ActiveCardZone
              activeCard={activeCard}
              autoActions={scanResult?.autoActions ?? []}
              stoppedByValidation={scanResult?.stoppedByValidation ?? false}
              stoppedAtAction={scanResult?.stoppedAtAction ?? null}
              manualActions={manualActions}
              hasBlockingErrors={hasBlockingErrors}
              allowOverrideOnError={allowOverrideOnError}
              finalValidationResult={finalValidationResult}
              onManualAction={handleManualAction}
              isExecutingActionId={isExecutingActionId}
              actionError={manualActionError}
            />
          </section>

          <ActivityFeed
            key={feedKey}
            initialEntries={initialFeedEntries}
            settings={settings}
            refreshIntervalMs={15000}
          />
        </div>
      </div>
    </>
  );
}

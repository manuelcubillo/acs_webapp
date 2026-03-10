"use client";

/**
 * DashboardView
 *
 * Main client-side orchestrator for the operational dashboard.
 *
 * Responsibilities:
 *   - Renders the search bar (code input + scan button)
 *   - On scan: calls executeScanWithAutoActionsAction → displays result in ActiveCardZone
 *     - If paused (pausedForConfirmation): shows AutoActionConfirmModal
 *     - On confirm: calls resumeAutoActionsAction (may pause again)
 *   - Manages blocking state (hasBlockingErrors) from scan validations
 *   - On manual action click:
 *     - Validates current state first
 *     - If no errors: execute directly
 *     - If errors + override allowed: show ConfirmActionModal
 *     - If errors + override not allowed: disable buttons (no modal)
 *   - Renders the activity feed (with initial SSR data + auto-refresh)
 *
 * Layout:
 *   ┌────────────────────────────────────────┐
 *   │  [SearchBar]          [📷 Cámara]      │
 *   ├──────────────────┬─────────────────────┤
 *   │  ActiveCardZone  │  ActivityFeed       │
 *   └──────────────────┴─────────────────────┘
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import { Camera } from "lucide-react";
import DashboardSearchBar from "./DashboardSearchBar";
import ActiveCardZone from "./ActiveCardZone";
import ActivityFeed from "./ActivityFeed";
import ConfirmActionModal from "@/components/shared/ConfirmActionModal";
import AutoActionConfirmModal from "@/components/shared/AutoActionConfirmModal";
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

interface DashboardViewProps {
  initialFeedEntries: ActivityFeedEntry[];
  settings: DashboardSettings | null;
  /** Whether allow_override_on_error is enabled for this tenant. */
  allowOverrideOnError: boolean;
}

export default function DashboardView({
  initialFeedEntries,
  settings,
  allowOverrideOnError,
}: DashboardViewProps) {
  // Raw scan result (from executeScanWithAutoActionsAction)
  const [scanResult, setScanResult] = useState<ScanWithAutoActionsResult | null>(null);

  // Active card and current validation state (updated after each manual action)
  const [activeCard, setActiveCard] = useState<CardWithFields | null>(null);
  const [hasBlockingErrors, setHasBlockingErrors] = useState(false);
  const [finalValidationResult, setFinalValidationResult] = useState<ScanValidationResult | null>(null);

  // Manual actions available for the current card type
  const [manualActions, setManualActions] = useState<ActionDefinitionWithField[]>([]);

  // Manual action execution state
  const [isExecutingActionId, setIsExecutingActionId] = useState<string | null>(null);
  const [manualActionError, setManualActionError] = useState<string | null>(null);

  // Overall scan state
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Feed refresh key
  const [feedKey, setFeedKey] = useState(0);

  // ── Auto-action confirm modal state ──────────────────────────────────────────
  const [showAutoActionModal, setShowAutoActionModal] = useState(false);
  const [pendingAutoActionIds, setPendingAutoActionIds] = useState<string[]>([]);
  const [pendingAutoActionNames, setPendingAutoActionNames] = useState<string[]>([]);
  const [pauseValidationErrors, setPauseValidationErrors] = useState<ScanValidationCheck[]>([]);
  const [completedAutoActions, setCompletedAutoActions] = useState<AutoActionResult[]>([]);
  const [pausedAtAction, setPausedAtAction] = useState<string>("");
  const [isResumingAutoActions, setIsResumingAutoActions] = useState(false);

  // ── Manual action confirm modal state ────────────────────────────────────────
  const [showManualActionModal, setShowManualActionModal] = useState(false);
  const [pendingManualActionId, setPendingManualActionId] = useState<string | null>(null);
  const [manualActionModalErrors, setManualActionModalErrors] = useState<ScanValidationCheck[]>([]);
  const [pendingManualActionName, setPendingManualActionName] = useState<string>("");
  const [isConfirmingManualAction, setIsConfirmingManualAction] = useState(false);

  // ── Shared handler for scan results (handles pause or normal completion) ─────

  const handleScanResult = useCallback(async (data: ScanWithAutoActionsResult) => {
    setScanResult(data);
    setActiveCard(data.card);
    setHasBlockingErrors(data.hasBlockingErrors);
    setFinalValidationResult(data.finalValidationResult);

    if (data.pausedForConfirmation && data.pendingAutoActionIds) {
      // Show auto-action confirmation modal
      setCompletedAutoActions(data.autoActions);
      setPendingAutoActionIds(data.pendingAutoActionIds);
      setPendingAutoActionNames(data.pendingAutoActionNames ?? []);
      setPauseValidationErrors(data.pauseValidationErrors ?? []);
      setPausedAtAction(data.stoppedAtAction ?? "");
      setShowAutoActionModal(true);
    }

    // Refresh activity feed
    setFeedKey((k) => k + 1);
  }, []);

  // ── Operational scan ────────────────────────────────────────────────────────

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

      // Load manual (non-auto-execute) actions for this card type
      const actionsResult = await getActionsForCardTypeAction(result.data.card.cardTypeId);
      if (actionsResult.success) {
        setManualActions(actionsResult.data.filter((a) => !a.isAutoExecute));
      }
    } finally {
      setIsScanning(false);
    }
  }, [handleScanResult]);

  // ── Auto-action resume ───────────────────────────────────────────────────────

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
        // May pause again — handleScanResult handles both cases
        await handleScanResult(resumeResult.data);
      } else {
        setManualActionError(resumeResult.error ?? "Error al reanudar las acciones automáticas.");
      }
    } finally {
      setIsResumingAutoActions(false);
    }
  }, [activeCard, pendingAutoActionIds, pauseValidationErrors, handleScanResult]);

  const handleAutoActionStop = useCallback(() => {
    setShowAutoActionModal(false);
    // Card stays in current state. hasBlockingErrors already set from scan result.
  }, []);

  // ── Core execute + refresh helper ────────────────────────────────────────────

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
      setManualActionError(execResult.error ?? "Error al ejecutar la acción.");
      return;
    }

    // Re-fetch card (also re-evaluates validations)
    const cardResult = await getCardByCodeAction(activeCard.code);
    if (cardResult.success) {
      setActiveCard(cardResult.data.card);
      const newScanResult = cardResult.data.scanResult;
      setFinalValidationResult(newScanResult);
      setHasBlockingErrors(hasErrorLevelFailures(newScanResult));
    }

    // Refresh activity feed
    setFeedKey((k) => k + 1);
  }, [activeCard]);

  // ── Manual action execution (validate → execute or show modal) ──────────────

  const handleManualAction = useCallback(async (actionId: string) => {
    if (!activeCard || isExecutingActionId) return;
    setIsExecutingActionId(actionId);
    setManualActionError(null);

    try {
      // 1. Validate current card state before executing
      const preCheck = await validateBeforeActionAction(activeCard.id);
      if (!preCheck.success) {
        setManualActionError(preCheck.error ?? "Error al validar el estado del carnet.");
        return;
      }

      if (preCheck.data.hasBlockingErrors) {
        const errorChecks = getErrorLevelChecks(preCheck.data.scanResult);
        setFinalValidationResult(preCheck.data.scanResult);
        setHasBlockingErrors(true);

        if (allowOverrideOnError) {
          // Show confirmation modal
          const action = manualActions.find((a) => a.id === actionId);
          setPendingManualActionId(actionId);
          setPendingManualActionName(action?.name ?? "Acción");
          setManualActionModalErrors(errorChecks);
          setShowManualActionModal(true);
        } else {
          setManualActionError("El estado del carnet ha cambiado — se detectaron errores de validación.");
        }
        return;
      }

      // 2. No blocking errors — execute directly
      await executeAndRefresh(actionId);
    } finally {
      setIsExecutingActionId(null);
    }
  }, [activeCard, isExecutingActionId, allowOverrideOnError, manualActions, executeAndRefresh]);

  // ── Manual action modal confirm/cancel ──────────────────────────────────────

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

  // ────────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Modals (rendered at root level to escape stacking contexts) */}
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

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Top bar: search + camera button */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <DashboardSearchBar onScan={handleScan} isScanning={isScanning} />
          </div>
          <Link
            href="/cards/scan"
            className="btn btn-ghost"
            style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
          >
            <Camera size={16} strokeWidth={1.8} />
            Cámara
          </Link>
        </div>

        {/* Scan error */}
        {scanError && (
          <div style={{
            padding: "10px 14px",
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: 8,
            fontSize: 12.5,
            color: "#dc2626",
          }}>
            {scanError}
          </div>
        )}

        {/* Main content: active card + activity feed */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 1fr) minmax(320px, 1.4fr)",
          gap: 20,
          alignItems: "start",
        }}>
          {/* Left: Active card zone */}
          <div>
            <div style={{
              fontSize: 12, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.06em", color: "var(--color-muted)",
              marginBottom: 10,
            }}>
              Último carnet escaneado
            </div>
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
          </div>

          {/* Right: Activity feed */}
          <div>
            <ActivityFeed
              key={feedKey}
              initialEntries={initialFeedEntries}
              settings={settings}
              refreshIntervalMs={15000}
            />
          </div>
        </div>
      </div>
    </>
  );
}

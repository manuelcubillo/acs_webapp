"use client";

/**
 * DashboardView
 *
 * Main client-side orchestrator for the operational dashboard.
 *
 * Owns the activity feed's entries. The feed does not poll: every mutation this
 * view performs (scan, resumed auto-actions, manual action) appends the rows the
 * server just logged, built locally from the data the action already returned.
 * `refreshFeed` — the feed's Refrescar button — is the only path back to the
 * server for feed data. See `src/lib/dashboard/feed-entries.ts` for the mirror
 * of the server's logging rules, and keep the two in step.
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

import { useState, useCallback, useMemo } from "react";

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
import { getActivityFeedAction } from "@/lib/actions/dashboard-settings";
import {
  buildScanEntries,
  buildActionEntries,
  prependEntries,
  type FeedBuilderConfig,
  type FeedVisibility,
} from "@/lib/dashboard/feed-entries";
import {
  hasErrorLevelFailures,
  getErrorLevelChecks,
} from "@/lib/validation/scan-validator";
// Import the gate helpers from the pure module (not the barrel) so the client
// bundle never pulls in the DB-backed lifecycle service.
import { buildLifecycleScanCheck } from "@/lib/server/lifecycle/scan-gate";
import type {
  ScanWithAutoActionsResult,
  ActivityFeedEntry,
  DashboardSettings,
  ActionDefinitionWithField,
  CardWithFields,
  AutoActionResult,
} from "@/lib/dal";
import type { LifecycleGateResult } from "@/lib/server/lifecycle/scan-gate";
import type { ScanValidationResult, ScanValidationCheck } from "@/lib/validation/scan-validator";

const TEXT = {
  COLUMN_ACTIVE: "Último carnet escaneado",
  ERR_VALIDATE:  "Error al validar el estado del carnet.",
  ERR_STATE:     "El estado del carnet ha cambiado — se detectaron errores de validación.",
  ERR_RESUME:    "Error al reanudar las acciones automáticas.",
  ERR_EXEC:      "Error al ejecutar la acción.",
  ERR_ACTION:    "Acción",
} as const;

/** Mirrors the DAL default, applied when a tenant has no settings row yet. */
const DEFAULT_FEED_LIMIT = 20;

interface DashboardViewProps {
  initialFeedEntries: ActivityFeedEntry[];
  settings: DashboardSettings | null;
  allowOverrideOnError: boolean;
  kpiData: DashboardKpiData;
  /** Static per-tenant data for building feed rows client-side. */
  feedConfig: FeedBuilderConfig;
}

export default function DashboardView({
  initialFeedEntries,
  settings,
  allowOverrideOnError,
  kpiData,
  feedConfig,
}: DashboardViewProps) {
  // ── State (UNCHANGED from previous implementation) ────────────────────────
  const [scanResult, setScanResult] = useState<ScanWithAutoActionsResult | null>(null);
  const [activeCard, setActiveCard] = useState<CardWithFields | null>(null);
  const [hasBlockingErrors, setHasBlockingErrors] = useState(false);
  const [finalValidationResult, setFinalValidationResult] = useState<ScanValidationResult | null>(null);
  const [lifecycleGate, setLifecycleGate] = useState<LifecycleGateResult | null>(null);

  const [manualActions, setManualActions] = useState<ActionDefinitionWithField[]>([]);

  const [isExecutingActionId, setIsExecutingActionId] = useState<string | null>(null);
  const [manualActionError, setManualActionError] = useState<string | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // ── Activity feed ─────────────────────────────────────────────────────────
  // Owned here, not inside ActivityFeed, so a scan can append its own rows
  // without asking the server. Only refreshFeed goes back to it.
  const [feedEntries, setFeedEntries] = useState<ActivityFeedEntry[]>(initialFeedEntries);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);
  const [lastFeedRefreshAt, setLastFeedRefreshAt] = useState<Date>(() => new Date());

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

  const visibility = useMemo<FeedVisibility>(
    () => ({
      showScanEntries: settings?.showScanEntries ?? true,
      showActionEntries: settings?.showActionEntries ?? true,
      feedLimit: settings?.feedLimit ?? DEFAULT_FEED_LIMIT,
    }),
    [settings],
  );

  const appendFeedEntries = useCallback(
    (entries: ActivityFeedEntry[]) => {
      setFeedEntries((current) =>
        prependEntries(current, entries, visibility.feedLimit),
      );
    },
    [visibility.feedLimit],
  );

  /**
   * The only path back to the server for feed data. Replaces the list wholesale:
   * server rows are the truth and already contain the scans we appended locally,
   * so the locally built rows they displace need no reconciling.
   */
  const refreshFeed = useCallback(async () => {
    setIsRefreshingFeed(true);
    try {
      const result = await getActivityFeedAction({
        limit: visibility.feedLimit,
        includeScanEntries: visibility.showScanEntries,
        includeActionEntries: visibility.showActionEntries,
      });
      if (result.success) {
        setFeedEntries(result.data);
        setLastFeedRefreshAt(new Date());
      }
    } finally {
      setIsRefreshingFeed(false);
    }
  }, [visibility]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleScanResult = useCallback(async (data: ScanWithAutoActionsResult) => {
    setScanResult(data);
    setActiveCard(data.card);
    setHasBlockingErrors(data.hasBlockingErrors);
    setFinalValidationResult(data.finalValidationResult);
    setLifecycleGate(data.lifecycleGate);

    if (data.pausedForConfirmation && data.pendingAutoActionIds) {
      setCompletedAutoActions(data.autoActions);
      setPendingAutoActionIds(data.pendingAutoActionIds);
      setPendingAutoActionNames(data.pendingAutoActionNames ?? []);
      setPauseValidationErrors(data.pauseValidationErrors ?? []);
      setPausedAtAction(data.stoppedAtAction ?? "");
      setShowAutoActionModal(true);
    }

    appendFeedEntries(
      buildScanEntries({
        card: data.card,
        autoActions: data.autoActions,
        config: feedConfig,
        visibility,
      }),
    );
  }, [appendFeedEntries, feedConfig, visibility]);

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
        setLifecycleGate(null);
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
        // Deliberately not handleScanResult: resuming logs no scan row, and
        // re-running the scan pipeline would re-check the card for nothing.
        setActiveCard(resumeResult.data.card);
        setLifecycleGate(resumeResult.data.lifecycleGate);
        // `autoActions` holds only the actions this resume ran, so the rows
        // already appended for the scan are not duplicated. They carry the
        // override badge: resumeAutoActionsAction executes with
        // operatorOverride: true.
        appendFeedEntries(
          buildActionEntries({
            card: resumeResult.data.card,
            autoActions: resumeResult.data.autoActions,
            config: feedConfig,
            visibility,
            operatorOverride: true,
          }),
        );
      } else {
        setManualActionError(resumeResult.error ?? TEXT.ERR_RESUME);
      }
    } finally {
      setIsResumingAutoActions(false);
    }
  }, [
    activeCard,
    pendingAutoActionIds,
    pauseValidationErrors,
    appendFeedEntries,
    feedConfig,
    visibility,
  ]);

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
    if (!cardResult.success) return;

    setActiveCard(cardResult.data.card);
    const newScanResult = cardResult.data.scanResult;
    setFinalValidationResult(newScanResult);
    setHasBlockingErrors(hasErrorLevelFailures(newScanResult));

    // One action ran, so one row was logged. Built from the refreshed card so
    // its summary fields show post-action values, as a server-built row would.
    const definition = manualActions.find((a) => a.id === actionId);
    appendFeedEntries(
      buildActionEntries({
        card: cardResult.data.card,
        autoActions: [
          {
            actionDefinitionId: actionId,
            actionName: definition?.name ?? TEXT.ERR_ACTION,
            success: true,
          },
        ],
        config: feedConfig,
        visibility,
        operatorOverride: withOverride,
      }),
    );
  }, [activeCard, manualActions, appendFeedEntries, feedConfig, visibility]);

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

      // Lifecycle gate takes precedence over scan validation: a switched-off or
      // archived card is denied/blocked or requires an explicit override,
      // regardless of scan-validation state. Server-side enforcement in
      // executeActionAction is the source of truth; this pre-check is for UX.
      const gate = preCheck.data.lifecycleGate;
      if (gate.outcome === "denied_archived" || gate.outcome === "blocked") {
        setManualActionError(gate.reason ?? TEXT.ERR_EXEC);
        return;
      }
      if (gate.outcome === "requires_override") {
        const action = manualActions.find((a) => a.id === actionId);
        // Surface the lifecycle reason (plus any scan errors) in the modal.
        const lcCheck = buildLifecycleScanCheck(gate.status);
        setPendingManualActionId(actionId);
        setPendingManualActionName(action?.name ?? TEXT.ERR_ACTION);
        setManualActionModalErrors([lcCheck, ...getErrorLevelChecks(preCheck.data.scanResult)]);
        setShowManualActionModal(true);
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

        {/* 2. KPI row 
        <DashboardKpis data={kpiData} />
        */}
        
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
              lifecycleGate={lifecycleGate}
              onManualAction={handleManualAction}
              isExecutingActionId={isExecutingActionId}
              actionError={manualActionError}
            />
          </section>

          <ActivityFeed
            entries={feedEntries}
            settings={settings}
            onRefresh={refreshFeed}
            isRefreshing={isRefreshingFeed}
            lastRefreshedAt={lastFeedRefreshAt}
          />
        </div>
      </div>
    </>
  );
}

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
import { buildToggleStates } from "@/lib/fields/toggle-state";
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
import { feedRawBudget, DEFAULT_FEED_LIMIT } from "@/lib/dashboard/feed-grouping";
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
  ActiveZoneFieldConfig,
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

interface DashboardViewProps {
  initialFeedEntries: ActivityFeedEntry[];
  settings: DashboardSettings | null;
  allowOverrideOnError: boolean;
  kpiData: DashboardKpiData;
  /** Static per-tenant data for building feed rows client-side. */
  feedConfig: FeedBuilderConfig;
  /**
   * cardTypeId → the ActiveCardZone grid layout configured for that card type.
   * Static per tenant, so it ships once at page load like `feedConfig`. A card
   * type missing from the map is unconfigured and renders the legacy panel.
   */
  activeCardLayouts: Record<string, ActiveZoneFieldConfig[]>;
}

export default function DashboardView({
  initialFeedEntries,
  settings,
  allowOverrideOnError,
  kpiData,
  feedConfig,
  activeCardLayouts,
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
  /**
   * The paused scan's `action_logs.id`, held across the confirmation modal.
   *
   * Handed back to `resumeAutoActionsAction` so the actions it runs correlate
   * to the ORIGINAL scan. Without this the feed would show the scan and its
   * resumed actions as separate entries — and since a pause waits on a human,
   * no time-window heuristic could reunite them.
   */
  const [pendingScanLogId, setPendingScanLogId] = useState<string | null>(null);
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

  // Trimmed to the RAW budget, not the display limit: these rows are ungrouped,
  // and `ActivityFeed` cuts to `feedLimit` groups after grouping them.
  const appendFeedEntries = useCallback(
    (entries: ActivityFeedEntry[]) => {
      setFeedEntries((current) =>
        prependEntries(current, entries, feedRawBudget(visibility.feedLimit)),
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
        limit: feedRawBudget(visibility.feedLimit),
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
      setPendingScanLogId(data.scanLogId);
      setPausedAtAction(data.stoppedAtAction ?? "");
      setShowAutoActionModal(true);
    }

    appendFeedEntries(
      buildScanEntries({
        card: data.card,
        autoActions: data.autoActions,
        config: feedConfig,
        visibility,
        // The real log id, so these rows group locally exactly as the
        // server-built ones will after a Refrescar.
        scanLogId: data.scanLogId,
        // And the real snapshots, so the VALUES match too. The scan row shows
        // the state the scan observed, not `data.card` — which is the state
        // after the auto-actions and would change on the next Refrescar.
        scanSnapshotId: data.scanSnapshotId,
        snapshots: data.snapshots,
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
        // `is_operator_visible`, not `!is_auto_execute`. The two were the same
        // column's job until migration 0021 split them: a presence toggle both
        // fires on scan AND must be correctable by hand. The migration
        // backfilled `is_operator_visible = NOT is_auto_execute`, so every
        // existing action keeps rendering exactly as it did.
        setManualActions(actionsResult.data.filter((a) => a.isOperatorVisible));
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
        scanLogId: pendingScanLogId,
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
            // The ORIGINAL scan's id, so the resumed rows join the group that
            // scan already anchored instead of appearing beside it.
            scanLogId: resumeResult.data.scanLogId,
            // Each resumed action row reads its own frozen state from here.
            snapshots: resumeResult.data.snapshots,
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
    pendingScanLogId,
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
            // Carries `newValue`, which is what lets a presence row label
            // itself "Entrada" / "Salida" immediately. Without it the row
            // would read "Presencia" until the next Refrescar replaced it
            // with the server-built one.
            result: execResult.data,
          },
        ],
        config: feedConfig,
        visibility,
        operatorOverride: withOverride,
        // The snapshot this execution produced. Same values the server-built
        // row will carry after a Refrescar, projected by the same function.
        snapshots: execResult.data.snapshots,
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

  /**
   * Holds the search bar's queued codes back while the operator is mid-decision
   * or a mutation is running.
   *
   * Every one of these flows reads `activeCard`, and a queued scan would replace
   * it underneath them. `handleAutoActionResume` is the sharp case: it resumes
   * the PAUSED scan's `pendingAutoActionIds` against `activeCard.code`, so a
   * scan slipping in between the modal opening and the operator confirming
   * would run card A's pending actions on card B.
   */
  const isScanBlocked =
    showAutoActionModal ||
    isResumingAutoActions ||
    showManualActionModal ||
    isConfirmingManualAction ||
    isExecutingActionId !== null;

  // Toggle switches show the value they would flip. `activeCard` is replaced
  // after every execution (`executeAndRefresh` re-fetches it), so this is
  // recomputed from server state on each mutation — no optimistic update.
  const toggleStates = buildToggleStates(manualActions, activeCard?.fields ?? []);

  // The scanned card type's presence action, from the same static config the
  // feed builder uses — so the panel and the feed agree on what presence is.
  const presenceActionDefinitionId = activeCard
    ? (feedConfig.presenceActionIds[activeCard.cardTypeId] ?? null)
    : null;

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
        <DashboardSearchBar
          onScan={handleScan}
          isScanning={isScanning}
          isBlocked={isScanBlocked}
        />

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
              summaryLayout={
                activeCard ? activeCardLayouts[activeCard.cardTypeId] ?? [] : []
              }
              autoActions={scanResult?.autoActions ?? []}
              stoppedByValidation={scanResult?.stoppedByValidation ?? false}
              stoppedAtAction={scanResult?.stoppedAtAction ?? null}
              manualActions={manualActions}
              presenceActionDefinitionId={presenceActionDefinitionId}
              toggleStates={toggleStates}
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

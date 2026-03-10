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
 *       3. Warning mode (errors, override allowed): amber buttons → ConfirmActionModal
 *   - Does NOT log a scan entry — this is informational consultation only
 *   - Does NOT execute auto-actions — only manual button-triggered actions
 */

import { useState, useCallback } from "react";
import DynamicFieldRenderer from "./DynamicFieldRenderer";
import CardActions from "./CardActions";
import ScanAlerts from "./ScanAlerts";
import ConfirmActionModal from "@/components/shared/ConfirmActionModal";
import { getCardByCodeAction } from "@/lib/actions/cards";
import { executeActionAction } from "@/lib/actions/actions";
import { hasErrorLevelFailures, getErrorLevelChecks } from "@/lib/validation/scan-validator";
import type { CardWithFields, ActionDefinitionWithField } from "@/lib/dal";
import type { ScanValidationResult, ScanValidationCheck } from "@/lib/validation/scan-validator";

interface CardDetailClientProps {
  initialCard: CardWithFields;
  actions: ActionDefinitionWithField[];
  initialScanResult: ScanValidationResult;
  initialHasBlockingErrors: boolean;
  /** Whether allow_override_on_error is enabled for this tenant. */
  allowOverrideOnError: boolean;
}

export default function CardDetailClient({
  initialCard,
  actions,
  initialScanResult,
  initialHasBlockingErrors,
  allowOverrideOnError,
}: CardDetailClientProps) {
  const [card, setCard] = useState<CardWithFields>(initialCard);
  const [scanResult, setScanResult] = useState<ScanValidationResult>(initialScanResult);
  const [hasBlockingErrors, setHasBlockingErrors] = useState(initialHasBlockingErrors);

  // Inline execution error (shown below the actions sidebar)
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Override confirmation modal state ────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [pendingActionName, setPendingActionName] = useState<string>("");
  const [modalErrors, setModalErrors] = useState<ScanValidationCheck[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);

  // ── Refresh helper ────────────────────────────────────────────────────────────
  const refreshCard = useCallback(async () => {
    const result = await getCardByCodeAction(card.code);
    if (result.success) {
      setCard(result.data.card);
      setScanResult(result.data.scanResult);
      setHasBlockingErrors(hasErrorLevelFailures(result.data.scanResult));
    }
  }, [card.code]);

  // ── Direct execution (no override) — called by CardActions after success ─────
  const handleActionExecuted = useCallback(async () => {
    setActionError(null);
    await refreshCard();
  }, [refreshCard]);

  // ── warningMode click — user clicked action button in amber state ─────────────
  const handleActionClick = useCallback((actionId: string, actionName: string) => {
    const errorChecks = getErrorLevelChecks(scanResult);
    setPendingActionId(actionId);
    setPendingActionName(actionName);
    setModalErrors(errorChecks);
    setActionError(null);
    setShowModal(true);
  }, [scanResult]);

  // ── Modal confirm — execute with operatorOverride: true ──────────────────────
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
        setActionError(res.error ?? "Error al ejecutar la acción.");
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

  // ── Derived button states ──────────────────────────────────────────────────────
  // State 2: blocking errors + override NOT allowed → hard disabled
  const isHardDisabled = hasBlockingErrors && !allowOverrideOnError;
  // State 3: blocking errors + override allowed → warning mode (amber, triggers modal)
  const isWarningMode = hasBlockingErrors && allowOverrideOnError;

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

      {/* Scan validation alerts — updated after each action */}
      {!scanResult.passed && (
        <ScanAlerts scanResult={scanResult} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 20 }}>
        {/* Card panel — field values */}
        <div style={{
          background: "#fff",
          borderRadius: 14,
          border: "1px solid var(--color-border)",
          padding: 24,
        }}>
          {/* Code header */}
          <div style={{ marginBottom: 20 }}>
            <span style={{
              display: "inline-block",
              fontFamily: "monospace",
              fontSize: 13, fontWeight: 700,
              color: "var(--color-muted)",
              background: "#f3f4f6",
              padding: "4px 10px", borderRadius: 6,
              marginBottom: 6,
            }}>
              {card.code}
            </span>
          </div>

          {/* Field values */}
          {card.fields.length === 0 ? (
            <p style={{ color: "var(--color-muted)", fontSize: 14 }}>
              Este carnet no tiene campos.
            </p>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 18,
            }}>
              {card.fields.map((fv) => (
                <div key={fv.fieldDefinitionId} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: "var(--color-muted)",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>
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

        {/* Actions sidebar */}
        {actions.length > 0 && (
          <div style={{
            background: "#fff",
            borderRadius: 14,
            border: "1px solid var(--color-border)",
            padding: 20,
            minWidth: 180,
            alignSelf: "start",
          }}>
            <CardActions
              cardId={card.id}
              actions={actions}
              onActionExecuted={handleActionExecuted}
              disabled={isHardDisabled}
              warningMode={isWarningMode}
              onActionClick={handleActionClick}
              filterAutoExecute={true}
            />

            {/* Inline execution error */}
            {actionError && (
              <div style={{
                marginTop: 10, padding: "8px 12px",
                background: "#fef2f2", border: "1px solid #fca5a5",
                borderRadius: 8, fontSize: 12, color: "#dc2626",
              }}>
                {actionError}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

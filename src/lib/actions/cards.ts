/**
 * Server Actions — Cards
 *
 * Create, read, update, delete and search operations on cards.
 * All tenant-scoped; tenantId is always taken from the session.
 *
 * Role matrix:
 *   OPERATOR: read cards, search, list, execute operational scans
 *   ADMIN:    above + create, update values, update code, delete
 *   MASTER:   all (inherits admin)
 */

"use server";

import { z } from "zod";
import {
  actionHandler,
  requireOperator,
  requireAdmin,
  CardArchivedError,
  type ActionResult,
} from "@/lib/api";
import {
  createCard,
  getCardByCode,
  getCardById,
  updateCard,
  updateCardCode,
  listCards,
  searchCards,
  getScanValidationsByCardType,
  getAutoExecuteActions,
  getActionsForCardType,
  logScanEntry,
  executeAction,
  getDashboardSettings,
} from "@/lib/dal";
import type {
  CardWithFields,
  PaginatedResult,
  SearchCardsInput,
  ScanWithAutoActionsResult,
  AutoActionResult,
  ValidateBeforeActionResult,
  ResumeAutoActionsInput,
} from "@/lib/dal";
import {
  deactivateCard,
  resolveLifecycleGate,
  buildLifecycleScanCheck,
} from "@/lib/server/lifecycle";
import {
  validateScan,
  hasErrorLevelFailures,
  getErrorLevelChecks,
  type ScanValidationResult,
} from "@/lib/validation/scan-validator";
import { signCardPhotos } from "@/lib/dal/photo-urls";

// ─── Composite types ──────────────────────────────────────────────────────────

/** Card data enriched with scan validation results, returned on lookup/scan. */
export interface CardScanResult {
  card: CardWithFields;
  scanResult: ScanValidationResult;
}

/**
 * Replace the result card's photo object keys with short-lived signed read
 * URLs so the client `ActiveCardZone` can render photo fields as thumbnails.
 *
 * Runs after `actionHandler` so validation (which used the raw card, and never
 * reads photo values) is untouched. Signing failures degrade gracefully — the
 * scan still succeeds; photo fields simply render nothing.
 */
async function signScanResultPhotos(
  result: ActionResult<ScanWithAutoActionsResult>,
): Promise<ActionResult<ScanWithAutoActionsResult>> {
  if (!result.success) return result;
  try {
    return { ...result, data: { ...result.data, card: await signCardPhotos(result.data.card) } };
  } catch {
    return result;
  }
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const SearchOperatorSchema = z.enum([
  "contains", "starts_with", "equals_text",
  "eq", "gt", "lt", "gte", "lte", "between",
  "is_true", "is_false",
  "date_eq", "date_before", "date_after", "date_between",
]);

const SearchFilterSchema = z.object({
  fieldDefinitionIds: z.array(z.string().uuid()).min(1),
  operator: SearchOperatorSchema,
  value: z.unknown(),
});

const CreateCardSchema = z.object({
  cardTypeId: z.string().uuid(),
  code: z.string().min(1).max(100),
  /** Values keyed by fieldDefinitionId. */
  values: z.record(z.string().uuid(), z.unknown()),
});

const UpdateCardSchema = z.object({
  /** Values keyed by fieldDefinitionId. */
  values: z.record(z.string().uuid(), z.unknown()),
});

const UpdateCardCodeSchema = z.object({
  newCode: z.string().min(1).max(100),
});

const ListCardsSchema = z.object({
  cardTypeId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

const SearchCardsSchema = z.object({
  cardTypeIds: z.array(z.string().uuid()).min(1),
  codeContains: z.string().optional(),
  filters: z.array(SearchFilterSchema).optional(),
  status: z.enum(["all", "active", "inactive"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

// ─── OPERATOR actions (read-only + action execution) ─────────────────────────

/**
 * Get a card by its tenant-scoped code.
 * Also runs all active scan validations and returns results alongside the card.
 * This is the INFORMATIONAL lookup — it does NOT log a scan entry or run auto-actions.
 * @role operator | admin | master
 */
export async function getCardByCodeAction(
  code: string,
): Promise<ActionResult<CardScanResult>> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    const card = await getCardByCode(code, tenantId);

    // Run scan validations (never throws — informational only)
    const svRules = await getScanValidationsByCardType(card.cardTypeId);
    const scanResult = validateScan(card.fields, svRules);

    return { card, scanResult };
  });
}

/**
 * Operational card scan: logs a scan entry, runs auto-execute actions
 * sequentially (with re-validation between each), and returns full results.
 *
 * Flow:
 *   1. Fetch card + run initial scan validations.
 *   2. Log scan entry (log_type = "scan").
 *   3. Fetch dashboard settings to check allow_override_on_error.
 *   4. If initial validations have error-level failures:
 *        - allow_override_on_error=true  → PAUSE (pausedForConfirmation=true)
 *        - allow_override_on_error=false → BLOCK (hasBlockingErrors=true, no modal)
 *   5. Execute each is_auto_execute action in order. After each action re-fetch
 *      the card and re-evaluate validations. If error-level failures mid-loop:
 *        - allow_override_on_error=true  → PAUSE with remaining actions
 *        - allow_override_on_error=false → STOP permanently
 *   6. Return final card state, per-action results, and final validation state.
 *
 * @role operator | admin | master
 */
export async function executeScanWithAutoActionsAction(
  code: string,
): Promise<ActionResult<ScanWithAutoActionsResult>> {
  const result = await actionHandler(async () => {
    const { userId, tenantId } = await requireOperator();

    // 1. Load card (throws NotFoundError if not found)
    const card = await getCardByCode(code, tenantId);

    // 2. Run initial scan validations (pure — never throws)
    const svRules = await getScanValidationsByCardType(card.cardTypeId);
    const baseScanResult = validateScan(card.fields, svRules);

    // 3. Log the scan entry (log_type = "scan"). ALWAYS — an operational scan is
    //    a real physical event and is logged even for an archived card
    //    (constraint #10). The lifecycle gate below only affects what runs next.
    await logScanEntry({
      cardId: card.id,
      tenantId,
      executedBy: userId,
      metadata: { method: "operational_scan", cardCode: code },
    });

    // 4. Fetch dashboard settings to check override flag
    const settings = await getDashboardSettings(tenantId);
    const allowOverride = settings?.allowOverrideOnError ?? false;

    // 5. Evaluate the lifecycle gate once — the card status does not change
    //    during the auto-action loop, so it is never re-evaluated per action.
    const lifecycleGate = resolveLifecycleGate(card.status, allowOverride);

    // 5a. Archived → hard denial: no auto-actions, no override, no modal, even
    //     when allow_override_on_error is true. The scan is already logged.
    if (lifecycleGate.outcome === "denied_archived") {
      return {
        card,
        scanResult: baseScanResult,
        autoActions: [],
        stoppedByValidation: true,
        stoppedAtAction: null,
        finalValidationResult: baseScanResult,
        hasBlockingErrors: true,
        pausedForConfirmation: false,
        pendingAutoActionIds: null,
        pendingAutoActionNames: null,
        pauseValidationErrors: null,
        lifecycleGate,
      };
    }

    // 5b. Switched-off cards (inactive/expired) surface as an error-level
    //     scan-validation failure by prepending a synthetic check, so the
    //     existing pause/block machinery drives the override flow with no
    //     special-casing. Active cards keep the real scan result untouched.
    const initialScanResult: ScanValidationResult =
      lifecycleGate.outcome === "allowed"
        ? baseScanResult
        : {
            passed: false,
            results: [buildLifecycleScanCheck(card.status), ...baseScanResult.results],
          };

    // 6. Block or pause early if initial validations have error-level failures
    //    (real scan validations and/or the synthetic lifecycle check).
    if (hasErrorLevelFailures(initialScanResult)) {
      const autoActionDefs = await getAutoExecuteActions(card.cardTypeId);
      if (allowOverride) {
        // PAUSE — client will show confirmation modal
        return {
          card,
          scanResult: initialScanResult,
          autoActions: [],
          stoppedByValidation: true,
          stoppedAtAction: null,
          finalValidationResult: initialScanResult,
          hasBlockingErrors: true,
          pausedForConfirmation: true,
          pendingAutoActionIds: autoActionDefs.map((a) => a.id),
          pendingAutoActionNames: autoActionDefs.map((a) => a.name),
          pauseValidationErrors: getErrorLevelChecks(initialScanResult),
          lifecycleGate,
        };
      }
      // BLOCK — no modal, buttons disabled
      return {
        card,
        scanResult: initialScanResult,
        autoActions: [],
        stoppedByValidation: true,
        stoppedAtAction: null,
        finalValidationResult: initialScanResult,
        hasBlockingErrors: true,
        pausedForConfirmation: false,
        pendingAutoActionIds: null,
        pendingAutoActionNames: null,
        pauseValidationErrors: null,
        lifecycleGate,
      };
    }

    // 7. Execute auto-execute actions sequentially, re-validating after each.
    //    Only reached for active cards (off-states paused/blocked above), so the
    //    lifecycle check is never present in this loop's re-validations.
    const autoActionDefs = await getAutoExecuteActions(card.cardTypeId);
    const autoActions: AutoActionResult[] = [];
    let currentValidationResult = initialScanResult;
    let stoppedByValidation = false;
    let stoppedAtAction: string | null = null;

    for (let i = 0; i < autoActionDefs.length; i++) {
      const def = autoActionDefs[i];
      try {
        const execResult = await executeAction({
          cardId: card.id,
          actionDefinitionId: def.id,
          tenantId,
          executedBy: userId,
        });
        autoActions.push({
          actionDefinitionId: def.id,
          actionName: def.name,
          success: true,
          result: execResult,
        });

        // Re-fetch card to get updated field values, then re-validate
        const updatedCard = await getCardByCode(code, tenantId);
        const revalidation = validateScan(updatedCard.fields, svRules);
        currentValidationResult = revalidation;

        if (hasErrorLevelFailures(revalidation)) {
          stoppedByValidation = true;
          stoppedAtAction = def.name;

          if (allowOverride) {
            // PAUSE — return remaining actions for client modal
            const remainingDefs = autoActionDefs.slice(i + 1);
            const finalCard = await getCardByCode(code, tenantId);
            return {
              card: finalCard,
              scanResult: initialScanResult,
              autoActions,
              stoppedByValidation: true,
              stoppedAtAction: def.name,
              finalValidationResult: revalidation,
              hasBlockingErrors: true,
              pausedForConfirmation: true,
              pendingAutoActionIds: remainingDefs.map((a) => a.id),
              pendingAutoActionNames: remainingDefs.map((a) => a.name),
              pauseValidationErrors: getErrorLevelChecks(revalidation),
              lifecycleGate,
            };
          }
          // STOP permanently — no override
          break;
        }
      } catch (err) {
        autoActions.push({
          actionDefinitionId: def.id,
          actionName: def.name,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
        stoppedAtAction = def.name;
        break;
      }
    }

    // 8. Fetch final card state (after all executed actions)
    const finalCard = await getCardByCode(code, tenantId);

    return {
      card: finalCard,
      scanResult: initialScanResult,
      autoActions,
      stoppedByValidation,
      stoppedAtAction,
      finalValidationResult: currentValidationResult,
      hasBlockingErrors: hasErrorLevelFailures(currentValidationResult),
      pausedForConfirmation: false,
      pendingAutoActionIds: null,
      pendingAutoActionNames: null,
      pauseValidationErrors: null,
      lifecycleGate,
    };
  });

  return signScanResultPhotos(result);
}

/**
 * Resumes a paused auto-action flow after operator confirmation.
 *
 * Called when executeScanWithAutoActionsAction returned pausedForConfirmation=true
 * and the operator confirmed they want to continue despite validation errors.
 * All actions executed through this endpoint are logged as operator_override=true.
 *
 * Returns the same ScanWithAutoActionsResult shape so the client handles both
 * responses uniformly (including potential re-pause on mid-loop errors).
 *
 * @role operator | admin | master
 */
export async function resumeAutoActionsAction(
  input: ResumeAutoActionsInput,
): Promise<ActionResult<ScanWithAutoActionsResult>> {
  const result = await actionHandler(async () => {
    const { userId, tenantId } = await requireOperator();

    // 1. Fetch card by code
    const card = await getCardByCode(input.cardCode, tenantId);

    // 2. Re-check settings — setting may have changed while modal was open
    const settings = await getDashboardSettings(tenantId);
    const allowOverride = settings?.allowOverrideOnError ?? false;

    // 2b. Re-evaluate the lifecycle gate — the card may have been archived while
    //     the modal was open. Archived is never overridable, so refuse the
    //     resume outright rather than run the pending actions.
    const lifecycleGate = resolveLifecycleGate(card.status, allowOverride);
    if (lifecycleGate.outcome === "denied_archived") {
      throw new CardArchivedError(lifecycleGate.reason ?? "El carnet está archivado");
    }

    // 3. Run current validations for final state tracking
    const svRules = await getScanValidationsByCardType(card.cardTypeId);
    const initialScanResult = validateScan(card.fields, svRules);

    const autoActions: AutoActionResult[] = [];
    let currentValidationResult = initialScanResult;
    let stoppedByValidation = false;
    let stoppedAtAction: string | null = null;

    // 4. Execute each pending action in order (with override flag)
    for (let i = 0; i < input.pendingActionIds.length; i++) {
      const actionId = input.pendingActionIds[i];

      // Fetch the action definition name for logging
      let actionName = `action_${actionId.slice(0, 8)}`;
      try {
        const allActions = await getActionsForCardType(card.cardTypeId);
        const def = allActions.find((a) => a.id === actionId);
        if (def) actionName = def.name;
      } catch {
        // Non-critical — continue with fallback name
      }

      try {
        const execResult = await executeAction({
          cardId: card.id,
          actionDefinitionId: actionId,
          tenantId,
          executedBy: userId,
          operatorOverride: true,
          overrideValidationErrors: input.overrideValidationErrors,
        });
        autoActions.push({
          actionDefinitionId: actionId,
          actionName,
          success: true,
          result: execResult,
        });

        // Re-fetch card and re-validate after each action
        const updatedCard = await getCardByCode(input.cardCode, tenantId);
        const revalidation = validateScan(updatedCard.fields, svRules);
        currentValidationResult = revalidation;

        if (hasErrorLevelFailures(revalidation)) {
          stoppedByValidation = true;
          stoppedAtAction = actionName;

          if (allowOverride) {
            // PAUSE again — remaining actions after this one
            const remainingIds = input.pendingActionIds.slice(i + 1);
            const remainingNames = remainingIds.map((rid) => {
              const allNames = input.pendingActionIds.map((_, idx) => `action_${idx}`);
              return allNames[i + 1 + (remainingIds.indexOf(rid))] ?? rid.slice(0, 8);
            });
            const finalCard = await getCardByCode(input.cardCode, tenantId);
            return {
              card: finalCard,
              scanResult: initialScanResult,
              autoActions,
              stoppedByValidation: true,
              stoppedAtAction: actionName,
              finalValidationResult: revalidation,
              hasBlockingErrors: true,
              pausedForConfirmation: true,
              pendingAutoActionIds: remainingIds,
              pendingAutoActionNames: remainingNames,
              pauseValidationErrors: getErrorLevelChecks(revalidation),
              lifecycleGate,
            };
          }
          // No override allowed anymore — stop permanently
          break;
        }
      } catch (err) {
        autoActions.push({
          actionDefinitionId: actionId,
          actionName,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
        stoppedAtAction = actionName;
        break;
      }
    }

    // 5. Fetch final card state
    const finalCard = await getCardByCode(input.cardCode, tenantId);

    return {
      card: finalCard,
      scanResult: initialScanResult,
      autoActions,
      stoppedByValidation,
      stoppedAtAction,
      finalValidationResult: currentValidationResult,
      hasBlockingErrors: hasErrorLevelFailures(currentValidationResult),
      pausedForConfirmation: false,
      pendingAutoActionIds: null,
      pendingAutoActionNames: null,
      pauseValidationErrors: null,
      lifecycleGate,
    };
  });

  return signScanResultPhotos(result);
}

/**
 * Validates a card's current field values against its scan validations.
 * Called before executing a manual action to check whether blocking errors exist.
 * Does NOT log a scan entry or mutate any data.
 *
 * @role operator | admin | master
 */
export async function validateBeforeActionAction(
  cardId: string,
): Promise<ActionResult<ValidateBeforeActionResult>> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    const card = await getCardById(cardId, tenantId);
    const svRules = await getScanValidationsByCardType(card.cardTypeId);
    const scanResult = validateScan(card.fields, svRules);

    // Lifecycle gate so the client can pre-empt a denied/blocked action or open
    // the override modal for a switched-off card. Server-side enforcement still
    // happens in executeActionAction (this is a hint, not the gate of record).
    const settings = await getDashboardSettings(tenantId);
    const lifecycleGate = resolveLifecycleGate(
      card.status,
      settings?.allowOverrideOnError ?? false,
    );

    return {
      scanResult,
      hasBlockingErrors: hasErrorLevelFailures(scanResult),
      lifecycleGate,
    };
  });
}

/**
 * Get a card by its internal UUID.
 * @role operator | admin | master
 */
export async function getCardByIdAction(
  id: string,
): Promise<ActionResult<CardWithFields>> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    return getCardById(id, tenantId);
  });
}

/**
 * List cards for a given card type (paginated).
 * @role operator | admin | master
 */
export async function listCardsAction(
  input: unknown,
): Promise<ActionResult<PaginatedResult<CardWithFields>>> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    const data = ListCardsSchema.parse(input);
    return listCards(data.cardTypeId, tenantId, {
      limit: data.limit,
      offset: data.offset,
    });
  });
}

/**
 * Search cards with optional code partial match and field filters.
 * @role operator | admin | master
 */
export async function searchCardsAction(
  input: unknown,
): Promise<ActionResult<PaginatedResult<CardWithFields>>> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    const data = SearchCardsSchema.parse(input);

    const searchInput: SearchCardsInput = {
      codeContains: data.codeContains,
      filters: data.filters,
      status: data.status,
    };

    return searchCards(data.cardTypeIds, tenantId, searchInput, {
      limit: data.limit,
      offset: data.offset,
    });
  });
}

// ─── ADMIN actions (card mutations) ──────────────────────────────────────────

/**
 * Create a new card for the current tenant.
 * @role admin | master
 */
export async function createCardAction(
  input: unknown,
): Promise<ActionResult<CardWithFields>> {
  return actionHandler(async () => {
    const { tenantId } = await requireAdmin();
    const data = CreateCardSchema.parse(input);
    return createCard(data.cardTypeId, tenantId, data.code, data.values);
  });
}

/**
 * Update a card's field values.
 * @role admin | master
 */
export async function updateCardAction(
  code: string,
  input: unknown,
): Promise<ActionResult<CardWithFields>> {
  return actionHandler(async () => {
    const { tenantId } = await requireAdmin();
    const data = UpdateCardSchema.parse(input);
    return updateCard(code, tenantId, data.values);
  });
}

/**
 * Change a card's public code.
 * Returns the full card with enriched field values after the update.
 * @role admin | master
 */
export async function updateCardCodeAction(
  id: string,
  input: unknown,
): Promise<ActionResult<CardWithFields>> {
  return actionHandler(async () => {
    const { tenantId } = await requireAdmin();
    const { newCode } = UpdateCardCodeSchema.parse(input);
    // updateCardCode returns the plain Card row; fetch enriched result after.
    await updateCardCode(id, tenantId, newCode);
    return getCardById(id, tenantId);
  });
}

/**
 * Switch a card off, looked up by its public code.
 *
 * @deprecated Misleading name — this never deleted anything, it set the card to
 * `inactive`. Prefer the explicit lifecycle actions in
 * `src/lib/actions/lifecycle.ts` (`deactivateCardAction` / `archiveCardAction`),
 * which take a card id. Kept as a thin wrapper so the behaviour stays reachable
 * by code; it now routes through the lifecycle service so the transition is
 * validated and audited like every other one.
 *
 * @role admin | master
 */
export async function deleteCardAction(
  code: string,
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    const { userId, tenantId } = await requireAdmin();
    const card = await getCardByCode(code, tenantId);
    await deactivateCard(card.id, { userId, tenantId });
  });
}

"use client";

/**
 * useCardTypeWizard
 *
 * Manages state for the 5-step CardType schema builder wizard.
 *
 * Steps:
 *   0 — BasicInfo           (name, description)
 *   1 — FieldDefinitions    (add / reorder / edit fields)
 *   2 — Actions             (configurable increment/decrement/check/uncheck)
 *   3 — ScanValidations     (rules evaluated on scan to alert operators)
 *   4 — Review              (summary + submit)
 *
 * Works in both CREATE mode and EDIT mode (pass `initialData`).
 */

import { useState, useCallback } from "react";
import {
  createCardTypeAction,
  updateCardTypeAction,
  addFieldDefinitionAction,
  updateFieldDefinitionAction,
  deactivateFieldDefinitionAction,
  reorderFieldDefinitionsAction,
} from "@/lib/actions/card-types";
import {
  createActionDefinitionAction,
  updateActionDefinitionAction,
  deactivateActionDefinitionAction,
} from "@/lib/actions/actions";
import {
  createScanValidationAction,
  updateScanValidationAction,
  deactivateScanValidationAction,
} from "@/lib/actions/scan-validations";

// ─── Exported types ───────────────────────────────────────────────────────────

export type FieldType = "text" | "number" | "boolean" | "date" | "photo" | "select";
export type ActionType = "increment" | "decrement" | "check" | "uncheck";
export type ScanValidationSeverity = "error" | "warning";
export type WizardStep = 0 | 1 | 2 | 3 | 4;

export interface ValidationRule {
  rule: string;
  value: unknown;
  message?: string;
}

/**
 * A field definition in the wizard (may or may not be persisted yet).
 * `tempId` is always set (used as React key + dnd-kit id).
 * `id`     is only set for fields that already exist in the DB (edit mode).
 */
export interface FieldDefinitionDraft {
  tempId: string;
  /** Undefined for new fields; set in edit mode for existing fields. */
  id?: string;
  name: string;
  label: string;
  fieldType: FieldType;
  isRequired: boolean;
  position: number;
  defaultValue: string | null;
  validationRules: { rules: ValidationRule[] } | null;
}

/**
 * An action definition in the wizard.
 *
 * `targetFieldTempId` references the FieldDefinitionDraft by its `tempId`.
 * During submit this is resolved to the real DB field_definition_id.
 * Tip for edit mode: set field drafts' `tempId` equal to their DB `id`,
 * so `targetFieldTempId` can be set directly to the DB id.
 */
export interface ActionDefinitionDraft {
  tempId: string;
  /** Undefined for new actions; set in edit mode for existing actions. */
  id?: string;
  name: string;
  actionType: ActionType;
  /** tempId of the target FieldDefinitionDraft. */
  targetFieldTempId: string;
  /** increment / decrement: { amount: number }. check / uncheck: null. */
  config: { amount?: number } | null;
  icon?: string | null;
  color?: string | null;
  position: number;
}

/**
 * A scan validation rule in the wizard.
 *
 * `fieldTempId` references the FieldDefinitionDraft by its `tempId`.
 * Resolved to a real DB field_definition_id during submit (same convention
 * as ActionDefinitionDraft.targetFieldTempId).
 */
export interface ScanValidationDraft {
  tempId: string;
  /** Undefined for new rules; set in edit mode for existing rules. */
  id?: string;
  /** tempId of the target FieldDefinitionDraft. */
  fieldTempId: string;
  rule: string;
  /** Rule-specific config (JSONB). See scan-validator.ts for shapes. */
  value: unknown;
  errorMessage: string;
  severity: ScanValidationSeverity;
  position: number;
}

export interface BasicInfo {
  name: string;
  description: string;
}

export interface WizardInitialData {
  cardTypeId: string;
  basicInfo: BasicInfo;
  fields: FieldDefinitionDraft[];
  actions: ActionDefinitionDraft[];
  scanValidations: ScanValidationDraft[];
}

// ─── Hook return type ─────────────────────────────────────────────────────────

export interface UseCardTypeWizardReturn {
  /** Current step index (0–4). */
  step: WizardStep;
  basicInfo: BasicInfo;
  fields: FieldDefinitionDraft[];
  actions: ActionDefinitionDraft[];
  scanValidations: ScanValidationDraft[];
  isSubmitting: boolean;
  submitError: string | null;

  // Navigation
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (s: WizardStep) => void;
  canAdvance: boolean;

  // BasicInfo mutations
  setBasicInfo: (info: Partial<BasicInfo>) => void;

  // Field mutations
  addField: (draft: Omit<FieldDefinitionDraft, "tempId" | "position">) => void;
  updateField: (tempId: string, patch: Partial<Omit<FieldDefinitionDraft, "tempId">>) => void;
  removeField: (tempId: string) => void;
  reorderFields: (newOrder: FieldDefinitionDraft[]) => void;

  // Action mutations
  addAction: (draft: Omit<ActionDefinitionDraft, "tempId" | "position">) => void;
  updateAction: (tempId: string, patch: Partial<Omit<ActionDefinitionDraft, "tempId">>) => void;
  removeAction: (tempId: string) => void;

  // ScanValidation mutations
  addScanValidation: (draft: Omit<ScanValidationDraft, "tempId" | "position">) => void;
  updateScanValidation: (tempId: string, patch: Partial<Omit<ScanValidationDraft, "tempId">>) => void;
  removeScanValidation: (tempId: string) => void;
  reorderScanValidations: (newOrder: ScanValidationDraft[]) => void;

  // Submit
  submit: () => Promise<{ success: true; cardTypeId: string } | { success: false; error: string }>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCardTypeWizard(
  initialData?: WizardInitialData,
): UseCardTypeWizardReturn {
  const isEdit = !!initialData;
  const cardTypeId = initialData?.cardTypeId;

  const [step, setStep] = useState<WizardStep>(0);
  const [basicInfo, setBasicInfoState] = useState<BasicInfo>(
    initialData?.basicInfo ?? { name: "", description: "" },
  );
  const [fields, setFields] = useState<FieldDefinitionDraft[]>(
    initialData?.fields ?? [],
  );
  const [actions, setActions] = useState<ActionDefinitionDraft[]>(
    initialData?.actions ?? [],
  );
  const [scanValidations, setScanValidations] = useState<ScanValidationDraft[]>(
    initialData?.scanValidations ?? [],
  );

  /** IDs of existing DB records removed in edit mode (need deactivation). */
  const [removedFieldIds, setRemovedFieldIds] = useState<string[]>([]);
  const [removedActionIds, setRemovedActionIds] = useState<string[]>([]);
  const [removedScanValidationIds, setRemovedScanValidationIds] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ─── Validation per step ──────────────────────────────────────────────────

  const canAdvance: boolean = (() => {
    if (step === 0) return basicInfo.name.trim().length >= 1;
    return true; // steps 1–4: optional sections, always advanceable
  })();

  // ─── Navigation ──────────────────────────────────────────────────────────

  const nextStep = useCallback(() => {
    if (step < 4 && canAdvance) setStep((s) => (s + 1) as WizardStep);
  }, [step, canAdvance]);

  const prevStep = useCallback(() => {
    if (step > 0) setStep((s) => (s - 1) as WizardStep);
  }, [step]);

  const goToStep = useCallback((s: WizardStep) => setStep(s), []);

  // ─── BasicInfo ────────────────────────────────────────────────────────────

  const setBasicInfo = useCallback((info: Partial<BasicInfo>) => {
    setBasicInfoState((prev) => ({ ...prev, ...info }));
  }, []);

  // ─── Field mutations ──────────────────────────────────────────────────────

  const addField = useCallback(
    (draft: Omit<FieldDefinitionDraft, "tempId" | "position">) => {
      setFields((prev) => [
        ...prev,
        { ...draft, tempId: crypto.randomUUID(), position: prev.length },
      ]);
    },
    [],
  );

  const updateField = useCallback(
    (tempId: string, patch: Partial<Omit<FieldDefinitionDraft, "tempId">>) => {
      setFields((prev) =>
        prev.map((f) => (f.tempId === tempId ? { ...f, ...patch } : f)),
      );
    },
    [],
  );

  const removeField = useCallback((tempId: string) => {
    setFields((prev) => {
      const removed = prev.find((f) => f.tempId === tempId);
      if (removed?.id) {
        setRemovedFieldIds((ids) => [...ids, removed.id!]);
      }
      return prev
        .filter((f) => f.tempId !== tempId)
        .map((f, i) => ({ ...f, position: i }));
    });
  }, []);

  const reorderFields = useCallback((newOrder: FieldDefinitionDraft[]) => {
    setFields(newOrder.map((f, i) => ({ ...f, position: i })));
  }, []);

  // ─── Action mutations ─────────────────────────────────────────────────────

  const addAction = useCallback(
    (draft: Omit<ActionDefinitionDraft, "tempId" | "position">) => {
      setActions((prev) => [
        ...prev,
        { ...draft, tempId: crypto.randomUUID(), position: prev.length },
      ]);
    },
    [],
  );

  const updateAction = useCallback(
    (tempId: string, patch: Partial<Omit<ActionDefinitionDraft, "tempId">>) => {
      setActions((prev) =>
        prev.map((a) => (a.tempId === tempId ? { ...a, ...patch } : a)),
      );
    },
    [],
  );

  const removeAction = useCallback((tempId: string) => {
    setActions((prev) => {
      const removed = prev.find((a) => a.tempId === tempId);
      if (removed?.id) {
        setRemovedActionIds((ids) => [...ids, removed.id!]);
      }
      return prev.filter((a) => a.tempId !== tempId);
    });
  }, []);

  // ─── ScanValidation mutations ─────────────────────────────────────────────

  const addScanValidation = useCallback(
    (draft: Omit<ScanValidationDraft, "tempId" | "position">) => {
      setScanValidations((prev) => [
        ...prev,
        { ...draft, tempId: crypto.randomUUID(), position: prev.length },
      ]);
    },
    [],
  );

  const updateScanValidation = useCallback(
    (tempId: string, patch: Partial<Omit<ScanValidationDraft, "tempId">>) => {
      setScanValidations((prev) =>
        prev.map((sv) => (sv.tempId === tempId ? { ...sv, ...patch } : sv)),
      );
    },
    [],
  );

  const removeScanValidation = useCallback((tempId: string) => {
    setScanValidations((prev) => {
      const removed = prev.find((sv) => sv.tempId === tempId);
      if (removed?.id) {
        setRemovedScanValidationIds((ids) => [...ids, removed.id!]);
      }
      return prev
        .filter((sv) => sv.tempId !== tempId)
        .map((sv, i) => ({ ...sv, position: i }));
    });
  }, []);

  const reorderScanValidations = useCallback((newOrder: ScanValidationDraft[]) => {
    setScanValidations(newOrder.map((sv, i) => ({ ...sv, position: i })));
  }, []);

  // ─── Submit ───────────────────────────────────────────────────────────────

  const submit = useCallback(async (): Promise<
    { success: true; cardTypeId: string } | { success: false; error: string }
  > => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      let resolvedCardTypeId: string;

      // Build tempId → real DB id mapping for all fields.
      // In edit mode, existing fields already have `id`; new ones get mapped
      // after they're created. For edit mode, we pre-seed the map with known IDs.
      const fieldIdMap = new Map<string, string>(); // tempId → realId

      if (!isEdit) {
        // ── CREATE MODE ──────────────────────────────────────────────────────

        // 1. Create card type (name + description only)
        const createResult = await createCardTypeAction({
          name: basicInfo.name.trim(),
          description: basicInfo.description.trim() || undefined,
        });
        if (!createResult.success) {
          setSubmitError(createResult.error);
          return { success: false, error: createResult.error };
        }
        resolvedCardTypeId = createResult.data.id;

        // 2. Create fields one-by-one → build fieldIdMap
        for (const field of fields) {
          const r = await addFieldDefinitionAction(resolvedCardTypeId, {
            name: field.name,
            label: field.label,
            fieldType: field.fieldType,
            isRequired: field.isRequired,
            position: field.position,
            defaultValue: field.defaultValue,
            validationRules: field.validationRules,
          });
          if (r.success) {
            fieldIdMap.set(field.tempId, r.data.id);
          }
        }

        // 3. Create actions using resolved field IDs
        for (const action of actions) {
          const targetFieldDefinitionId = fieldIdMap.get(action.targetFieldTempId);
          if (!targetFieldDefinitionId) continue;
          await createActionDefinitionAction(resolvedCardTypeId, {
            name: action.name,
            actionType: action.actionType,
            targetFieldDefinitionId,
            config: action.config,
            icon: action.icon,
            color: action.color,
            position: action.position,
          });
        }

        // 4. Create scan validations using resolved field IDs
        for (const sv of scanValidations) {
          const fieldDefinitionId = fieldIdMap.get(sv.fieldTempId);
          if (!fieldDefinitionId) continue;
          await createScanValidationAction(resolvedCardTypeId, {
            fieldDefinitionId,
            rule: sv.rule,
            value: sv.value,
            errorMessage: sv.errorMessage,
            severity: sv.severity,
            position: sv.position,
          });
        }
      } else {
        // ── EDIT MODE ────────────────────────────────────────────────────────
        resolvedCardTypeId = cardTypeId!;

        // Pre-seed fieldIdMap with all existing fields (tempId === id in edit mode)
        for (const field of fields) {
          if (field.id) fieldIdMap.set(field.tempId, field.id);
        }

        // 1. Update basic info
        const updateResult = await updateCardTypeAction(resolvedCardTypeId, {
          name: basicInfo.name.trim(),
          description: basicInfo.description.trim() || null,
        });
        if (!updateResult.success) {
          setSubmitError(updateResult.error);
          return { success: false, error: updateResult.error };
        }

        // 2. Deactivate removed fields
        for (const fieldId of removedFieldIds) {
          await deactivateFieldDefinitionAction(fieldId);
        }

        // 3. Process fields: add new, update existing
        const orderedFieldIds: string[] = [];
        for (const field of fields) {
          if (!field.id) {
            // New field
            const r = await addFieldDefinitionAction(resolvedCardTypeId, {
              name: field.name,
              label: field.label,
              fieldType: field.fieldType,
              isRequired: field.isRequired,
              position: field.position,
              defaultValue: field.defaultValue,
              validationRules: field.validationRules,
            });
            if (r.success) {
              fieldIdMap.set(field.tempId, r.data.id);
              orderedFieldIds.push(r.data.id);
            }
          } else {
            // Existing field — update mutable fields
            await updateFieldDefinitionAction(field.id, {
              label: field.label,
              isRequired: field.isRequired,
              position: field.position,
              defaultValue: field.defaultValue,
              validationRules: field.validationRules,
            });
            orderedFieldIds.push(field.id);
          }
        }

        // 4. Reorder fields (use persisted IDs in the new order)
        if (orderedFieldIds.length > 0) {
          await reorderFieldDefinitionsAction(resolvedCardTypeId, orderedFieldIds);
        }

        // 5. Deactivate removed actions
        for (const actionId of removedActionIds) {
          await deactivateActionDefinitionAction(actionId);
        }

        // 6. Process actions: add new, update existing
        for (const action of actions) {
          if (!action.id) {
            const targetFieldDefinitionId = fieldIdMap.get(action.targetFieldTempId);
            if (!targetFieldDefinitionId) continue;
            await createActionDefinitionAction(resolvedCardTypeId, {
              name: action.name,
              actionType: action.actionType,
              targetFieldDefinitionId,
              config: action.config,
              icon: action.icon,
              color: action.color,
              position: action.position,
            });
          } else {
            await updateActionDefinitionAction(action.id, {
              name: action.name,
              config: action.config,
              icon: action.icon,
              color: action.color,
              position: action.position,
            });
          }
        }

        // 7. Deactivate removed scan validations
        for (const svId of removedScanValidationIds) {
          await deactivateScanValidationAction(svId);
        }

        // 8. Process scan validations: add new, update existing
        for (const sv of scanValidations) {
          if (!sv.id) {
            const fieldDefinitionId = fieldIdMap.get(sv.fieldTempId);
            if (!fieldDefinitionId) continue;
            await createScanValidationAction(resolvedCardTypeId, {
              fieldDefinitionId,
              rule: sv.rule,
              value: sv.value,
              errorMessage: sv.errorMessage,
              severity: sv.severity,
              position: sv.position,
            });
          } else {
            await updateScanValidationAction(sv.id, {
              rule: sv.rule,
              value: sv.value,
              errorMessage: sv.errorMessage,
              severity: sv.severity,
              position: sv.position,
            });
          }
        }
      }

      return { success: true, cardTypeId: resolvedCardTypeId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      setSubmitError(message);
      return { success: false, error: message };
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isEdit,
    cardTypeId,
    basicInfo,
    fields,
    actions,
    scanValidations,
    removedFieldIds,
    removedActionIds,
    removedScanValidationIds,
  ]);

  return {
    step,
    basicInfo,
    fields,
    actions,
    scanValidations,
    isSubmitting,
    submitError,
    canAdvance,
    nextStep,
    prevStep,
    goToStep,
    setBasicInfo,
    addField,
    updateField,
    removeField,
    reorderFields,
    addAction,
    updateAction,
    removeAction,
    addScanValidation,
    updateScanValidation,
    removeScanValidation,
    reorderScanValidations,
    submit,
  };
}

"use client";

/**
 * useCardTypeWizard
 *
 * Manages state for the 4-step CardType schema builder wizard.
 *
 * Steps:
 *   0 — BasicInfo       (name, description)
 *   1 — FieldDefinitions (add / reorder / edit fields)
 *   2 — Actions          (add action definitions)
 *   3 — Review           (summary + submit)
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

// ─── Exported types ───────────────────────────────────────────────────────────

export type FieldType = "text" | "number" | "boolean" | "date" | "photo" | "select";
export type ActionType = "guest_entry" | "guest_exit";
export type WizardStep = 0 | 1 | 2 | 3;

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
 */
export interface ActionDefinitionDraft {
  tempId: string;
  /** Undefined for new actions; set in edit mode for existing actions. */
  id?: string;
  name: string;
  actionType: ActionType;
  config: Record<string, unknown> | null;
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
}

// ─── Hook return type ─────────────────────────────────────────────────────────

export interface UseCardTypeWizardReturn {
  /** Current step index (0–3). */
  step: WizardStep;
  basicInfo: BasicInfo;
  fields: FieldDefinitionDraft[];
  actions: ActionDefinitionDraft[];
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
  addAction: (draft: Omit<ActionDefinitionDraft, "tempId">) => void;
  updateAction: (tempId: string, patch: Partial<Omit<ActionDefinitionDraft, "tempId">>) => void;
  removeAction: (tempId: string) => void;

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
  /** IDs of existing fields that were removed in edit mode (need to be deactivated). */
  const [removedFieldIds, setRemovedFieldIds] = useState<string[]>([]);
  /** IDs of existing actions removed in edit mode. */
  const [removedActionIds, setRemovedActionIds] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ─── Validation per step ──────────────────────────────────────────────────

  const canAdvance: boolean = (() => {
    if (step === 0) return basicInfo.name.trim().length >= 1;
    if (step === 1) return true; // Fields are optional
    if (step === 2) return true; // Actions are optional
    return true;
  })();

  // ─── Navigation ──────────────────────────────────────────────────────────

  const nextStep = useCallback(() => {
    if (step < 3 && canAdvance) setStep((s) => (s + 1) as WizardStep);
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
      // Track existing DB fields that are removed
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
    (draft: Omit<ActionDefinitionDraft, "tempId">) => {
      setActions((prev) => [...prev, { ...draft, tempId: crypto.randomUUID() }]);
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

  // ─── Submit ───────────────────────────────────────────────────────────────

  const submit = useCallback(async (): Promise<
    { success: true; cardTypeId: string } | { success: false; error: string }
  > => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      let resolvedCardTypeId: string;

      if (!isEdit) {
        // ── CREATE MODE ──────────────────────────────────────────────────────
        const createResult = await createCardTypeAction({
          name: basicInfo.name.trim(),
          description: basicInfo.description.trim() || undefined,
          fieldDefinitions: fields.map((f) => ({
            name: f.name,
            label: f.label,
            fieldType: f.fieldType,
            isRequired: f.isRequired,
            position: f.position,
            defaultValue: f.defaultValue,
            validationRules: f.validationRules,
          })),
        });

        if (!createResult.success) {
          setSubmitError(createResult.error);
          return { success: false, error: createResult.error };
        }

        resolvedCardTypeId = createResult.data.id;

        // Create action definitions
        for (const action of actions) {
          await createActionDefinitionAction(resolvedCardTypeId, {
            name: action.name,
            actionType: action.actionType,
            config: action.config,
          });
        }
      } else {
        // ── EDIT MODE ────────────────────────────────────────────────────────
        resolvedCardTypeId = cardTypeId!;

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
        const newFieldIds: string[] = [];
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
            if (r.success) newFieldIds.push(r.data.id);
          } else {
            // Existing field — update
            await updateFieldDefinitionAction(field.id, {
              label: field.label,
              isRequired: field.isRequired,
              position: field.position,
              defaultValue: field.defaultValue,
              validationRules: field.validationRules,
            });
            newFieldIds.push(field.id);
          }
        }

        // 4. Reorder (by persisted IDs in the new order)
        if (newFieldIds.length > 0) {
          await reorderFieldDefinitionsAction(resolvedCardTypeId, newFieldIds);
        }

        // 5. Deactivate removed actions
        for (const actionId of removedActionIds) {
          await deactivateActionDefinitionAction(actionId);
        }

        // 6. Process actions: add new, update existing
        for (const action of actions) {
          if (!action.id) {
            await createActionDefinitionAction(resolvedCardTypeId, {
              name: action.name,
              actionType: action.actionType,
              config: action.config,
            });
          } else {
            await updateActionDefinitionAction(action.id, {
              name: action.name,
              config: action.config,
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
    removedFieldIds,
    removedActionIds,
  ]);

  return {
    step,
    basicInfo,
    fields,
    actions,
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
    submit,
  };
}

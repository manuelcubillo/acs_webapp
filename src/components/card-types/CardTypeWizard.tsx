"use client";

/**
 * CardTypeWizard
 *
 * Orchestrates the 5-step wizard for creating or editing a card type.
 * Manages step navigation, delegates data to the useCardTypeWizard hook,
 * and renders the appropriate step component.
 *
 * After a successful submit, redirects to the card type detail page.
 */

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useCardTypeWizard } from "@/hooks/useCardTypeWizard";
import WizardStepIndicator from "./WizardStepIndicator";
import BasicInfoStep from "./steps/BasicInfoStep";
import FieldDefinitionsStep from "./steps/FieldDefinitionsStep";
import ActionsStep from "./steps/ActionsStep";
import ScanValidationsStep from "./steps/ScanValidationsStep";
import ReviewStep from "./steps/ReviewStep";
import { Button } from "@/components/ui/button";
import type { WizardInitialData } from "@/hooks/useCardTypeWizard";

const TEXT = {
  TITLE_EDIT:   "Editar tipo de tarjeta",
  TITLE_NEW:    "Nuevo tipo de tarjeta",
  SUBTITLE_NEW: "Sigue los pasos para crear el esquema del nuevo tipo.",
  CANCEL:       "Cancelar",
  PREV:         "Anterior",
  NEXT:         "Siguiente",
  SAVING:       "Guardando…",
  SAVE_EDIT:    "Guardar cambios",
  SAVE_NEW:     "Crear tipo de tarjeta",
  STEP_COUNTER: (current: number, total: number) => `Paso ${current} de ${total}`,
  MODIFYING:    (name: string) => `Modificando: ${name}`,
} as const;

interface CardTypeWizardProps {
  initialData?: WizardInitialData;
}

const TOTAL_STEPS = 5;

export default function CardTypeWizard({ initialData }: CardTypeWizardProps) {
  const router = useRouter();
  const isEdit = !!initialData;

  const {
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
    removeAction,
    addScanValidation,
    removeScanValidation,
    submit,
  } = useCardTypeWizard(initialData);

  async function handleSubmit() {
    const result = await submit();
    if (result.success) {
      router.push(`/card-types/${result.cardTypeId}`);
    }
  }

  const isLastStep = step === TOTAL_STEPS - 1;
  const isFirstStep = step === 0;

  return (
    <div className="flex h-full flex-col">
      {/* ─── Header card: step indicator ─────────────────────────────────── */}
      <div className="animate-fadein mb-6 rounded-xl border bg-card px-8 py-7 shadow-sm">
        {/* Title */}
        <div className="mb-7">
          <div className="mb-1 font-heading text-[22px] font-extrabold text-foreground">
            {isEdit ? TEXT.TITLE_EDIT : TEXT.TITLE_NEW}
          </div>
          <div className="text-sm text-muted-foreground">
            {isEdit ? TEXT.MODIFYING(initialData!.basicInfo.name) : TEXT.SUBTITLE_NEW}
          </div>
        </div>

        <WizardStepIndicator currentStep={step} onGoToStep={goToStep} />
      </div>

      {/* ─── Step content ─────────────────────────────────────────────────── */}
      <div
        className="animate-fadein mb-6 flex-1 overflow-auto rounded-xl border bg-card px-8 py-7 shadow-sm"
        key={step} // remount on step change to trigger animation
      >
        {step === 0 && (
          <BasicInfoStep basicInfo={basicInfo} onChange={setBasicInfo} />
        )}
        {step === 1 && (
          <FieldDefinitionsStep
            fields={fields}
            onAdd={addField}
            onUpdate={updateField}
            onRemove={removeField}
            onReorder={reorderFields}
          />
        )}
        {step === 2 && (
          <ActionsStep
            fields={fields}
            actions={actions}
            onAdd={addAction}
            onRemove={removeAction}
          />
        )}
        {step === 3 && (
          <ScanValidationsStep
            fields={fields}
            scanValidations={scanValidations}
            onAdd={addScanValidation}
            onRemove={removeScanValidation}
          />
        )}
        {step === 4 && (
          <ReviewStep
            basicInfo={basicInfo}
            fields={fields}
            actions={actions}
            scanValidations={scanValidations}
            isEdit={isEdit}
            submitError={submitError}
          />
        )}
      </div>

      {/* ─── Navigation footer ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 rounded-xl border bg-card px-8 py-4 shadow-sm">
        {/* Left: Back or Cancel */}
        <div className="flex gap-2.5">
          {isFirstStep ? (
            <Button variant="ghost" onClick={() => router.push("/card-types")}>
              {TEXT.CANCEL}
            </Button>
          ) : (
            <Button variant="ghost" onClick={prevStep}>
              <ChevronLeft strokeWidth={2} />
              {TEXT.PREV}
            </Button>
          )}
        </div>

        {/* Center: step counter */}
        <div className="text-xs font-medium text-muted-foreground">
          {TEXT.STEP_COUNTER(step + 1, TOTAL_STEPS)}
        </div>

        {/* Right: Next or Submit */}
        <div>
          {isLastStep ? (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="min-w-45"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" strokeWidth={2} />
                  {TEXT.SAVING}
                </>
              ) : isEdit ? (
                TEXT.SAVE_EDIT
              ) : (
                TEXT.SAVE_NEW
              )}
            </Button>
          ) : (
            <Button onClick={nextStep} disabled={!canAdvance}>
              {TEXT.NEXT}
              <ChevronRight strokeWidth={2} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

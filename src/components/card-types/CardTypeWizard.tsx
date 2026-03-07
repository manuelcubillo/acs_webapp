"use client";

/**
 * CardTypeWizard
 *
 * Orchestrates the 4-step wizard for creating or editing a card type.
 * Manages step navigation, delegates data to the useCardTypeWizard hook,
 * and renders the appropriate step component.
 *
 * After a successful submit, calls onSuccess(cardTypeId) so the parent
 * can redirect to the detail page.
 */

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useCardTypeWizard } from "@/hooks/useCardTypeWizard";
import WizardStepIndicator from "./WizardStepIndicator";
import BasicInfoStep from "./steps/BasicInfoStep";
import FieldDefinitionsStep from "./steps/FieldDefinitionsStep";
import ActionsStep from "./steps/ActionsStep";
import ReviewStep from "./steps/ReviewStep";
import type { WizardInitialData } from "@/hooks/useCardTypeWizard";

interface CardTypeWizardProps {
  initialData?: WizardInitialData;
}

export default function CardTypeWizard({ initialData }: CardTypeWizardProps) {
  const router = useRouter();
  const isEdit = !!initialData;

  const {
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
    removeAction,
    submit,
  } = useCardTypeWizard(initialData);

  async function handleSubmit() {
    const result = await submit();
    if (result.success) {
      router.push(`/card-types/${result.cardTypeId}`);
    }
  }

  const isLastStep = step === 3;
  const isFirstStep = step === 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        height: "100%",
      }}
    >
      {/* ─── Header card: step indicator ─────────────────────────────────── */}
      <div
        className="card animate-fadein"
        style={{
          padding: "28px 32px",
          marginBottom: 24,
        }}
      >
        {/* Title */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              fontFamily: "var(--font-heading)",
              color: "var(--color-dark)",
              marginBottom: 4,
            }}
          >
            {isEdit ? "Editar tipo de tarjeta" : "Nuevo tipo de tarjeta"}
          </div>
          <div style={{ fontSize: 13.5, color: "var(--color-secondary)" }}>
            {isEdit
              ? `Modificando: ${initialData!.basicInfo.name}`
              : "Sigue los pasos para crear el esquema del nuevo tipo."}
          </div>
        </div>

        <WizardStepIndicator currentStep={step} onGoToStep={goToStep} />
      </div>

      {/* ─── Step content ─────────────────────────────────────────────────── */}
      <div
        className="card animate-fadein"
        style={{
          flex: 1,
          padding: "28px 32px",
          overflow: "auto",
          marginBottom: 24,
        }}
        key={step} // remount on step change triggers animation
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
            actions={actions}
            onAdd={addAction}
            onRemove={removeAction}
          />
        )}
        {step === 3 && (
          <ReviewStep
            basicInfo={basicInfo}
            fields={fields}
            actions={actions}
            isEdit={isEdit}
            submitError={submitError}
          />
        )}
      </div>

      {/* ─── Navigation footer ────────────────────────────────────────────── */}
      <div
        className="card"
        style={{
          padding: "16px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        {/* Left: Back or Cancel */}
        <div style={{ display: "flex", gap: 10 }}>
          {isFirstStep ? (
            <button
              className="btn btn-ghost"
              onClick={() => router.push("/card-types")}
            >
              Cancelar
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={prevStep}>
              <ChevronLeft size={16} strokeWidth={2} />
              Anterior
            </button>
          )}
        </div>

        {/* Center: step counter */}
        <div
          style={{
            fontSize: 12.5,
            color: "var(--color-muted)",
            fontWeight: 500,
          }}
        >
          Paso {step + 1} de 4
        </div>

        {/* Right: Next or Submit */}
        <div>
          {isLastStep ? (
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={isSubmitting}
              style={{ minWidth: 180 }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                  Guardando…
                </>
              ) : isEdit ? (
                "Guardar cambios"
              ) : (
                "Crear tipo de tarjeta"
              )}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={nextStep}
              disabled={!canAdvance}
            >
              Siguiente
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

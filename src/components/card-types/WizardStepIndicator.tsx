"use client";

/**
 * WizardStepIndicator
 *
 * Visual progress indicator for the 4-step card type wizard.
 * Shows step number, label, and connection lines between steps.
 */

import { Check } from "lucide-react";
import type { WizardStep } from "@/hooks/useCardTypeWizard";

const STEPS: { label: string; sublabel: string }[] = [
  { label: "Información",  sublabel: "Nombre y descripción" },
  { label: "Campos",       sublabel: "Esquema de datos" },
  { label: "Acciones",     sublabel: "Operaciones de campo" },
  { label: "Validaciones", sublabel: "Alertas de escaneo" },
  { label: "Revisión",     sublabel: "Confirmar y guardar" },
];

interface WizardStepIndicatorProps {
  currentStep: WizardStep;
  onGoToStep?: (step: WizardStep) => void;
}

export default function WizardStepIndicator({
  currentStep,
  onGoToStep,
}: WizardStepIndicatorProps) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
      {STEPS.map((step, index) => {
        const state =
          index < currentStep ? "done" : index === currentStep ? "active" : "pending";
        const isLast = index === STEPS.length - 1;
        const isClickable = index < currentStep && !!onGoToStep;

        return (
          <div
            key={index}
            style={{
              display: "flex",
              alignItems: "flex-start",
              flex: isLast ? "none" : 1,
            }}
          >
            {/* Step circle + label */}
            <div
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
              onClick={() => isClickable && onGoToStep(index as WizardStep)}
              title={isClickable ? `Volver a "${step.label}"` : undefined}
            >
              {/* Circle */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border:
                    state === "active"
                      ? "2px solid var(--color-primary)"
                      : state === "done"
                      ? "2px solid #059669"
                      : "2px solid var(--color-border)",
                  background:
                    state === "done"
                      ? "#059669"
                      : state === "active"
                      ? "var(--color-primary)"
                      : "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  color:
                    state === "pending" ? "var(--color-muted)" : "#fff",
                  transition: "all 0.2s ease",
                  cursor: isClickable ? "pointer" : "default",
                  flexShrink: 0,
                }}
              >
                {state === "done" ? (
                  <Check size={16} strokeWidth={2.5} />
                ) : (
                  <span style={{ fontFamily: "var(--font-heading)" }}>{index + 1}</span>
                )}
              </div>

              {/* Label */}
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: state === "active" ? 700 : state === "done" ? 600 : 500,
                    color:
                      state === "active"
                        ? "var(--color-primary)"
                        : state === "done"
                        ? "#059669"
                        : "var(--color-muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {step.label}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: "var(--color-muted)",
                    marginTop: 2,
                    whiteSpace: "nowrap",
                  }}
                >
                  {step.sublabel}
                </div>
              </div>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div style={{
                flex: 1,
                height: 2,
                marginTop: 17,
                background: index < currentStep ? "#059669" : "var(--color-border)",
                transition: "background 0.3s ease",
                minWidth: 20,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

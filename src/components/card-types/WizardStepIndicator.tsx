"use client";

/**
 * WizardStepIndicator
 *
 * Visual progress indicator for the 4-step card type wizard.
 * Shows step number, label, and connection lines between steps.
 *
 * Progress states (done/active/pending) are decorative UI, not access-control
 * outcomes — they use the brand + neutral tokens. The Check icon distinguishes
 * a completed step from the active one.
 */

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
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
    <div className="flex items-start">
      {STEPS.map((step, index) => {
        const state =
          index < currentStep ? "done" : index === currentStep ? "active" : "pending";
        const isLast = index === STEPS.length - 1;
        const isClickable = index < currentStep && !!onGoToStep;

        return (
          <div
            key={index}
            className={cn("flex items-start", !isLast && "flex-1")}
          >
            {/* Step circle + label */}
            <div
              className="flex flex-col items-center gap-2"
              onClick={() => isClickable && onGoToStep(index as WizardStep)}
              title={isClickable ? `Volver a "${step.label}"` : undefined}
            >
              {/* Circle */}
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-all",
                  state === "done" && "border-primary bg-primary text-primary-foreground",
                  state === "active" && "border-primary bg-card text-primary",
                  state === "pending" && "border-border bg-card text-muted-foreground",
                  isClickable ? "cursor-pointer" : "cursor-default",
                )}
              >
                {state === "done" ? (
                  <Check className="size-4" strokeWidth={2.5} />
                ) : (
                  <span className="font-heading">{index + 1}</span>
                )}
              </div>

              {/* Label */}
              <div className="text-center">
                <div
                  className={cn(
                    "whitespace-nowrap text-xs",
                    state === "active" && "font-bold text-primary",
                    state === "done" && "font-semibold text-primary",
                    state === "pending" && "font-medium text-muted-foreground",
                  )}
                >
                  {step.label}
                </div>
                <div className="mt-0.5 whitespace-nowrap text-[10.5px] text-muted-foreground">
                  {step.sublabel}
                </div>
              </div>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div
                className={cn(
                  "mt-[17px] h-0.5 min-w-5 flex-1 transition-colors",
                  index < currentStep ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

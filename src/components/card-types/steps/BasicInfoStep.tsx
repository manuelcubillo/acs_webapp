"use client";

/**
 * BasicInfoStep (Step 0)
 *
 * Collects the card type name and description.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BasicInfo } from "@/hooks/useCardTypeWizard";

const TEXT = {
  HEADING:      "Información básica",
  HEADING_SUB:
    "Define el nombre y descripción del tipo de tarjeta. Esto identifica qué clase de entidades gestionarás con él.",
  NAME_LABEL:   "Nombre",
  NAME_HINT:    "Ej: «Residente», «Vehículo», «Empleado»",
  NAME_PLACEHOLDER: "Nombre del tipo de tarjeta",
  DESC_LABEL:   "Descripción",
  DESC_HINT:    "Opcional. Explica para qué sirve este tipo de tarjeta.",
  DESC_PLACEHOLDER: "Describe brevemente el propósito de este tipo de tarjeta…",
} as const;

interface BasicInfoStepProps {
  basicInfo: BasicInfo;
  onChange: (info: Partial<BasicInfo>) => void;
}

export default function BasicInfoStep({ basicInfo, onChange }: BasicInfoStepProps) {
  return (
    <div className="flex max-w-[600px] flex-col gap-6">
      <div>
        <div className="mb-1.5 font-heading text-xl font-bold text-foreground">
          {TEXT.HEADING}
        </div>
        <div className="text-sm text-muted-foreground">{TEXT.HEADING_SUB}</div>
      </div>

      {/* Name */}
      <div>
        <Label htmlFor="ct-name">
          {TEXT.NAME_LABEL} <span className="text-destructive">*</span>
        </Label>
        <div className="mt-1 mb-2 text-xs text-muted-foreground">
          {TEXT.NAME_HINT}
        </div>
        <Input
          id="ct-name"
          value={basicInfo.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={TEXT.NAME_PLACEHOLDER}
          autoFocus
          maxLength={200}
        />
        <div className="mt-1.5 text-right text-[11px] text-muted-foreground">
          {basicInfo.name.length}/200
        </div>
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="ct-desc">{TEXT.DESC_LABEL}</Label>
        <div className="mt-1 mb-2 text-xs text-muted-foreground">
          {TEXT.DESC_HINT}
        </div>
        <Textarea
          id="ct-desc"
          value={basicInfo.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder={TEXT.DESC_PLACEHOLDER}
          rows={4}
          maxLength={1000}
          className="resize-y leading-relaxed"
        />
        <div className="mt-1.5 text-right text-[11px] text-muted-foreground">
          {basicInfo.description.length}/1000
        </div>
      </div>

      {/* Preview card */}
      {basicInfo.name && (
        <div className="flex items-center gap-3.5 rounded-xl border border-primary/30 bg-accent px-5 py-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary font-heading text-xl font-bold text-primary-foreground">
            {basicInfo.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-heading text-sm font-bold text-primary">
              {basicInfo.name}
            </div>
            {basicInfo.description && (
              <div className="mt-0.5 text-xs text-primary/80">
                {basicInfo.description}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";

import DynamicFieldInput from "./DynamicFieldInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useCardForm } from "@/hooks/useCardForm";
import type { FieldDefinitionShape } from "@/lib/validation/types";

const TEXT = {
  LABEL_CODE:      "Código",
  PLACEHOLDER:     "Ej. AB-0001",
  ERR_CODE:        "El código es obligatorio",
  ERR_FALLBACK:    "Error al guardar el carnet",
  BTN_CANCEL:      "Cancelar",
  BTN_SUBMIT:      "Guardar",
  BTN_SUBMITTING:  "Guardando…",
} as const;

interface CardFormProps {
  fields: FieldDefinitionShape[];
  initialValues?: Record<string, unknown>;
  initialCode?: string;
  /** Card UUID when editing an existing card; null when creating. */
  cardId?: string | null;
  /** Pre-signed read URLs for existing photo values, keyed by fieldDefinitionId. */
  photoReadUrls?: Record<string, string>;
  onSubmit: (
    code: string,
    values: Record<string, unknown>,
  ) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  /** When true, the code input is shown as read-only (editing mode). */
  codeReadOnly?: boolean;
}

export default function CardForm({
  fields,
  initialValues = {},
  initialCode = "",
  cardId = null,
  photoReadUrls = {},
  onSubmit,
  onCancel,
  submitLabel = TEXT.BTN_SUBMIT,
  codeReadOnly = false,
}: CardFormProps) {
  const { values, errors, setValue, validate, isLoading, setIsLoading } =
    useCardForm(fields, initialValues);

  const [code, setCode] = useState(initialCode);
  const [codeError, setCodeError] = useState("");
  const [submitError, setSubmitError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCodeError("");
    setSubmitError("");

    if (!code.trim()) {
      setCodeError(TEXT.ERR_CODE);
      return;
    }
    if (!validate()) return;

    setIsLoading(true);
    try {
      await onSubmit(code.trim(), values);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : TEXT.ERR_FALLBACK,
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="card-form-code" className="text-sm font-semibold text-foreground">
          {TEXT.LABEL_CODE} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="card-form-code"
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setCodeError("");
          }}
          disabled={codeReadOnly || isLoading}
          placeholder={TEXT.PLACEHOLDER}
          aria-invalid={codeError ? true : undefined}
          className={cn(
            "font-mono font-semibold",
            codeError && "border-destructive focus-visible:ring-destructive/40",
            codeReadOnly && "bg-muted",
          )}
        />
        {codeError && <p className="text-xs text-destructive">{codeError}</p>}
      </div>

      {fields.map((field) => (
        <DynamicFieldInput
          key={field.id}
          field={field}
          value={values[field.id]}
          onChange={(v) => setValue(field.id, v)}
          error={errors[field.id]}
          disabled={isLoading}
          cardId={cardId}
          photoReadUrl={photoReadUrls[field.id] ?? null}
        />
      ))}

      {submitError && (
        <div
          role="alert"
          className={cn(
            "rounded-lg border-2 px-3.5 py-2.5 text-sm",
            "bg-state-denied border-state-denied-border text-state-denied-foreground",
          )}
        >
          {submitError}
        </div>
      )}

      <div className="flex justify-end gap-2.5 pt-1">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            {TEXT.BTN_CANCEL}
          </Button>
        )}
        <Button type="submit" disabled={isLoading}>
          {isLoading ? TEXT.BTN_SUBMITTING : submitLabel}
        </Button>
      </div>
    </form>
  );
}

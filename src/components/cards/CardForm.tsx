"use client";

import { useState } from "react";

import DynamicFieldInput from "./DynamicFieldInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useCardForm } from "@/hooks/useCardForm";
import { MIN_LENGTH } from "@/lib/card-codes/constants";
import type { FieldDefinitionShape } from "@/lib/validation/types";

const TEXT = {
  LABEL_CODE:      "Código",
  LABEL_AUTO_CODE: "Asignar código automáticamente",
  /**
   * Derived from the generation policy rather than written out, so the copy
   * cannot drift from the server-side rule. "Al menos" because the length is
   * adaptive: it only grows past MIN_LENGTH if candidates keep colliding.
   */
  HELP_AUTO_CODE:  `Se generará un código numérico automaticamenteupda al crear el carnet.`,
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
  /**
   * Receives the code as an EMPTY STRING when the operator left automatic
   * assignment on, which only `allowAutoCode` forms can produce — manual entry
   * refuses to submit blank. The caller must then omit the code so the server
   * generates one. Any other value is the typed code, verbatim.
   */
  onSubmit: (
    code: string,
    values: Record<string, unknown>,
  ) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  /** When true, the code input is shown as read-only (editing mode). */
  codeReadOnly?: boolean;
  /**
   * Offer the "assign automatically" switch, defaulted on. CREATE ONLY: an
   * existing card already has a code, and changing it is a separate flow
   * (`updateCardCodeAction`), so edit forms leave this off.
   */
  allowAutoCode?: boolean;
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
  allowAutoCode = false,
}: CardFormProps) {
  const { values, errors, setValue, validate, isLoading, setIsLoading } =
    useCardForm(fields, initialValues);

  const [code, setCode] = useState(initialCode);
  const [codeError, setCodeError] = useState("");
  const [submitError, setSubmitError] = useState("");
  // Automatic assignment is the default whenever it is offered, and can never
  // be on when it is not — every branch below keys off this single flag.
  const [autoCode, setAutoCode] = useState(allowAutoCode);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCodeError("");
    setSubmitError("");

    // Automatic assignment skips code validation entirely: there is nothing to
    // validate, and the server owns the value.
    const submittedCode = autoCode ? "" : code.trim();
    if (!autoCode && !submittedCode) {
      setCodeError(TEXT.ERR_CODE);
      return;
    }
    if (!validate()) return;

    setIsLoading(true);
    try {
      await onSubmit(submittedCode, values);
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
      {/* Code — a system column on `cards`, not a field definition, hence its
          own input rather than a DynamicFieldInput. Neutral chrome only: this
          is CRUD, never an access-control outcome, so the reserved --state-*
          tokens stay out of it. */}
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor={autoCode ? undefined : "card-form-code"}
          className="text-sm font-semibold text-foreground"
        >
          {TEXT.LABEL_CODE}{" "}
          {!autoCode && <span className="text-destructive">*</span>}
        </Label>

        {allowAutoCode && (
          <div className="flex items-center gap-2 py-0.5">
            <Switch
              id="card-form-auto-code"
              checked={autoCode}
              onCheckedChange={(checked) => {
                setAutoCode(checked);
                setCodeError("");
              }}
              disabled={isLoading}
            />
            <Label
              htmlFor="card-form-auto-code"
              className="cursor-pointer text-sm font-medium text-foreground"
            >
              {TEXT.LABEL_AUTO_CODE}
            </Label>
          </div>
        )}

        {autoCode ? (
          <p className="text-xs text-muted-foreground">{TEXT.HELP_AUTO_CODE}</p>
        ) : (
          <>
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
          </>
        )}
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

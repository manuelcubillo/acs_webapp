"use client";

import { useState } from "react";
import { useCardForm } from "@/hooks/useCardForm";
import DynamicFieldInput from "./DynamicFieldInput";
import type { FieldDefinitionShape } from "@/lib/validation/types";

interface CardFormProps {
  fields: FieldDefinitionShape[];
  initialValues?: Record<string, unknown>;
  initialCode?: string;
  tenantId: string;
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
  tenantId,
  onSubmit,
  onCancel,
  submitLabel = "Guardar",
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
      setCodeError("El código es obligatorio");
      return;
    }
    if (!validate()) return;

    setIsLoading(true);
    try {
      await onSubmit(code.trim(), values);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Error al guardar el carnet",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: 20 }}
    >
      {/* Code */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label
          style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}
        >
          Código <span style={{ color: "#ef4444" }}>*</span>
        </label>
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setCodeError("");
          }}
          disabled={codeReadOnly || isLoading}
          placeholder="Ej. AB-0001"
          style={{
            padding: "9px 12px",
            borderRadius: 8,
            border: `1.5px solid ${codeError ? "#ef4444" : "var(--color-border)"}`,
            fontSize: 14,
            outline: "none",
            background: codeReadOnly ? "var(--color-page-bg)" : "#fff",
            color: "var(--color-dark)",
            fontFamily: "monospace",
            fontWeight: 600,
            width: "100%",
            boxSizing: "border-box",
          }}
        />
        {codeError && (
          <span style={{ fontSize: 12, color: "#ef4444" }}>{codeError}</span>
        )}
      </div>

      {/* Dynamic fields */}
      {fields.map((field) => (
        <DynamicFieldInput
          key={field.id}
          field={field}
          value={values[field.id]}
          onChange={(v) => setValue(field.id, v)}
          error={errors[field.id]}
          disabled={isLoading}
          tenantId={tenantId}
        />
      ))}

      {/* Submit error */}
      {submitError && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: "#fee2e2",
            color: "#991b1b",
            fontSize: 13,
          }}
        >
          {submitError}
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
          paddingTop: 4,
        }}
      >
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1.5px solid var(--color-border)",
              background: "#fff",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--color-dark)",
            }}
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: "10px 24px",
            borderRadius: 8,
            background: "var(--color-primary)",
            color: "#fff",
            border: "none",
            cursor: isLoading ? "wait" : "pointer",
            fontSize: 14,
            fontWeight: 600,
            opacity: isLoading ? 0.6 : 1,
          }}
        >
          {isLoading ? "Guardando..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

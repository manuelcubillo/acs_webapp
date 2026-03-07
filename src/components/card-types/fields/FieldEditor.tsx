"use client";

/**
 * FieldEditor
 *
 * Slide-in panel / modal for creating or editing a FieldDefinitionDraft.
 * Embedded inside FieldDefinitionsStep; parent controls open/close state.
 */

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import FieldTypeSelector from "./FieldTypeSelector";
import ValidationRulesEditor from "./ValidationRulesEditor";
import type { FieldDefinitionDraft, FieldType, ValidationRule } from "@/hooks/useCardTypeWizard";

interface FieldEditorProps {
  /** undefined → create mode; defined → edit mode */
  draft?: FieldDefinitionDraft | null;
  onSave: (draft: Omit<FieldDefinitionDraft, "tempId" | "position">) => void;
  onClose: () => void;
}

const EMPTY_DRAFT: Omit<FieldDefinitionDraft, "tempId" | "position"> = {
  name: "",
  label: "",
  fieldType: "text",
  isRequired: false,
  defaultValue: null,
  validationRules: null,
};

export default function FieldEditor({ draft, onSave, onClose }: FieldEditorProps) {
  const [form, setForm] = useState<Omit<FieldDefinitionDraft, "tempId" | "position">>(
    draft
      ? {
          id: draft.id,
          name: draft.name,
          label: draft.label,
          fieldType: draft.fieldType,
          isRequired: draft.isRequired,
          defaultValue: draft.defaultValue,
          validationRules: draft.validationRules,
        }
      : EMPTY_DRAFT,
  );

  // Reset when draft changes
  useEffect(() => {
    setForm(
      draft
        ? {
            id: draft.id,
            name: draft.name,
            label: draft.label,
            fieldType: draft.fieldType,
            isRequired: draft.isRequired,
            defaultValue: draft.defaultValue,
            validationRules: draft.validationRules,
          }
        : EMPTY_DRAFT,
    );
  }, [draft]);

  const rules: ValidationRule[] = form.validationRules?.rules ?? [];

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleFieldTypeChange(type: FieldType) {
    // Reset validation rules when field type changes
    setForm((prev) => ({ ...prev, fieldType: type, validationRules: null }));
  }

  function handleRulesChange(newRules: ValidationRule[]) {
    setForm((prev) => ({
      ...prev,
      validationRules: newRules.length > 0 ? { rules: newRules } : null,
    }));
  }

  function handleSave() {
    if (!form.name.trim() || !form.label.trim()) return;
    onSave(form);
    onClose();
  }

  const isEditing = !!draft;
  const canSave = form.name.trim().length > 0 && form.label.trim().length > 0;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(26, 29, 46, 0.35)",
          zIndex: 40,
          backdropFilter: "blur(2px)",
        }}
      />

      {/* Panel */}
      <div
        className="animate-slideup"
        style={{
          position: "fixed",
          bottom: 0,
          left: "var(--sidebar-width)",
          right: 0,
          maxHeight: "85vh",
          background: "#fff",
          borderRadius: "20px 20px 0 0",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.12)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 28px 16px",
            borderBottom: "1px solid var(--color-border-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}>
              {isEditing ? "Editar campo" : "Nuevo campo"}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--color-muted)", marginTop: 2 }}>
              {isEditing
                ? "Modifica las propiedades del campo"
                : "Añade un nuevo campo al tipo de tarjeta"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              border: "1.5px solid var(--color-border)",
              background: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-secondary)",
            }}
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
          <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Name + Label row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>
                  Nombre interno <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <div style={{ fontSize: 11.5, color: "var(--color-muted)", marginBottom: 6 }}>
                  Identificador técnico (snake_case recomendado)
                </div>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="ej: dni_numero"
                  disabled={isEditing && !!draft?.id}
                />
                {isEditing && !!draft?.id && (
                  <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 4 }}>
                    El nombre no se puede modificar en campos existentes.
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>
                  Etiqueta visible <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <div style={{ fontSize: 11.5, color: "var(--color-muted)", marginBottom: 6 }}>
                  Texto que verá el usuario final
                </div>
                <input
                  className="form-input"
                  value={form.label}
                  onChange={(e) => setField("label", e.target.value)}
                  placeholder="ej: Número de DNI"
                />
              </div>
            </div>

            {/* Field type */}
            <div>
              <label style={labelStyle}>Tipo de campo</label>
              <div style={{ marginTop: 10 }}>
                <FieldTypeSelector
                  value={form.fieldType}
                  onChange={handleFieldTypeChange}
                  readOnly={isEditing && !!draft?.id}
                />
                {isEditing && !!draft?.id && (
                  <div style={{ fontSize: 11.5, color: "#d97706", marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                    ⚠ El tipo de campo no se puede cambiar si ya existen valores guardados.
                  </div>
                )}
              </div>
            </div>

            {/* Required + Default value */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>¿Campo obligatorio?</label>
                <div style={{ marginTop: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <div
                      onClick={() => setField("isRequired", !form.isRequired)}
                      style={{
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        background: form.isRequired ? "var(--color-primary)" : "#e5e7eb",
                        position: "relative",
                        transition: "background 0.2s ease",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      <div style={{
                        position: "absolute",
                        top: 4,
                        left: form.isRequired ? 23 : 4,
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "#fff",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                        transition: "left 0.2s ease",
                      }} />
                    </div>
                    <span style={{ fontSize: 13.5, color: "var(--color-dark)", fontWeight: form.isRequired ? 600 : 400 }}>
                      {form.isRequired ? "Obligatorio" : "Opcional"}
                    </span>
                  </label>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Valor por defecto</label>
                <div style={{ fontSize: 11.5, color: "var(--color-muted)", marginBottom: 6 }}>
                  Opcional
                </div>
                <input
                  className="form-input"
                  value={form.defaultValue ?? ""}
                  onChange={(e) => setField("defaultValue", e.target.value || null)}
                  placeholder="Dejar en blanco si no aplica"
                />
              </div>
            </div>

            {/* Validation rules */}
            <div>
              <label style={labelStyle}>Reglas de validación</label>
              <div style={{ fontSize: 11.5, color: "var(--color-muted)", marginBottom: 12 }}>
                Activa las reglas que necesites para este campo
              </div>
              <ValidationRulesEditor
                fieldType={form.fieldType}
                rules={rules}
                onChange={handleRulesChange}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 28px",
          borderTop: "1px solid var(--color-border-soft)",
          display: "flex",
          justifyContent: "flex-end",
          gap: 12,
          flexShrink: 0,
          background: "#fff",
        }}>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!canSave}
          >
            {isEditing ? "Guardar cambios" : "Añadir campo"}
          </button>
        </div>
      </div>
    </>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--color-dark)",
  display: "block",
};

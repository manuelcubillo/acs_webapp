"use client";

/**
 * FieldEditor
 *
 * Slide-in panel / modal for creating or editing a FieldDefinitionDraft.
 * Embedded inside FieldDefinitionsStep; parent controls open/close state.
 *
 * This is a bottom-docked sheet anchored to the content area (right of the
 * sidebar). shadcn has no Sheet primitive installed, so the panel layout is
 * intentionally bespoke; only chrome/colors are tokenized.
 */

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import FieldTypeSelector from "./FieldTypeSelector";
import ValidationRulesEditor from "./ValidationRulesEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { FieldDefinitionDraft, FieldType, ValidationRule } from "@/hooks/useCardTypeWizard";

const TEXT = {
  TITLE_EDIT:    "Editar campo",
  TITLE_NEW:     "Nuevo campo",
  SUB_EDIT:      "Modifica las propiedades del campo",
  SUB_NEW:       "Añade un nuevo campo al tipo de tarjeta",
  NAME_LABEL:    "Nombre interno",
  NAME_HINT:     "Identificador técnico (snake_case recomendado)",
  NAME_PLACEHOLDER: "ej: dni_numero",
  NAME_LOCKED:   "El nombre no se puede modificar en campos existentes.",
  LABEL_LABEL:   "Etiqueta visible",
  LABEL_HINT:    "Texto que verá el usuario final",
  LABEL_PLACEHOLDER: "ej: Número de DNI",
  TYPE_LABEL:    "Tipo de campo",
  TYPE_LOCKED:   "⚠ El tipo de campo no se puede cambiar si ya existen valores guardados.",
  REQUIRED_LABEL: "¿Campo obligatorio?",
  REQUIRED_ON:   "Obligatorio",
  REQUIRED_OFF:  "Opcional",
  DEFAULT_LABEL: "Valor por defecto",
  DEFAULT_HINT:  "Opcional",
  DEFAULT_PLACEHOLDER: "Dejar en blanco si no aplica",
  RULES_LABEL:   "Reglas de validación",
  RULES_HINT:    "Activa las reglas que necesites para este campo",
  CANCEL:        "Cancelar",
  SAVE_EDIT:     "Guardar cambios",
  SAVE_NEW:      "Añadir campo",
} as const;

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
  const nameLocked = isEditing && !!draft?.id;
  const canSave = form.name.trim().length > 0 && form.label.trim().length > 0;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]"
      />

      {/* Panel — docked to the content area (right of the sidebar) */}
      <div className="animate-slideup fixed right-0 bottom-0 left-0 z-50 flex max-h-[85vh] flex-col overflow-hidden rounded-t-[20px] bg-card shadow-2xl md:left-[var(--sidebar-width)]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b px-7 py-4">
          <div>
            <div className="font-heading text-[17px] font-bold text-foreground">
              {isEditing ? TEXT.TITLE_EDIT : TEXT.TITLE_NEW}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {isEditing ? TEXT.SUB_EDIT : TEXT.SUB_NEW}
            </div>
          </div>
          <Button variant="outline" size="icon" onClick={onClose}>
            <X strokeWidth={1.8} />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-7 py-6">
          <div className="flex max-w-[720px] flex-col gap-6">

            {/* Name + Label row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="fe-name">
                  {TEXT.NAME_LABEL} <span className="text-destructive">*</span>
                </Label>
                <div className="mt-1 mb-1.5 text-xs text-muted-foreground">
                  {TEXT.NAME_HINT}
                </div>
                <Input
                  id="fe-name"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder={TEXT.NAME_PLACEHOLDER}
                  disabled={nameLocked}
                />
                {nameLocked && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {TEXT.NAME_LOCKED}
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="fe-label">
                  {TEXT.LABEL_LABEL} <span className="text-destructive">*</span>
                </Label>
                <div className="mt-1 mb-1.5 text-xs text-muted-foreground">
                  {TEXT.LABEL_HINT}
                </div>
                <Input
                  id="fe-label"
                  value={form.label}
                  onChange={(e) => setField("label", e.target.value)}
                  placeholder={TEXT.LABEL_PLACEHOLDER}
                />
              </div>
            </div>

            {/* Field type */}
            <div>
              <Label>{TEXT.TYPE_LABEL}</Label>
              <div className="mt-2.5">
                <FieldTypeSelector
                  value={form.fieldType}
                  onChange={handleFieldTypeChange}
                  readOnly={nameLocked}
                />
                {nameLocked && (
                  <div className="mt-1.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    {TEXT.TYPE_LOCKED}
                  </div>
                )}
              </div>
            </div>

            {/* Required + Default value */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{TEXT.REQUIRED_LABEL}</Label>
                <label className="mt-2.5 flex cursor-pointer items-center gap-2.5">
                  <Switch
                    checked={form.isRequired}
                    onCheckedChange={(checked) => setField("isRequired", checked)}
                  />
                  <span
                    className={cn(
                      "text-sm text-foreground",
                      form.isRequired ? "font-semibold" : "font-normal",
                    )}
                  >
                    {form.isRequired ? TEXT.REQUIRED_ON : TEXT.REQUIRED_OFF}
                  </span>
                </label>
              </div>
              <div>
                <Label htmlFor="fe-default">{TEXT.DEFAULT_LABEL}</Label>
                <div className="mt-1 mb-1.5 text-xs text-muted-foreground">
                  {TEXT.DEFAULT_HINT}
                </div>
                <Input
                  id="fe-default"
                  value={form.defaultValue ?? ""}
                  onChange={(e) => setField("defaultValue", e.target.value || null)}
                  placeholder={TEXT.DEFAULT_PLACEHOLDER}
                />
              </div>
            </div>

            {/* Validation rules */}
            <div>
              <Label>{TEXT.RULES_LABEL}</Label>
              <div className="mt-1 mb-3 text-xs text-muted-foreground">
                {TEXT.RULES_HINT}
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
        <div className="flex shrink-0 justify-end gap-3 border-t bg-card px-7 py-4">
          <Button variant="ghost" onClick={onClose}>
            {TEXT.CANCEL}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isEditing ? TEXT.SAVE_EDIT : TEXT.SAVE_NEW}
          </Button>
        </div>
      </div>
    </>
  );
}

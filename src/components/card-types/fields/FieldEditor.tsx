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
 *
 * The sheet is capped at `--field-editor-width` and centred over the content
 * area, with a gutter that falls back to `px-4` on a narrow screen. One padding
 * box (`px-7`) then aligns header, body and footer — no inner max-widths.
 *
 * Its height is FIXED rather than content-driven. Field types differ a lot in
 * how much they configure (a `photo` has no rules at all, a `select` carries an
 * option list), so a content-driven height moved the header and the save button
 * every time the type changed. Only the body scrolls; short content simply
 * leaves whitespace.
 */

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import DefaultValueInput, { hasDefaultValue } from "./DefaultValueInput";
import FieldTypeSelector from "./FieldTypeSelector";
import SelectOptionsEditor from "./SelectOptionsEditor";
import ValidationRulesEditor from "./ValidationRulesEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ALLOW_MULTIPLE_RULE,
  getAllowMultiple,
  getSelectOptions,
  getValidationRulesForFieldType,
  removeRule,
  SELECT_OPTIONS_RULE,
  upsertRule,
} from "@/lib/validation/rules";
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
  RULES_LABEL:   "Reglas de validación",
  RULES_HINT:    "Se comprueban cuando alguien rellena el campo. Activa las que necesites.",
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

  /**
   * A `select` has no input-validation rules of its own — its options and its
   * multiplicity are configuration and get their own section — so the whole
   * "Reglas de validación" block is hidden for it rather than rendering empty.
   */
  const validationRuleDefs = getValidationRulesForFieldType(form.fieldType);

  const selectOptions = getSelectOptions(form.validationRules);

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleFieldTypeChange(type: FieldType) {
    // Reset validation rules AND the default value: both are shaped by the
    // type, so carrying them across would leave e.g. "mañana" sitting in a
    // date field's default.
    setForm((prev) => ({
      ...prev,
      fieldType: type,
      validationRules: null,
      defaultValue: null,
    }));
  }

  function handleRulesChange(newRules: ValidationRule[]) {
    setForm((prev) => ({
      ...prev,
      validationRules: newRules.length > 0 ? { rules: newRules } : null,
    }));
  }

  function handleOptionsChange(options: string[]) {
    handleRulesChange(
      options.length > 0
        ? upsertRule(rules, SELECT_OPTIONS_RULE, options)
        : removeRule(rules, SELECT_OPTIONS_RULE),
    );
  }

  function handleAllowMultipleChange(allowMultiple: boolean) {
    handleRulesChange(
      allowMultiple
        ? upsertRule(rules, ALLOW_MULTIPLE_RULE, true)
        : removeRule(rules, ALLOW_MULTIPLE_RULE),
    );
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

      {/* Centring wrapper — pins the sheet to the bottom of the content area
          (right of the sidebar) and centres it, so the panel itself only has to
          declare its own size. `pointer-events-none` lets a click in the side
          gutters fall through to the overlay and close the editor. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 md:left-[var(--sidebar-width)]">
        {/* Panel — FIXED height, not content-driven. Its geometry must not
            depend on which field type is selected: a `photo` has no rules and a
            `select` has an option list, so a height that followed the content
            would move the header and the save button every time the type
            changed. The body scrolls and leaves whitespace instead. */}
        <div className="animate-slideup pointer-events-auto flex h-[min(85vh,46rem)] w-full max-w-[var(--field-editor-width)] flex-col overflow-hidden rounded-t-[20px] bg-card shadow-2xl">
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

        {/* Body — the only scrolling region. */}
        <div className="flex-1 overflow-auto px-7 py-6">
          <div className="flex flex-col gap-6">

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
              {hasDefaultValue(form.fieldType) && (
                <div>
                  <Label htmlFor="fe-default">{TEXT.DEFAULT_LABEL}</Label>
                  <div className="mt-1 mb-1.5 text-xs text-muted-foreground">
                    {TEXT.DEFAULT_HINT}
                  </div>
                  <DefaultValueInput
                    fieldType={form.fieldType}
                    value={form.defaultValue}
                    onChange={(v) => setField("defaultValue", v)}
                    selectOptions={selectOptions}
                  />
                </div>
              )}
            </div>

            {/* Select configuration — options are the field's definition,
                not a constraint on what the operator typed. */}
            {form.fieldType === "select" && (
              <SelectOptionsEditor
                options={selectOptions}
                allowMultiple={getAllowMultiple(form.validationRules)}
                onOptionsChange={handleOptionsChange}
                onAllowMultipleChange={handleAllowMultipleChange}
              />
            )}

            {/* Validation rules */}
            {validationRuleDefs.length > 0 && (
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
            )}
          </div>
        </div>

        {/* Footer — outside the scrolling body, so the save button stays put. */}
        <div className="flex shrink-0 justify-end gap-3 border-t bg-card px-7 py-4">
          <Button variant="ghost" onClick={onClose}>
            {TEXT.CANCEL}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isEditing ? TEXT.SAVE_EDIT : TEXT.SAVE_NEW}
          </Button>
        </div>
        </div>
      </div>
    </>
  );
}

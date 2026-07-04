"use client";

/**
 * ScanValidationsStep (Step 3)
 *
 * Define scan validation rules for the card type.
 * Rules are evaluated when a card is scanned and shown to the operator
 * as informational alerts (errors or warnings). They never block actions.
 *
 * Supported rules by field type:
 *   boolean: boolean_is_true | boolean_is_false
 *   number:  number_eq | number_gt | number_lt | number_gte | number_lte | number_between
 *   date:    date_before | date_after | date_equals
 */

import { useState } from "react";
import { Plus, Trash2, AlertCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  ScanValidationDraft,
  ScanValidationSeverity,
  FieldDefinitionDraft,
  FieldType,
} from "@/hooks/useCardTypeWizard";

// ─── Rule definitions ──────────────────────────────────────────────────────────

interface RuleMeta {
  label: string;
  fieldTypes: FieldType[];
  valueShape: "none" | "number" | "number_range" | "date";
}

const RULE_META: Record<string, RuleMeta> = {
  boolean_is_true:  { label: "es Sí (verdadero)",             fieldTypes: ["boolean"], valueShape: "none" },
  boolean_is_false: { label: "es No (falso)",                  fieldTypes: ["boolean"], valueShape: "none" },
  number_eq:        { label: "es igual a",                     fieldTypes: ["number"],  valueShape: "number" },
  number_gt:        { label: "es mayor que",                   fieldTypes: ["number"],  valueShape: "number" },
  number_lt:        { label: "es menor que",                   fieldTypes: ["number"],  valueShape: "number" },
  number_gte:       { label: "es mayor o igual que",           fieldTypes: ["number"],  valueShape: "number" },
  number_lte:       { label: "es menor o igual que",           fieldTypes: ["number"],  valueShape: "number" },
  number_between:   { label: "está entre (mín y máx)",         fieldTypes: ["number"],  valueShape: "number_range" },
  date_before:      { label: "es anterior a",                  fieldTypes: ["date"],    valueShape: "date" },
  date_after:       { label: "es posterior a",                 fieldTypes: ["date"],    valueShape: "date" },
  date_equals:      { label: "es igual a",                     fieldTypes: ["date"],    valueShape: "date" },
};

// Field types allowed in scan validations
const SCANNABLE_FIELD_TYPES: FieldType[] = ["boolean", "number", "date"];

// Severity presentation — these ARE access-control validation outcomes, so they
// use the reserved --state-denied / --state-warning tokens.
const SEVERITY_META: Record<ScanValidationSeverity, {
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  chip: string;
  iconColor: string;
  text: string;
  card: string;
  accent: string;
  hint: string;
}> = {
  error: {
    label: "Error",
    icon: AlertCircle,
    chip: "bg-state-denied text-state-denied-icon",
    iconColor: "text-state-denied-icon",
    text: "text-state-denied-foreground",
    card: "border-state-denied-border bg-state-denied",
    accent: "accent-[var(--state-denied-icon)]",
    hint: "— bloquea visualmente",
  },
  warning: {
    label: "Aviso",
    icon: AlertTriangle,
    chip: "bg-state-warning text-state-warning-icon",
    iconColor: "text-state-warning-icon",
    text: "text-state-warning-foreground",
    card: "border-state-warning-border bg-state-warning",
    accent: "accent-[var(--state-warning-icon)]",
    hint: "— solo informativo",
  },
};

const TEXT = {
  HEADING:     "Validaciones de escaneo",
  HEADING_SUB:
    "Define reglas que se evalúan automáticamente al escanear una tarjeta. Si una regla no se cumple, se muestra una alerta informativa al operador. Las validaciones nunca bloquean las acciones.",
  DELETE:      "Eliminar validación",
  NEW_TITLE:   "Nueva validación",
  FIELD_LABEL: "Campo a evaluar",
  FIELD_PLACEHOLDER: "— Selecciona un campo —",
  NO_FIELDS:   "No hay campos de tipo número, Sí/No o fecha. Añade un campo compatible en el paso anterior.",
  RULE_LABEL:  "Condición de alerta",
  RULE_PLACEHOLDER: "— Selecciona una condición —",
  RULE_HINT_PRE: "La alerta se activará cuando el campo",
  RULE_HINT_STRONG: "no",
  RULE_HINT_POST: "cumpla esta condición.",
  NUM_REF:     "Valor de referencia",
  MIN:         "Mínimo",
  MAX:         "Máximo",
  DATE_REF:    "Fecha de referencia",
  USE_TODAY:   "Usar «hoy» (fecha dinámica al escanear)",
  MSG_LABEL:   "Mensaje de alerta",
  MSG_PLACEHOLDER: "Ej: La fecha de caducidad ha expirado",
  SEVERITY_LABEL: "Nivel de alerta",
  CANCEL:      "Cancelar",
  ADD:         "Añadir validación",
  EMPTY_TITLE: "Sin validaciones definidas",
  EMPTY_BODY:  "Puedes continuar sin validaciones y añadirlas después.",
} as const;

// ─── Helper ───────────────────────────────────────────────────────────────────

function rulesForFieldType(fieldType: FieldType): string[] {
  return Object.entries(RULE_META)
    .filter(([, meta]) => meta.fieldTypes.includes(fieldType))
    .map(([rule]) => rule);
}

function buildRuleValue(shape: RuleMeta["valueShape"], target: string, min: string, max: string, relativeToday: boolean): unknown {
  if (shape === "none") return null;
  if (shape === "number") return { target: parseFloat(target) || 0 };
  if (shape === "number_range") return { min: parseFloat(min) || 0, max: parseFloat(max) || 0 };
  if (shape === "date") {
    if (relativeToday) return { relative: "today" };
    return { target };
  }
  return null;
}

function fieldTypeLabel(fieldType: FieldType): string {
  return fieldType === "number" ? "número" : fieldType === "boolean" ? "Sí/No" : "fecha";
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface ScanValidationsStepProps {
  fields: FieldDefinitionDraft[];
  scanValidations: ScanValidationDraft[];
  onAdd: (draft: Omit<ScanValidationDraft, "tempId" | "position">) => void;
  onRemove: (tempId: string) => void;
}

export default function ScanValidationsStep({
  fields,
  scanValidations,
  onAdd,
  onRemove,
}: ScanValidationsStepProps) {
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [fieldTempId, setFieldTempId] = useState("");
  const [rule, setRule] = useState("");
  const [numTarget, setNumTarget] = useState("");
  const [numMin, setNumMin] = useState("");
  const [numMax, setNumMax] = useState("");
  const [dateTarget, setDateTarget] = useState("");
  const [relativeToday, setRelativeToday] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [severity, setSeverity] = useState<ScanValidationSeverity>("error");

  const scannableFields = fields.filter((f) => SCANNABLE_FIELD_TYPES.includes(f.fieldType));
  const selectedField = scannableFields.find((f) => f.tempId === fieldTempId);
  const availableRules = selectedField ? rulesForFieldType(selectedField.fieldType) : [];
  const ruleMeta = rule ? RULE_META[rule] : null;
  const valueShape = ruleMeta?.valueShape ?? "none";

  function handleFieldChange(tid: string) {
    setFieldTempId(tid);
    setRule(""); // reset rule when field changes
    setNumTarget(""); setNumMin(""); setNumMax("");
    setDateTarget(""); setRelativeToday(false);
  }

  function handleAdd() {
    if (!fieldTempId || !rule || !errorMessage.trim()) return;
    const value = buildRuleValue(valueShape, numTarget, numMin, numMax, relativeToday);
    onAdd({ fieldTempId, rule, value, errorMessage: errorMessage.trim(), severity });
    resetForm();
  }

  function resetForm() {
    setShowForm(false);
    setFieldTempId(""); setRule("");
    setNumTarget(""); setNumMin(""); setNumMax("");
    setDateTarget(""); setRelativeToday(false);
    setErrorMessage(""); setSeverity("error");
  }

  const canAdd = !!fieldTempId && !!rule && !!errorMessage.trim();

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <div className="mb-1.5 font-heading text-xl font-bold text-foreground">
          {TEXT.HEADING}
        </div>
        <div className="text-sm text-muted-foreground">{TEXT.HEADING_SUB}</div>
      </div>

      {/* Existing validations */}
      {scanValidations.length > 0 && (
        <div className="flex flex-col gap-2">
          {scanValidations.map((sv) => {
            const targetField = scannableFields.find((f) => f.tempId === sv.fieldTempId);
            const sm = SEVERITY_META[sv.severity];
            const Icon = sm.icon;
            return (
              <div
                key={sv.tempId}
                className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3"
              >
                <div className={cn("mt-px flex size-8.5 shrink-0 items-center justify-center rounded-[9px]", sm.chip)}>
                  <Icon className="size-4" strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground">
                    {sv.errorMessage}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {targetField?.label ?? sv.fieldTempId}
                    {" · "}
                    {RULE_META[sv.rule]?.label ?? sv.rule}
                    {" · "}
                    <span className={cn("font-semibold", sm.text)}>{sm.label}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => onRemove(sv.tempId)}
                  title={TEXT.DELETE}
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 strokeWidth={1.8} />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add form */}
      {showForm ? (
        <div className="rounded-xl border bg-muted/40 p-5">
          <div className="mb-4 text-sm font-semibold text-foreground">
            {TEXT.NEW_TITLE}
          </div>

          {/* Field selector */}
          <div className="mb-3.5">
            <Label>
              {TEXT.FIELD_LABEL} <span className="text-destructive">*</span>
            </Label>
            {scannableFields.length === 0 ? (
              <div className="mt-2 rounded-md border border-amber-400/50 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                {TEXT.NO_FIELDS}
              </div>
            ) : (
              <Select value={fieldTempId} onValueChange={handleFieldChange}>
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue placeholder={TEXT.FIELD_PLACEHOLDER} />
                </SelectTrigger>
                <SelectContent>
                  {scannableFields.map((f) => (
                    <SelectItem key={f.tempId} value={f.tempId}>
                      {f.label} ({fieldTypeLabel(f.fieldType)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Rule selector */}
          {selectedField && (
            <div className="mb-3.5">
              <Label>
                {TEXT.RULE_LABEL} <span className="text-destructive">*</span>
              </Label>
              <Select value={rule} onValueChange={setRule}>
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue placeholder={TEXT.RULE_PLACEHOLDER} />
                </SelectTrigger>
                <SelectContent>
                  {availableRules.map((r) => (
                    <SelectItem key={r} value={r}>
                      {selectedField.label} {RULE_META[r].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-1 text-xs text-muted-foreground">
                {TEXT.RULE_HINT_PRE} <strong>{TEXT.RULE_HINT_STRONG}</strong> {TEXT.RULE_HINT_POST}
              </div>
            </div>
          )}

          {/* Value inputs */}
          {rule && valueShape !== "none" && (
            <div className="mb-3.5">
              {valueShape === "number" && (
                <>
                  <Label htmlFor="sv-num">{TEXT.NUM_REF}</Label>
                  <Input
                    id="sv-num"
                    type="number"
                    step="any"
                    value={numTarget}
                    onChange={(e) => setNumTarget(e.target.value)}
                    placeholder="0"
                    className="mt-1.5 max-w-45"
                  />
                </>
              )}
              {valueShape === "number_range" && (
                <div className="flex items-end gap-3">
                  <div>
                    <Label htmlFor="sv-min">{TEXT.MIN}</Label>
                    <Input
                      id="sv-min"
                      type="number"
                      step="any"
                      value={numMin}
                      onChange={(e) => setNumMin(e.target.value)}
                      placeholder="0"
                      className="mt-1.5 max-w-35"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sv-max">{TEXT.MAX}</Label>
                    <Input
                      id="sv-max"
                      type="number"
                      step="any"
                      value={numMax}
                      onChange={(e) => setNumMax(e.target.value)}
                      placeholder="100"
                      className="mt-1.5 max-w-35"
                    />
                  </div>
                </div>
              )}
              {valueShape === "date" && (
                <>
                  <Label>{TEXT.DATE_REF}</Label>
                  <div className="mt-1.5 flex flex-col gap-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={relativeToday}
                        onCheckedChange={(checked) => {
                          const on = checked === true;
                          setRelativeToday(on);
                          if (on) setDateTarget("");
                        }}
                      />
                      {TEXT.USE_TODAY}
                    </label>
                    {!relativeToday && (
                      <Input
                        type="date"
                        value={dateTarget}
                        onChange={(e) => setDateTarget(e.target.value)}
                        className="max-w-50"
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Error message */}
          {rule && (
            <div className="mb-3.5">
              <Label htmlFor="sv-msg">
                {TEXT.MSG_LABEL} <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="sv-msg"
                value={errorMessage}
                onChange={(e) => setErrorMessage(e.target.value)}
                placeholder={TEXT.MSG_PLACEHOLDER}
                rows={2}
                className="mt-1.5 min-h-15 resize-y"
              />
            </div>
          )}

          {/* Severity */}
          {rule && (
            <div className="mb-4">
              <Label>{TEXT.SEVERITY_LABEL}</Label>
              <div className="mt-2 flex gap-2.5">
                {(["error", "warning"] as const).map((s) => {
                  const sm = SEVERITY_META[s];
                  const selected = severity === s;
                  const Icon = sm.icon;
                  return (
                    <label
                      key={s}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-3.5 py-2 text-sm",
                        selected ? sm.card : "border-border bg-card",
                      )}
                    >
                      <input
                        type="radio"
                        name="severity"
                        value={s}
                        checked={selected}
                        onChange={() => setSeverity(s)}
                        className={cn("size-4", sm.accent)}
                      />
                      <Icon className={cn("size-3.5", sm.iconColor)} strokeWidth={1.8} />
                      <span className={cn("font-semibold", sm.text)}>{sm.label}</span>
                      <span className="text-xs text-muted-foreground">{sm.hint}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2.5">
            <Button variant="ghost" onClick={resetForm}>
              {TEXT.CANCEL}
            </Button>
            <Button onClick={handleAdd} disabled={!canAdd}>
              {TEXT.ADD}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          onClick={() => setShowForm(true)}
          className="self-start"
        >
          <Plus strokeWidth={2} />
          {TEXT.ADD}
        </Button>
      )}

      {/* Empty state */}
      {scanValidations.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed bg-muted px-6 py-9 text-center text-muted-foreground">
          <div className="mb-2 text-3xl">🔍</div>
          <div className="text-sm font-semibold text-foreground">{TEXT.EMPTY_TITLE}</div>
          <div className="mt-1 text-xs">{TEXT.EMPTY_BODY}</div>
        </div>
      )}
    </div>
  );
}

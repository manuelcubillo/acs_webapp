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

function severityLabel(severity: ScanValidationSeverity) {
  return severity === "error" ? "Error" : "Aviso";
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

  const canAdd = fieldTempId && rule && errorMessage.trim();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--color-dark)", marginBottom: 6 }}>
          Validaciones de escaneo
        </div>
        <div style={{ fontSize: 13.5, color: "var(--color-secondary)" }}>
          Define reglas que se evalúan automáticamente al escanear una tarjeta.
          Si una regla no se cumple, se muestra una alerta informativa al operador.
          Las validaciones nunca bloquean las acciones.
        </div>
      </div>

      {/* Existing validations */}
      {scanValidations.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {scanValidations.map((sv) => {
            const targetField = scannableFields.find((f) => f.tempId === sv.fieldTempId);
            const isError = sv.severity === "error";
            const color = isError ? "#dc2626" : "#d97706";
            const bg = isError ? "#fef2f2" : "#fffbeb";
            const Icon = isError ? AlertCircle : AlertTriangle;
            return (
              <div
                key={sv.tempId}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "13px 16px",
                  background: "#fff",
                  border: "1.5px solid var(--color-border)",
                  borderRadius: 12,
                }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 9,
                  background: bg, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  color, flexShrink: 0, marginTop: 1,
                }}>
                  <Icon size={16} strokeWidth={1.8} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}>
                    {sv.errorMessage}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--color-muted)", marginTop: 3 }}>
                    {targetField?.label ?? sv.fieldTempId}
                    {" · "}
                    {RULE_META[sv.rule]?.label ?? sv.rule}
                    {" · "}
                    <span style={{ color, fontWeight: 600 }}>{severityLabel(sv.severity)}</span>
                  </div>
                </div>
                <button
                  onClick={() => onRemove(sv.tempId)}
                  title="Eliminar validación"
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    border: "1.5px solid #fecaca", background: "#fef2f2",
                    cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    color: "#dc2626", flexShrink: 0,
                  }}
                >
                  <Trash2 size={14} strokeWidth={1.8} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add form */}
      {showForm ? (
        <div style={{
          padding: "20px",
          background: "#fafbfc",
          border: "1.5px solid var(--color-border)",
          borderRadius: 14,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-dark)", marginBottom: 16 }}>
            Nueva validación
          </div>

          {/* Field selector */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>
              Campo a evaluar <span style={{ color: "#dc2626" }}>*</span>
            </label>
            {scannableFields.length === 0 ? (
              <div style={{
                marginTop: 8, padding: "10px 14px",
                background: "#fff3cd", border: "1px solid #ffc107",
                borderRadius: 8, fontSize: 12.5, color: "#856404",
              }}>
                No hay campos de tipo número, Sí/No o fecha.
                Añade un campo compatible en el paso anterior.
              </div>
            ) : (
              <select
                className="form-input"
                value={fieldTempId}
                onChange={(e) => handleFieldChange(e.target.value)}
                style={{ marginTop: 6 }}
              >
                <option value="">— Selecciona un campo —</option>
                {scannableFields.map((f) => (
                  <option key={f.tempId} value={f.tempId}>
                    {f.label} ({f.fieldType === "number" ? "número" : f.fieldType === "boolean" ? "Sí/No" : "fecha"})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Rule selector */}
          {selectedField && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>
                Condición de alerta <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <select
                className="form-input"
                value={rule}
                onChange={(e) => setRule(e.target.value)}
                style={{ marginTop: 6 }}
              >
                <option value="">— Selecciona una condición —</option>
                {availableRules.map((r) => (
                  <option key={r} value={r}>
                    {selectedField.label} {RULE_META[r].label}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11.5, color: "var(--color-muted)", marginTop: 4 }}>
                La alerta se activará cuando el campo <strong>no</strong> cumpla esta condición.
              </div>
            </div>
          )}

          {/* Value inputs */}
          {rule && valueShape !== "none" && (
            <div style={{ marginBottom: 14 }}>
              {valueShape === "number" && (
                <>
                  <label style={labelStyle}>Valor de referencia</label>
                  <input
                    className="form-input"
                    type="number"
                    step="any"
                    value={numTarget}
                    onChange={(e) => setNumTarget(e.target.value)}
                    placeholder="0"
                    style={{ marginTop: 6, maxWidth: 180 }}
                  />
                </>
              )}
              {valueShape === "number_range" && (
                <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                  <div>
                    <label style={labelStyle}>Mínimo</label>
                    <input
                      className="form-input"
                      type="number"
                      step="any"
                      value={numMin}
                      onChange={(e) => setNumMin(e.target.value)}
                      placeholder="0"
                      style={{ marginTop: 6, maxWidth: 140 }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Máximo</label>
                    <input
                      className="form-input"
                      type="number"
                      step="any"
                      value={numMax}
                      onChange={(e) => setNumMax(e.target.value)}
                      placeholder="100"
                      style={{ marginTop: 6, maxWidth: 140 }}
                    />
                  </div>
                </div>
              )}
              {valueShape === "date" && (
                <>
                  <label style={labelStyle}>Fecha de referencia</label>
                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
                    <label style={{
                      display: "flex", alignItems: "center", gap: 8,
                      fontSize: 13, cursor: "pointer",
                    }}>
                      <input
                        type="checkbox"
                        checked={relativeToday}
                        onChange={(e) => {
                          setRelativeToday(e.target.checked);
                          if (e.target.checked) setDateTarget("");
                        }}
                      />
                      Usar «hoy» (fecha dinámica al escanear)
                    </label>
                    {!relativeToday && (
                      <input
                        className="form-input"
                        type="date"
                        value={dateTarget}
                        onChange={(e) => setDateTarget(e.target.value)}
                        style={{ maxWidth: 200 }}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Error message */}
          {rule && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>
                Mensaje de alerta <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <textarea
                className="form-input"
                value={errorMessage}
                onChange={(e) => setErrorMessage(e.target.value)}
                placeholder="Ej: La fecha de caducidad ha expirado"
                rows={2}
                style={{ marginTop: 6, resize: "vertical", minHeight: 60 }}
              />
            </div>
          )}

          {/* Severity */}
          {rule && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Nivel de alerta</label>
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                {(["error", "warning"] as const).map((s) => {
                  const selected = severity === s;
                  const sColor = s === "error" ? "#dc2626" : "#d97706";
                  const sBg = s === "error" ? "#fef2f2" : "#fffbeb";
                  const Icon = s === "error" ? AlertCircle : AlertTriangle;
                  return (
                    <label
                      key={s}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 14px",
                        border: `1.5px solid ${selected ? sColor : "var(--color-border)"}`,
                        borderRadius: 8,
                        background: selected ? sBg : "#fff",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      <input
                        type="radio"
                        name="severity"
                        value={s}
                        checked={selected}
                        onChange={() => setSeverity(s)}
                        style={{ accentColor: sColor }}
                      />
                      <Icon size={14} strokeWidth={1.8} style={{ color: sColor }} />
                      <span style={{ fontWeight: 600, color: sColor }}>
                        {severityLabel(s)}
                      </span>
                      <span style={{ color: "var(--color-muted)", fontSize: 11.5 }}>
                        {s === "error" ? "— bloquea visualmente" : "— solo informativo"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-ghost" onClick={resetForm}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAdd}
              disabled={!canAdd}
            >
              Añadir validación
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-ghost"
          onClick={() => setShowForm(true)}
          style={{ alignSelf: "flex-start" }}
        >
          <Plus size={16} strokeWidth={2} />
          Añadir validación
        </button>
      )}

      {/* Empty state */}
      {scanValidations.length === 0 && !showForm && (
        <div style={{
          textAlign: "center",
          padding: "36px 24px",
          background: "var(--color-subtle-bg)",
          borderRadius: 12,
          border: "1.5px dashed var(--color-border)",
          color: "var(--color-muted)",
        }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🔍</div>
          <div style={{ fontWeight: 600, color: "var(--color-secondary)", fontSize: 13.5 }}>Sin validaciones definidas</div>
          <div style={{ marginTop: 4, fontSize: 12.5 }}>
            Puedes continuar sin validaciones y añadirlas después.
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--color-dark)",
  display: "block",
};

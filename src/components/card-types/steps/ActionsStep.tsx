"use client";

/**
 * ActionsStep (Step 2)
 *
 * Define action definitions for the card type.
 * Supports: increment, decrement, check, uncheck.
 * Each action targets a specific field compatible with its type.
 *
 * The "Auto-ejecutar al escanear" toggle marks an action as is_auto_execute,
 * meaning it runs automatically every time an operator does an operational scan.
 */

import { useState } from "react";
import { Plus, Trash2, TrendingUp, TrendingDown, CheckSquare, Square, Zap } from "lucide-react";
import type {
  ActionDefinitionDraft,
  ActionType,
  FieldDefinitionDraft,
} from "@/hooks/useCardTypeWizard";

// ─── Action type metadata ──────────────────────────────────────────────────────

const ACTION_TYPE_META: Record<
  ActionType,
  {
    label: string;
    description: string;
    fieldFilter: "number" | "boolean";
    icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
    color: string;
    bg: string;
    hasAmount: boolean;
  }
> = {
  increment: {
    label: "Incrementar",
    description: "Suma una cantidad a un campo numérico",
    fieldFilter: "number",
    icon: TrendingUp,
    color: "#059669",
    bg: "#ecfdf5",
    hasAmount: true,
  },
  decrement: {
    label: "Decrementar",
    description: "Resta una cantidad a un campo numérico",
    fieldFilter: "number",
    icon: TrendingDown,
    color: "#dc2626",
    bg: "#fef2f2",
    hasAmount: true,
  },
  check: {
    label: "Marcar como Sí",
    description: "Establece un campo Sí/No a verdadero",
    fieldFilter: "boolean",
    icon: CheckSquare,
    color: "#4f5bff",
    bg: "#eef0ff",
    hasAmount: false,
  },
  uncheck: {
    label: "Marcar como No",
    description: "Establece un campo Sí/No a falso",
    fieldFilter: "boolean",
    icon: Square,
    color: "#6b7094",
    bg: "#f3f4f6",
    hasAmount: false,
  },
};

const ACTION_TYPE_ORDER: ActionType[] = ["increment", "decrement", "check", "uncheck"];

// ─── Component ─────────────────────────────────────────────────────────────────

interface ActionsStepProps {
  fields: FieldDefinitionDraft[];
  actions: ActionDefinitionDraft[];
  onAdd: (draft: Omit<ActionDefinitionDraft, "tempId" | "position">) => void;
  onRemove: (tempId: string) => void;
}

const EMPTY_AMOUNT = "";

export default function ActionsStep({ fields, actions, onAdd, onRemove }: ActionsStepProps) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<ActionType>("increment");
  const [newTargetTempId, setNewTargetTempId] = useState("");
  const [newAmount, setNewAmount] = useState<string>(EMPTY_AMOUNT);
  const [newIsAutoExecute, setNewIsAutoExecute] = useState(false);

  const meta = ACTION_TYPE_META[newType];

  // Filter fields compatible with selected action type
  const compatibleFields = fields.filter((f) => f.fieldType === meta.fieldFilter);

  function handleTypeChange(type: ActionType) {
    setNewType(type);
    setNewTargetTempId("");
    setNewAmount(EMPTY_AMOUNT);
  }

  function handleAdd() {
    if (!newName.trim() || !newTargetTempId) return;
    const amount = meta.hasAmount ? (parseFloat(newAmount) || 1) : undefined;
    onAdd({
      name: newName.trim(),
      actionType: newType,
      targetFieldTempId: newTargetTempId,
      config: meta.hasAmount ? { amount } : null,
      icon: null,
      color: null,
      isAutoExecute: newIsAutoExecute,
    });
    resetForm();
  }

  function resetForm() {
    setShowForm(false);
    setNewName("");
    setNewType("increment");
    setNewTargetTempId("");
    setNewAmount(EMPTY_AMOUNT);
    setNewIsAutoExecute(false);
  }

  const canAdd = newName.trim().length > 0 && newTargetTempId.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--color-dark)", marginBottom: 6 }}>
          Acciones de tarjeta
        </div>
        <div style={{ fontSize: 13.5, color: "var(--color-secondary)" }}>
          Las acciones modifican campos específicos de la tarjeta cuando el operador las ejecuta.
          Por ejemplo: incrementar un contador de asistencia o marcar un campo como completado.
        </div>
      </div>

      {/* Existing actions list */}
      {actions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {actions.map((action) => {
            const m = ACTION_TYPE_META[action.actionType];
            const Icon = m.icon;
            // Find the target field name
            const targetField = fields.find((f) => f.tempId === action.targetFieldTempId);
            const amountLabel = m.hasAmount && action.config?.amount != null
              ? ` · ${action.config.amount}`
              : "";
            return (
              <div
                key={action.tempId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "13px 16px",
                  background: "#fff",
                  border: "1.5px solid var(--color-border)",
                  borderRadius: 12,
                }}
              >
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: m.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: m.color,
                  flexShrink: 0,
                }}>
                  <Icon size={18} strokeWidth={1.8} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-dark)", fontFamily: "var(--font-heading)", display: "flex", alignItems: "center", gap: 6 }}>
                    {action.name}
                    {action.isAutoExecute && (
                      <span title="Auto-ejecutar al escanear" style={{
                        display: "inline-flex", alignItems: "center", gap: 3,
                        fontSize: 10.5, fontWeight: 600,
                        color: "#d97706", background: "#fffbeb",
                        border: "1px solid #fcd34d", borderRadius: 5,
                        padding: "1px 6px", lineHeight: 1.4,
                      }}>
                        <Zap size={10} strokeWidth={2} />
                        Auto
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 2 }}>
                    {m.label}{amountLabel}
                    {targetField && (
                      <> · <span style={{ color: "var(--color-secondary)" }}>{targetField.label}</span></>
                    )}
                  </div>
                </div>
                <span style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 5,
                  background: m.bg,
                  color: m.color,
                  border: `1px solid ${m.color}30`,
                  flexShrink: 0,
                }}>
                  {m.label}
                </span>
                <button
                  onClick={() => onRemove(action.tempId)}
                  title="Eliminar acción"
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    border: "1.5px solid #fecaca", background: "#fef2f2",
                    cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "center", color: "#dc2626", flexShrink: 0,
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
            Nueva acción
          </div>

          {/* Action type */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Tipo de acción</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              {ACTION_TYPE_ORDER.map((type) => {
                const m = ACTION_TYPE_META[type];
                const Icon = m.icon;
                const selected = newType === type;
                return (
                  <label
                    key={type}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      border: `1.5px solid ${selected ? m.color : "var(--color-border)"}`,
                      borderRadius: 10,
                      background: selected ? m.bg : "#fff",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <input
                      type="radio"
                      name="actionType"
                      value={type}
                      checked={selected}
                      onChange={() => handleTypeChange(type)}
                      style={{ accentColor: m.color, flexShrink: 0 }}
                    />
                    <div style={{
                      width: 28, height: 28, borderRadius: 7,
                      background: selected ? m.color : "#f3f4f6",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: selected ? "#fff" : "#6b7094", flexShrink: 0,
                    }}>
                      <Icon size={14} strokeWidth={1.8} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-dark)" }}>{m.label}</div>
                      <div style={{ fontSize: 11, color: "var(--color-muted)", lineHeight: 1.3 }}>{m.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Target field */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>
              Campo destino <span style={{ color: "#dc2626" }}>*</span>
              <span style={{ fontWeight: 400, color: "var(--color-muted)", marginLeft: 6 }}>
                (campos de tipo {meta.fieldFilter === "number" ? "número" : "Sí/No"})
              </span>
            </label>
            {compatibleFields.length === 0 ? (
              <div style={{
                marginTop: 8, padding: "10px 14px",
                background: "#fff3cd", border: "1px solid #ffc107",
                borderRadius: 8, fontSize: 12.5, color: "#856404",
              }}>
                No hay campos de tipo {meta.fieldFilter === "number" ? "número" : "Sí/No"} definidos.
                Añade un campo compatible en el paso anterior.
              </div>
            ) : (
              <select
                className="form-input"
                value={newTargetTempId}
                onChange={(e) => setNewTargetTempId(e.target.value)}
                style={{ marginTop: 6 }}
              >
                <option value="">— Selecciona un campo —</option>
                {compatibleFields.map((f) => (
                  <option key={f.tempId} value={f.tempId}>
                    {f.label} ({f.name})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Amount (increment/decrement only) */}
          {meta.hasAmount && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                Cantidad <span style={{ fontWeight: 400, color: "var(--color-muted)" }}>(por defecto: 1)</span>
              </label>
              <input
                className="form-input"
                type="number"
                min="0.01"
                step="any"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="1"
                style={{ marginTop: 6, maxWidth: 160 }}
              />
            </div>
          )}

          {/* Action name */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>
              Nombre del botón <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="form-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ej: Registrar asistencia"
              style={{ marginTop: 6 }}
              autoFocus
            />
          </div>

          {/* Auto-execute toggle */}
          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 14px",
                background: newIsAutoExecute ? "#fffbeb" : "#f8f9fa",
                border: `1.5px solid ${newIsAutoExecute ? "#fcd34d" : "var(--color-border)"}`,
                borderRadius: 10,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <input
                type="checkbox"
                checked={newIsAutoExecute}
                onChange={(e) => setNewIsAutoExecute(e.target.checked)}
                style={{ marginTop: 2, accentColor: "#d97706", flexShrink: 0 }}
              />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}>
                  <Zap size={14} strokeWidth={2} color={newIsAutoExecute ? "#d97706" : "#9ca3af"} />
                  Auto-ejecutar al escanear
                </div>
                <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 3, lineHeight: 1.4 }}>
                  Esta acción se ejecutará automáticamente cada vez que un operador realice un escaneo operacional.
                  Útil para registrar entradas/salidas o contadores de visitas.
                </div>
              </div>
            </label>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-ghost" onClick={resetForm}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAdd}
              disabled={!canAdd}
            >
              Añadir acción
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
          Añadir acción
        </button>
      )}

      {/* Empty state */}
      {actions.length === 0 && !showForm && (
        <div style={{
          textAlign: "center",
          padding: "36px 24px",
          background: "var(--color-subtle-bg)",
          borderRadius: 12,
          border: "1.5px dashed var(--color-border)",
          color: "var(--color-muted)",
        }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>⚡</div>
          <div style={{ fontWeight: 600, color: "var(--color-secondary)", fontSize: 13.5 }}>Sin acciones definidas</div>
          <div style={{ marginTop: 4, fontSize: 12.5 }}>
            Puedes continuar sin acciones y añadirlas después.
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

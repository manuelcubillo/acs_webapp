"use client";

/**
 * ActionsStep (Step 2)
 *
 * Define action definitions for the card type.
 * Currently supports: guest_entry, guest_exit.
 */

import { useState } from "react";
import { Plus, Trash2, LogIn, LogOut } from "lucide-react";
import type { ActionDefinitionDraft, ActionType } from "@/hooks/useCardTypeWizard";

interface ActionsStepProps {
  actions: ActionDefinitionDraft[];
  onAdd: (draft: Omit<ActionDefinitionDraft, "tempId">) => void;
  onRemove: (tempId: string) => void;
}

const ACTION_TYPE_META: Record<
  ActionType,
  { label: string; description: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; color: string; bg: string }
> = {
  guest_entry: {
    label: "Entrada de invitado",
    description: "Registra la entrada de una persona invitada",
    icon: LogIn,
    color: "#059669",
    bg: "#ecfdf5",
  },
  guest_exit: {
    label: "Salida de invitado",
    description: "Registra la salida de una persona invitada",
    icon: LogOut,
    color: "#dc2626",
    bg: "#fef2f2",
  },
};

const AVAILABLE_ACTION_TYPES: ActionType[] = ["guest_entry", "guest_exit"];

export default function ActionsStep({ actions, onAdd, onRemove }: ActionsStepProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<ActionType>("guest_entry");

  const usedTypes = new Set(actions.map((a) => a.actionType));

  function handleAdd() {
    if (!newName.trim()) return;
    onAdd({ name: newName.trim(), actionType: newType, config: null });
    setNewName("");
    setShowPicker(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--color-dark)", marginBottom: 6 }}>
          Definiciones de acciones
        </div>
        <div style={{ fontSize: 13.5, color: "var(--color-secondary)" }}>
          Las acciones permiten registrar eventos específicos sobre las tarjetas.
          Por ejemplo: registrar la entrada o salida de un invitado.
        </div>
      </div>

      {/* Existing actions */}
      {actions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {actions.map((action) => {
            const meta = ACTION_TYPE_META[action.actionType];
            const Icon = meta.icon;
            return (
              <div
                key={action.tempId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  background: "#fff",
                  border: "1.5px solid var(--color-border)",
                  borderRadius: 12,
                }}
              >
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: meta.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: meta.color,
                  flexShrink: 0,
                }}>
                  <Icon size={18} strokeWidth={1.8} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-dark)", fontFamily: "var(--font-heading)" }}>
                    {action.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 2 }}>
                    {meta.label}
                  </div>
                </div>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: 5,
                  background: meta.bg,
                  color: meta.color,
                  border: `1px solid ${meta.color}30`,
                  flexShrink: 0,
                }}>
                  {action.actionType}
                </span>
                <button
                  onClick={() => onRemove(action.tempId)}
                  title="Eliminar acción"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: "1.5px solid #fecaca",
                    background: "#fef2f2",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#dc2626",
                    flexShrink: 0,
                  }}
                >
                  <Trash2 size={14} strokeWidth={1.8} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add action picker */}
      {showPicker ? (
        <div style={{
          padding: "20px",
          background: "#fafbfc",
          border: "1.5px solid var(--color-border)",
          borderRadius: 14,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-dark)", marginBottom: 16 }}>
            Nueva acción
          </div>

          {/* Action type selection */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Tipo de acción</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {AVAILABLE_ACTION_TYPES.map((type) => {
                const meta = ACTION_TYPE_META[type];
                const Icon = meta.icon;
                const alreadyUsed = usedTypes.has(type) && actions.find((a) => a.actionType === type);
                return (
                  <label
                    key={type}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      border: `1.5px solid ${newType === type ? meta.color : "var(--color-border)"}`,
                      borderRadius: 10,
                      background: newType === type ? meta.bg : "#fff",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <input
                      type="radio"
                      name="actionType"
                      value={type}
                      checked={newType === type}
                      onChange={() => setNewType(type)}
                      style={{ accentColor: meta.color }}
                    />
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: newType === type ? meta.color : "#f3f4f6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: newType === type ? "#fff" : "#6b7094",
                      flexShrink: 0,
                    }}>
                      <Icon size={16} strokeWidth={1.8} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}>
                        {meta.label}
                        {alreadyUsed && (
                          <span style={{ fontSize: 10.5, color: "#d97706", marginLeft: 6 }}>ya añadido</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--color-muted)" }}>{meta.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Action name */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>
              Nombre de la acción <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <div style={{ marginTop: 6 }}>
              <input
                className="form-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej: Registrar entrada de visitante"
                autoFocus
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn btn-ghost"
              onClick={() => { setShowPicker(false); setNewName(""); }}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAdd}
              disabled={!newName.trim()}
            >
              Añadir acción
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-ghost"
          onClick={() => setShowPicker(true)}
          style={{ alignSelf: "flex-start" }}
        >
          <Plus size={16} strokeWidth={2} />
          Añadir acción
        </button>
      )}

      {actions.length === 0 && !showPicker && (
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

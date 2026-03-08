"use client";

/**
 * ReviewStep (Step 4)
 *
 * Shows a read-only summary of all wizard data before submission.
 */

import {
  Type, Hash, ToggleLeft, Calendar, Camera, List,
  TrendingUp, TrendingDown, CheckSquare, Square,
  AlertCircle, AlertTriangle, CheckCircle,
} from "lucide-react";
import type {
  BasicInfo,
  FieldDefinitionDraft,
  ActionDefinitionDraft,
  ScanValidationDraft,
  FieldType,
  ActionType,
} from "@/hooks/useCardTypeWizard";

interface ReviewStepProps {
  basicInfo: BasicInfo;
  fields: FieldDefinitionDraft[];
  actions: ActionDefinitionDraft[];
  scanValidations: ScanValidationDraft[];
  isEdit: boolean;
  submitError: string | null;
}

// ─── Field type icons ──────────────────────────────────────────────────────────

const FIELD_ICONS: Record<FieldType, { icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; color: string; bg: string; label: string }> = {
  text:    { icon: Type,       color: "#4f5bff", bg: "#eef0ff", label: "Texto" },
  number:  { icon: Hash,       color: "#059669", bg: "#ecfdf5", label: "Número" },
  boolean: { icon: ToggleLeft, color: "#d97706", bg: "#fffbeb", label: "Sí/No" },
  date:    { icon: Calendar,   color: "#7c3aed", bg: "#f5f3ff", label: "Fecha" },
  photo:   { icon: Camera,     color: "#db2777", bg: "#fdf2f8", label: "Foto" },
  select:  { icon: List,       color: "#0284c7", bg: "#f0f9ff", label: "Selección" },
};

// ─── Action type icons ─────────────────────────────────────────────────────────

const ACTION_ICONS: Record<ActionType, { icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; color: string; bg: string; label: string }> = {
  increment: { icon: TrendingUp,   color: "#059669", bg: "#ecfdf5", label: "Incrementar" },
  decrement: { icon: TrendingDown, color: "#dc2626", bg: "#fef2f2", label: "Decrementar" },
  check:     { icon: CheckSquare,  color: "#4f5bff", bg: "#eef0ff", label: "Marcar Sí" },
  uncheck:   { icon: Square,       color: "#6b7094", bg: "#f3f4f6", label: "Marcar No" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReviewStep({
  basicInfo,
  fields,
  actions,
  scanValidations,
  isEdit,
  submitError,
}: ReviewStepProps) {
  // Build field lookup by tempId for display
  const fieldByTempId = new Map(fields.map((f) => [f.tempId, f]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--color-dark)", marginBottom: 6 }}>
          Revisión final
        </div>
        <div style={{ fontSize: 13.5, color: "var(--color-secondary)" }}>
          Revisa el esquema antes de {isEdit ? "guardar los cambios" : "crear el tipo de tarjeta"}.
        </div>
      </div>

      {/* Error alert */}
      {submitError && (
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "14px 16px",
          background: "#fef2f2",
          border: "1.5px solid #fecaca",
          borderRadius: 12,
          color: "#dc2626",
        }}>
          <AlertCircle size={18} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>Error al guardar</div>
            <div style={{ fontSize: 12.5, marginTop: 2 }}>{submitError}</div>
          </div>
        </div>
      )}

      {/* Basic info card */}
      <Section title="Información básica">
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 20px", alignItems: "start" }}>
          <KV label="Nombre" value={basicInfo.name} />
          <KV
            label="Descripción"
            value={basicInfo.description || <span style={{ color: "var(--color-muted)", fontStyle: "italic" }}>Sin descripción</span>}
          />
        </div>
      </Section>

      {/* Fields */}
      <Section title={`Campos (${fields.length})`}>
        {fields.length === 0 ? (
          <EmptyNote>No se han definido campos.</EmptyNote>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {fields.map((field, i) => {
              const meta = FIELD_ICONS[field.fieldType];
              const Icon = meta.icon;
              return (
                <div
                  key={field.tempId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    background: "#fafbfc",
                    border: "1px solid var(--color-border-soft)",
                    borderRadius: 10,
                  }}
                >
                  <div style={{ width: 22, height: 22, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, color: "var(--color-muted)" }}>
                    {i + 1}
                  </div>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: meta.bg, display: "flex",
                    alignItems: "center", justifyContent: "center",
                    color: meta.color, flexShrink: 0,
                  }}>
                    <Icon size={15} strokeWidth={1.8} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}>
                      {field.label}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--color-muted)", marginLeft: 8 }}>
                      {field.name}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <Tag color={meta.color} bg={meta.bg}>{meta.label}</Tag>
                    {field.isRequired && <Tag color="#dc2626" bg="#fef2f2">Obligatorio</Tag>}
                    {field.validationRules && field.validationRules.rules.length > 0 && (
                      <Tag color="#059669" bg="#ecfdf5">
                        {field.validationRules.rules.length} regla{field.validationRules.rules.length !== 1 ? "s" : ""}
                      </Tag>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Actions */}
      <Section title={`Acciones (${actions.length})`}>
        {actions.length === 0 ? (
          <EmptyNote>No se han definido acciones.</EmptyNote>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {actions.map((action) => {
              const meta = ACTION_ICONS[action.actionType];
              const Icon = meta.icon;
              const targetField = fieldByTempId.get(action.targetFieldTempId);
              const amountText = meta.label === "Incrementar" || meta.label === "Decrementar"
                ? ` · ${action.config?.amount ?? 1}`
                : "";
              return (
                <div
                  key={action.tempId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    background: "#fafbfc",
                    border: "1px solid var(--color-border-soft)",
                    borderRadius: 10,
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: meta.bg, display: "flex",
                    alignItems: "center", justifyContent: "center",
                    color: meta.color, flexShrink: 0,
                  }}>
                    <Icon size={15} strokeWidth={1.8} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}>
                      {action.name}
                    </span>
                    {targetField && (
                      <span style={{ fontSize: 12, color: "var(--color-muted)", marginLeft: 8 }}>
                        → {targetField.label}{amountText}
                      </span>
                    )}
                  </div>
                  <Tag color={meta.color} bg={meta.bg}>{meta.label}</Tag>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Scan Validations */}
      <Section title={`Validaciones de escaneo (${scanValidations.length})`}>
        {scanValidations.length === 0 ? (
          <EmptyNote>No se han definido validaciones de escaneo.</EmptyNote>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {scanValidations.map((sv) => {
              const targetField = fieldByTempId.get(sv.fieldTempId);
              const isError = sv.severity === "error";
              const color = isError ? "#dc2626" : "#d97706";
              const bg = isError ? "#fef2f2" : "#fffbeb";
              const SvIcon = isError ? AlertCircle : AlertTriangle;
              return (
                <div
                  key={sv.tempId}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "10px 14px",
                    background: "#fafbfc",
                    border: "1px solid var(--color-border-soft)",
                    borderRadius: 10,
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: bg, display: "flex",
                    alignItems: "center", justifyContent: "center",
                    color, flexShrink: 0,
                  }}>
                    <SvIcon size={15} strokeWidth={1.8} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}>
                      {sv.errorMessage}
                    </span>
                    {targetField && (
                      <div style={{ fontSize: 11.5, color: "var(--color-muted)", marginTop: 2 }}>
                        {targetField.label} · {sv.rule}
                      </div>
                    )}
                  </div>
                  <Tag color={color} bg={bg}>
                    {isError ? "Error" : "Aviso"}
                  </Tag>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Summary callout */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 18px",
        background: "#ecfdf5",
        border: "1.5px solid #a7f3d0",
        borderRadius: 12,
        color: "#059669",
      }}>
        <CheckCircle size={18} strokeWidth={1.8} style={{ flexShrink: 0 }} />
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>
          Todo listo. Pulsa{" "}
          <strong>{isEdit ? "«Guardar cambios»" : "«Crear tipo de tarjeta»"}</strong>{" "}
          para continuar.
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid var(--color-border)", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--color-border-soft)", fontSize: 13.5, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}>
        {title}
      </div>
      <div style={{ padding: "16px 18px" }}>{children}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: 0.4, paddingTop: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, color: "var(--color-dark)" }}>{value}</div>
    </>
  );
}

function Tag({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10.5,
      fontWeight: 600,
      padding: "2px 7px",
      borderRadius: 5,
      color,
      background: bg,
      border: `1px solid ${color}30`,
    }}>
      {children}
    </span>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, color: "var(--color-muted)", fontStyle: "italic" }}>
      {children}
    </div>
  );
}

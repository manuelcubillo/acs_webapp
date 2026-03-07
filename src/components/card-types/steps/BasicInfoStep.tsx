"use client";

/**
 * BasicInfoStep (Step 0)
 *
 * Collects the card type name and description.
 */

import type { BasicInfo } from "@/hooks/useCardTypeWizard";

interface BasicInfoStepProps {
  basicInfo: BasicInfo;
  onChange: (info: Partial<BasicInfo>) => void;
}

export default function BasicInfoStep({ basicInfo, onChange }: BasicInfoStepProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 600 }}>
      <div>
        <div style={{
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "var(--font-heading)",
          color: "var(--color-dark)",
          marginBottom: 6,
        }}>
          Información básica
        </div>
        <div style={{ fontSize: 13.5, color: "var(--color-secondary)" }}>
          Define el nombre y descripción del tipo de tarjeta. Esto identifica qué
          clase de entidades gestionarás con él.
        </div>
      </div>

      {/* Name */}
      <div>
        <label style={labelStyle}>
          Nombre <span style={{ color: "#dc2626" }}>*</span>
        </label>
        <div style={{ fontSize: 11.5, color: "var(--color-muted)", marginBottom: 8 }}>
          Ej: «Residente», «Vehículo», «Empleado»
        </div>
        <input
          className="form-input"
          value={basicInfo.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Nombre del tipo de tarjeta"
          autoFocus
          maxLength={200}
        />
        <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 5, textAlign: "right" }}>
          {basicInfo.name.length}/200
        </div>
      </div>

      {/* Description */}
      <div>
        <label style={labelStyle}>Descripción</label>
        <div style={{ fontSize: 11.5, color: "var(--color-muted)", marginBottom: 8 }}>
          Opcional. Explica para qué sirve este tipo de tarjeta.
        </div>
        <textarea
          className="form-input"
          value={basicInfo.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Describe brevemente el propósito de este tipo de tarjeta…"
          rows={4}
          maxLength={1000}
          style={{ resize: "vertical", lineHeight: 1.6 }}
        />
        <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 5, textAlign: "right" }}>
          {basicInfo.description.length}/1000
        </div>
      </div>

      {/* Preview card */}
      {basicInfo.name && (
        <div style={{
          padding: "16px 20px",
          background: "var(--color-primary-light)",
          borderRadius: 12,
          border: "1.5px solid #c7d2fe",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 11,
            background: "linear-gradient(135deg, #4f5bff, #7c3aed)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-heading)",
            fontSize: 20,
            color: "#fff",
            fontWeight: 700,
            flexShrink: 0,
          }}>
            {basicInfo.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-primary)", fontFamily: "var(--font-heading)" }}>
              {basicInfo.name}
            </div>
            {basicInfo.description && (
              <div style={{ fontSize: 12, color: "#6366f1", marginTop: 2 }}>
                {basicInfo.description}
              </div>
            )}
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

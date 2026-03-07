"use client";

import { useState } from "react";
import { updateTenantSettingsAction } from "@/lib/actions/tenants";
import type { ScanMode } from "@/lib/dal/types";

interface SettingsClientProps {
  initialScanMode: ScanMode;
}

const SCAN_MODE_OPTIONS: { value: ScanMode; label: string; description: string }[] = [
  {
    value: "camera",
    label: "Cámara",
    description: "Solo cámara del dispositivo (QR / código de barras)",
  },
  {
    value: "external_reader",
    label: "Lector externo",
    description: "Solo lector HID conectado por USB o Bluetooth",
  },
  {
    value: "both",
    label: "Ambos",
    description: "Cámara y lector externo disponibles",
  },
];

export default function SettingsClient({ initialScanMode }: SettingsClientProps) {
  const [scanMode, setScanMode] = useState<ScanMode>(initialScanMode);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError("");

    const res = await updateTenantSettingsAction({ scanMode });

    setSaving(false);
    if (res.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setError(res.error ?? "Error al guardar");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 520 }}>
      {/* Scan mode */}
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          border: "1px solid var(--color-border)",
          padding: 24,
        }}
      >
        <h2
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "var(--color-dark)",
            margin: "0 0 4px",
            fontFamily: "var(--font-heading)",
          }}
        >
          Modo de escaneo
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--color-muted)",
            margin: "0 0 18px",
          }}
        >
          Define cómo los operadores pueden buscar y escanear carnets.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {SCAN_MODE_OPTIONS.map((opt) => {
            const selected = scanMode === opt.value;
            return (
              <label
                key={opt.value}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: `2px solid ${selected ? "var(--color-primary)" : "var(--color-border)"}`,
                  background: selected ? "#e0e7ff" : "#fff",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <input
                  type="radio"
                  name="scanMode"
                  value={opt.value}
                  checked={selected}
                  onChange={() => setScanMode(opt.value)}
                  style={{ marginTop: 2 }}
                />
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: selected
                        ? "var(--color-primary)"
                        : "var(--color-dark)",
                    }}
                  >
                    {opt.label}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--color-muted)",
                      marginTop: 2,
                    }}
                  >
                    {opt.description}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {/* Save button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 18,
          }}
        >
          <button
            onClick={handleSave}
            disabled={saving || scanMode === initialScanMode}
            style={{
              padding: "10px 24px",
              borderRadius: 8,
              background: "var(--color-primary)",
              color: "#fff",
              border: "none",
              cursor:
                saving || scanMode === initialScanMode ? "default" : "pointer",
              fontSize: 14,
              fontWeight: 600,
              opacity: saving || scanMode === initialScanMode ? 0.5 : 1,
            }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>

          {saved && (
            <span style={{ fontSize: 13, color: "#166534", fontWeight: 600 }}>
              ✓ Guardado
            </span>
          )}
          {error && (
            <span style={{ fontSize: 13, color: "#991b1b" }}>{error}</span>
          )}
        </div>
      </div>
    </div>
  );
}

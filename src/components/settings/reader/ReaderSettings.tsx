"use client";

/**
 * ReaderSettings
 *
 * Client component for the /settings/reader sub-page.
 * Allows the master to configure the scan mode used across the tenant:
 *   - camera         — device camera only (QR / barcode)
 *   - external_reader — HID reader via USB or Bluetooth
 *   - both           — both methods available simultaneously
 *
 * Migrated from the former SettingsClient component in /settings.
 */

import { useState } from "react";
import { Save } from "lucide-react";
import { updateTenantSettingsAction } from "@/lib/actions/tenants";
import SettingsSection from "@/components/settings/SettingsSection";
import SettingsCard from "@/components/settings/SettingsCard";
import type { ScanMode } from "@/lib/dal/types";

// ─── Scan mode options ────────────────────────────────────────────────────────

const SCAN_MODE_OPTIONS: {
  value: ScanMode;
  label: string;
  description: string;
}[] = [
  {
    value: "camera",
    label: "Cámara",
    description: "Solo cámara del dispositivo (QR / código de barras).",
  },
  {
    value: "external_reader",
    label: "Lector externo",
    description: "Solo lector HID conectado por USB o Bluetooth.",
  },
  {
    value: "both",
    label: "Ambos",
    description: "Cámara y lector externo disponibles simultáneamente.",
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface ReaderSettingsProps {
  initialScanMode: ScanMode;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReaderSettings({ initialScanMode }: ReaderSettingsProps) {
  const [scanMode, setScanMode] = useState<ScanMode>(initialScanMode);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);

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
    <SettingsSection
      title="Lector de escaneo"
      description="Configura cómo se escanean los carnets en tu organización."
    >
      <SettingsCard
        title="Método de escaneo"
        description="Define qué métodos de lectura pueden usar los operadores."
        footer={
          <>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || scanMode === initialScanMode}
            >
              <Save size={14} strokeWidth={2} />
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            {saved && (
              <span style={{ fontSize: 12.5, color: "#16a34a", fontWeight: 600 }}>
                ✓ Guardado
              </span>
            )}
            {error && (
              <span style={{ fontSize: 12.5, color: "#dc2626" }}>{error}</span>
            )}
          </>
        }
      >
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
                  background: selected ? "var(--color-primary-light)" : "#fff",
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
                  style={{ marginTop: 2, accentColor: "var(--color-primary)" }}
                />
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: selected ? "var(--color-primary)" : "var(--color-dark)",
                    }}
                  >
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--color-muted)", marginTop: 2 }}>
                    {opt.description}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </SettingsCard>
    </SettingsSection>
  );
}

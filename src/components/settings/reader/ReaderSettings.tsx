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
import { Save, Check } from "lucide-react";
import { updateTenantSettingsAction } from "@/lib/actions/tenants";
import SettingsSection from "@/components/settings/SettingsSection";
import SettingsCard from "@/components/settings/SettingsCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScanMode } from "@/lib/dal/types";

const TEXT = {
  SECTION_TITLE: "Lector de escaneo",
  SECTION_SUB:   "Configura cómo se escanean los carnets en tu organización.",
  CARD_TITLE:    "Método de escaneo",
  CARD_SUB:      "Define qué métodos de lectura pueden usar los operadores.",
  SAVING:        "Guardando…",
  SAVE:          "Guardar cambios",
  SAVED:         "Guardado",
  ERROR:         "Error al guardar",
} as const;

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
      setError(res.error ?? TEXT.ERROR);
    }
  }

  return (
    <SettingsSection
      title={TEXT.SECTION_TITLE}
      description={TEXT.SECTION_SUB}
    >
      <SettingsCard
        title={TEXT.CARD_TITLE}
        description={TEXT.CARD_SUB}
        footer={
          <>
            <Button
              onClick={handleSave}
              disabled={saving || scanMode === initialScanMode}
            >
              <Save strokeWidth={2} />
              {saving ? TEXT.SAVING : TEXT.SAVE}
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <Check className="size-3.5" strokeWidth={2.5} />
                {TEXT.SAVED}
              </span>
            )}
            {error && (
              <span className="text-xs text-destructive">{error}</span>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-2.5">
          {SCAN_MODE_OPTIONS.map((opt) => {
            const selected = scanMode === opt.value;
            return (
              <label
                key={opt.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[10px] border-2 px-3.5 py-3 transition-colors",
                  selected ? "border-primary bg-accent" : "border-border bg-card",
                )}
              >
                <input
                  type="radio"
                  name="scanMode"
                  value={opt.value}
                  checked={selected}
                  onChange={() => setScanMode(opt.value)}
                  className="mt-0.5 size-4 accent-primary"
                />
                <div>
                  <div className={cn("text-sm font-semibold", selected ? "text-primary" : "text-foreground")}>
                    {opt.label}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
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

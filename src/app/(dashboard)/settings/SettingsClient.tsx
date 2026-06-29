"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { updateTenantSettingsAction } from "@/lib/actions/tenants";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScanMode } from "@/lib/dal/types";

const TEXT = {
  TITLE:    "Modo de escaneo",
  SUBTITLE: "Define cómo los operadores pueden buscar y escanear carnets.",
  SAVING:   "Guardando...",
  SAVE:     "Guardar",
  SAVED:    "Guardado",
  ERROR:    "Error al guardar",
} as const;

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
      setError(res.error ?? TEXT.ERROR);
    }
  }

  return (
    <div className="flex max-w-[520px] flex-col gap-6">
      {/* Scan mode */}
      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-1 font-heading text-[15px] font-bold text-foreground">
          {TEXT.TITLE}
        </h2>
        <p className="mb-4.5 text-sm text-muted-foreground">{TEXT.SUBTITLE}</p>

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
                  <div className={cn("text-sm font-bold", selected ? "text-primary" : "text-foreground")}>
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

        {/* Save button */}
        <div className="mt-4.5 flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={saving || scanMode === initialScanMode}
          >
            {saving ? TEXT.SAVING : TEXT.SAVE}
          </Button>

          {saved && (
            <span className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
              <Check className="size-3.5" strokeWidth={2.5} />
              {TEXT.SAVED}
            </span>
          )}
          {error && (
            <span className="text-sm text-destructive">{error}</span>
          )}
        </div>
      </div>
    </div>
  );
}

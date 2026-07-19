"use client";

/**
 * RetentionSettings
 *
 * Client component for the /settings/retention sub-page. Lets the master set the
 * trash retention window (`tenants.archive_retention_days`, range 1–365): how
 * long an archived card / card type stays recoverable before the daily purge job
 * deletes it permanently.
 *
 * Validation runs on the client (bounds passed as props) for immediate feedback,
 * and again on the server via `updateTenantSettingsAction` (source of truth).
 */

import { useState } from "react";
import { Save, Check } from "lucide-react";
import { updateTenantSettingsAction } from "@/lib/actions/tenants";
import SettingsSection from "@/components/settings/SettingsSection";
import SettingsCard from "@/components/settings/SettingsCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TEXT = {
  SECTION_TITLE: "Retención de la papelera",
  SECTION_SUB:
    "Controla cuánto tiempo se conservan los elementos archivados antes de borrarse definitivamente.",
  CARD_TITLE: "Días de retención",
  CARD_SUB:
    "Los carnets y tipos de carnet archivados permanecen en la papelera y pueden restaurarse durante este periodo. Al cumplirse, se eliminan de forma permanente y no se pueden recuperar.",
  FIELD_LABEL: "Días en la papelera",
  UNIT: "días",
  SAVING: "Guardando…",
  SAVE: "Guardar cambios",
  SAVED: "Guardado",
  ERROR: "Error al guardar",
} as const;

/** Effect sentence shown live under the field, reflecting the entered value. */
function effectText(days: number): string {
  const noun = days === 1 ? "día" : "días";
  return `Los elementos en la papelera se borran definitivamente a los ${days} ${noun} de archivarse.`;
}

/** Validation hint shown when the entered value is out of range. */
function rangeHint(min: number, max: number): string {
  return `Introduce un número entero entre ${min} y ${max}.`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface RetentionSettingsProps {
  /** Current tenant retention window, in days. */
  initialRetentionDays: number;
  /** Minimum accepted value (from the schema). */
  minDays: number;
  /** Maximum accepted value (from the schema). */
  maxDays: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RetentionSettings({
  initialRetentionDays,
  minDays,
  maxDays,
}: RetentionSettingsProps) {
  // Kept as a string so the field can be cleared / typed freely.
  const [value, setValue] = useState<string>(String(initialRetentionDays));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(value);
  const isValid =
    value.trim() !== "" &&
    Number.isInteger(parsed) &&
    parsed >= minDays &&
    parsed <= maxDays;
  const changed = parsed !== initialRetentionDays;

  async function handleSave() {
    if (!isValid) return;
    setSaving(true);
    setSaved(false);
    setError(null);

    const res = await updateTenantSettingsAction({ archiveRetentionDays: parsed });

    setSaving(false);
    if (res.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setError(res.error ?? TEXT.ERROR);
    }
  }

  return (
    <SettingsSection title={TEXT.SECTION_TITLE} description={TEXT.SECTION_SUB}>
      <SettingsCard
        title={TEXT.CARD_TITLE}
        description={TEXT.CARD_SUB}
        footer={
          <>
            <Button onClick={handleSave} disabled={saving || !isValid || !changed}>
              <Save strokeWidth={2} />
              {saving ? TEXT.SAVING : TEXT.SAVE}
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <Check className="size-3.5" strokeWidth={2.5} />
                {TEXT.SAVED}
              </span>
            )}
            {error && <span className="text-xs text-destructive">{error}</span>}
          </>
        }
      >
        <div className="flex flex-col gap-2.5">
          <Label htmlFor="retention-days" className="text-sm font-semibold">
            {TEXT.FIELD_LABEL}
          </Label>

          <div className="flex items-center gap-2.5">
            <Input
              id="retention-days"
              type="number"
              inputMode="numeric"
              min={minDays}
              max={maxDays}
              step={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={!isValid}
              className="w-28"
            />
            <span className="text-sm text-muted-foreground">{TEXT.UNIT}</span>
          </div>

          {isValid ? (
            <p className="text-xs text-muted-foreground">{effectText(parsed)}</p>
          ) : (
            <p className="text-xs text-destructive">
              {rangeHint(minDays, maxDays)}
            </p>
          )}
        </div>
      </SettingsCard>
    </SettingsSection>
  );
}

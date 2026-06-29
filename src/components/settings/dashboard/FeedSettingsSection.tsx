"use client";

/**
 * FeedSettingsSection
 *
 * Controls what appears in the operational activity feed and override behaviour:
 *   - feedLimit:              max number of entries shown
 *   - showScanEntries:        include scan-only log entries
 *   - showActionEntries:      include action execution entries
 *   - allowOverrideOnError:   operators may execute actions despite validation errors
 *                             (requires confirmation modal — every override is audited)
 */

import { useState, useTransition } from "react";
import { Save, Check } from "lucide-react";
import { upsertDashboardSettingsAction } from "@/lib/actions/dashboard-settings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { DashboardSettings } from "@/lib/dal";

const TEXT = {
  TITLE:    "Feed de actividad",
  SUBTITLE: "Configura qué entradas aparecen en el feed del panel operacional.",
  LIMIT_LABEL: "Número de entradas a mostrar",
  LIMIT_HINT:  "Entre 5 y 100. Las entradas más recientes aparecerán primero.",
  SCAN_TITLE:  "Mostrar escaneos sin acción",
  SCAN_DESC:   'Incluir entradas de tipo "escaneado" (sin modificación de campos).',
  ACTION_TITLE: "Mostrar acciones ejecutadas",
  ACTION_DESC: "Incluir entradas cuando se ejecuta una acción (incremento, marcar, etc.).",
  OVERRIDE_TITLE: "Permitir intervención del operador con errores de validación",
  OVERRIDE_DESC:
    "Cuando está activo, los operadores pueden ejecutar acciones aunque haya errores de validación — previa confirmación manual. Cada intervención queda registrada en el historial de actividad.",
  SAVING:   "Guardando…",
  SAVE:     "Guardar",
  SAVED:    "Guardado",
} as const;

interface FeedSettingsSectionProps {
  settings: DashboardSettings | null;
}

const DEFAULT_FEED_LIMIT = 20;

/** Toggle row with a checkbox; selected state uses brand-accent (not state tokens). */
function ToggleCard({
  checked,
  onChange,
  title,
  desc,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  desc: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[10px] border px-3.5 py-3 transition-colors",
        checked ? "border-primary/30 bg-accent" : "border-border bg-muted/40",
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(c) => onChange(c === true)}
        className="mt-0.5"
      />
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
      </div>
    </label>
  );
}

export default function FeedSettingsSection({ settings }: FeedSettingsSectionProps) {
  const [feedLimit, setFeedLimit] = useState(settings?.feedLimit ?? DEFAULT_FEED_LIMIT);
  const [showScan, setShowScan] = useState(settings?.showScanEntries ?? true);
  const [showAction, setShowAction] = useState(settings?.showActionEntries ?? true);
  const [allowOverride, setAllowOverride] = useState(settings?.allowOverrideOnError ?? false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await upsertDashboardSettingsAction({
        feedLimit,
        showScanEntries: showScan,
        showActionEntries: showAction,
        allowOverrideOnError: allowOverride,
      });
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <section className="rounded-xl border bg-card p-6">
      <div className="mb-5">
        <div className="font-heading text-[15px] font-bold text-foreground">
          {TEXT.TITLE}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">{TEXT.SUBTITLE}</div>
      </div>

      <div className="flex flex-col gap-4.5">
        {/* Feed limit */}
        <div>
          <Label htmlFor="feed-limit" className="block text-sm font-semibold text-foreground">
            {TEXT.LIMIT_LABEL}
          </Label>
          <Input
            id="feed-limit"
            type="number"
            min={5}
            max={100}
            value={feedLimit}
            onChange={(e) => setFeedLimit(Number(e.target.value))}
            className="mt-1.5 max-w-30"
          />
          <div className="mt-1 text-xs text-muted-foreground">{TEXT.LIMIT_HINT}</div>
        </div>

        <ToggleCard checked={showScan} onChange={setShowScan} title={TEXT.SCAN_TITLE} desc={TEXT.SCAN_DESC} />
        <ToggleCard checked={showAction} onChange={setShowAction} title={TEXT.ACTION_TITLE} desc={TEXT.ACTION_DESC} />
        <ToggleCard checked={allowOverride} onChange={setAllowOverride} title={TEXT.OVERRIDE_TITLE} desc={TEXT.OVERRIDE_DESC} />
      </div>

      {/* Footer */}
      <div className="mt-5 flex items-center gap-3 border-t pt-4.5">
        <Button onClick={handleSave} disabled={isPending}>
          <Save strokeWidth={2} />
          {isPending ? TEXT.SAVING : TEXT.SAVE}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            <Check className="size-3.5" strokeWidth={2.5} />
            {TEXT.SAVED}
          </span>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </section>
  );
}

"use client";

/**
 * SummaryFieldsSection
 *
 * Per-card-type configuration of which fields are shown inline on
 * activity feed entries (up to 3 fields per card type).
 *
 * Each card type has its own independent ordered list of summary fields.
 * Changes are saved immediately on submit (one server action call per card type).
 */

import { useState, useTransition } from "react";
import { Save, Check, ChevronDown, ChevronUp } from "lucide-react";
import { setCardTypeSummaryFieldsAction } from "@/lib/actions/dashboard-settings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { CardType, FieldDefinition, CardTypeSummaryField } from "@/lib/dal";

const TEXT = {
  TITLE:    "Campos de resumen por tipo de tarjeta",
  EMPTY:    "No hay tipos de tarjeta activos.",
  NO_FIELDS: "Este tipo de tarjeta no tiene campos activos.",
  NO_SUMMARY: "Sin campos de resumen configurados",
  SHOWING:  "Mostrando:",
  SAVING:   "Guardando…",
  SAVE:     "Guardar",
  SAVED:    "Guardado",
  SELECTED: "campos seleccionados",
} as const;

interface SummaryFieldsSectionProps {
  cardTypes: CardType[];
  /** Active field definitions keyed by cardTypeId. */
  fieldsByCardType: Record<string, FieldDefinition[]>;
  /** Current summary field config keyed by cardTypeId. */
  summaryByCardType: Record<string, CardTypeSummaryField[]>;
}

const MAX_SUMMARY_FIELDS = 3;

export default function SummaryFieldsSection({
  cardTypes,
  fieldsByCardType,
  summaryByCardType,
}: SummaryFieldsSectionProps) {
  return (
    <section className="rounded-xl border bg-card p-6">
      <div className="mb-5">
        <div className="font-heading text-[15px] font-bold text-foreground">
          {TEXT.TITLE}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          Selecciona hasta {MAX_SUMMARY_FIELDS} campos de cada tipo que se mostrarán en el feed
          para identificar rápidamente las tarjetas.
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {cardTypes.map((ct) => (
          <CardTypeSummaryEditor
            key={ct.id}
            cardType={ct}
            fields={fieldsByCardType[ct.id] ?? []}
            currentSummary={summaryByCardType[ct.id] ?? []}
          />
        ))}
        {cardTypes.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {TEXT.EMPTY}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Per-card-type editor ─────────────────────────────────────────────────────

interface CardTypeSummaryEditorProps {
  cardType: CardType;
  fields: FieldDefinition[];
  currentSummary: CardTypeSummaryField[];
}

function CardTypeSummaryEditor({ cardType, fields, currentSummary }: CardTypeSummaryEditorProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(
    currentSummary.sort((a, b) => a.position - b.position).map((s) => s.fieldDefinitionId),
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleField(fieldId: string) {
    setSelected((prev) => {
      if (prev.includes(fieldId)) return prev.filter((id) => id !== fieldId);
      if (prev.length >= MAX_SUMMARY_FIELDS) return prev; // max reached
      return [...prev, fieldId];
    });
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setCardTypeSummaryFieldsAction(cardType.id, { fieldDefinitionIds: selected });
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.error);
      }
    });
  }

  const selectedNames = selected
    .map((id) => fields.find((f) => f.id === id)?.label ?? id)
    .join(", ");

  return (
    <div className="overflow-hidden rounded-xl border">
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between px-4 py-3.5 text-left",
          open ? "bg-muted/40" : "bg-card",
        )}
      >
        <div>
          <div className="text-sm font-semibold text-foreground">
            {cardType.name}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {selected.length === 0
              ? TEXT.NO_SUMMARY
              : `${TEXT.SHOWING} ${selectedNames}`}
          </div>
        </div>
        {open
          ? <ChevronUp className="size-4 text-muted-foreground" strokeWidth={2} />
          : <ChevronDown className="size-4 text-muted-foreground" strokeWidth={2} />
        }
      </button>

      {/* Field checkboxes */}
      {open && (
        <div className="border-t p-4">
          {fields.length === 0 ? (
            <div className="text-sm text-muted-foreground">{TEXT.NO_FIELDS}</div>
          ) : (
            <div className="mb-4 flex flex-col gap-2">
              {fields.map((f) => {
                const isSelected = selected.includes(f.id);
                const isDisabled = !isSelected && selected.length >= MAX_SUMMARY_FIELDS;
                return (
                  <label
                    key={f.id}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
                      isSelected ? "border-primary/30 bg-accent" : "border-border bg-muted/40",
                      isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={isDisabled}
                      onCheckedChange={() => toggleField(f.id)}
                    />
                    <div>
                      <span className="text-sm font-semibold text-foreground">
                        {f.label}
                      </span>
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({f.fieldType})
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {/* Save row */}
          <div className="flex items-center gap-2.5">
            <Button
              onClick={handleSave}
              disabled={isPending || fields.length === 0}
            >
              <Save strokeWidth={2} />
              {isPending ? TEXT.SAVING : TEXT.SAVE}
            </Button>
            <span className="text-xs text-muted-foreground">
              {selected.length}/{MAX_SUMMARY_FIELDS} {TEXT.SELECTED}
            </span>
            {saved && (
              <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <Check className="size-3.5" strokeWidth={2.5} />
                {TEXT.SAVED}
              </span>
            )}
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

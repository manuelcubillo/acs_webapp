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
import { Save, ChevronDown, ChevronUp } from "lucide-react";
import { setCardTypeSummaryFieldsAction } from "@/lib/actions/dashboard-settings";
import type { CardType, FieldDefinition, CardTypeSummaryField } from "@/lib/dal";

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
    <section style={{
      background: "#fff",
      border: "1.5px solid var(--color-border)",
      borderRadius: 14,
      padding: "24px",
    }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}>
          Campos de resumen por tipo de tarjeta
        </div>
        <div style={{ fontSize: 13, color: "var(--color-secondary)", marginTop: 4 }}>
          Selecciona hasta {MAX_SUMMARY_FIELDS} campos de cada tipo que se mostrarán en el feed
          para identificar rápidamente las tarjetas.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {cardTypes.map((ct) => (
          <CardTypeSummaryEditor
            key={ct.id}
            cardType={ct}
            fields={fieldsByCardType[ct.id] ?? []}
            currentSummary={summaryByCardType[ct.id] ?? []}
          />
        ))}
        {cardTypes.length === 0 && (
          <div style={{ fontSize: 13.5, color: "var(--color-muted)", textAlign: "center", padding: "24px 0" }}>
            No hay tipos de tarjeta activos.
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
    <div style={{
      border: "1.5px solid var(--color-border)",
      borderRadius: 12,
      overflow: "hidden",
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", padding: "14px 16px",
          background: open ? "#fafbfc" : "#fff",
          border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-dark)" }}>
            {cardType.name}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 2 }}>
            {selected.length === 0
              ? "Sin campos de resumen configurados"
              : `Mostrando: ${selectedNames}`}
          </div>
        </div>
        {open
          ? <ChevronUp size={16} strokeWidth={2} color="var(--color-muted)" />
          : <ChevronDown size={16} strokeWidth={2} color="var(--color-muted)" />
        }
      </button>

      {/* Field checkboxes */}
      {open && (
        <div style={{ padding: "16px", borderTop: "1px solid var(--color-border-soft)" }}>
          {fields.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--color-muted)" }}>
              Este tipo de tarjeta no tiene campos activos.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {fields.map((f) => {
                const isSelected = selected.includes(f.id);
                const isDisabled = !isSelected && selected.length >= MAX_SUMMARY_FIELDS;
                return (
                  <label
                    key={f.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 12px",
                      background: isSelected ? "#eef0ff" : "#f8f9fa",
                      border: `1.5px solid ${isSelected ? "#c7d2fe" : "var(--color-border)"}`,
                      borderRadius: 8,
                      cursor: isDisabled ? "not-allowed" : "pointer",
                      opacity: isDisabled ? 0.5 : 1,
                      transition: "all 0.15s",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => toggleField(f.id)}
                      style={{ accentColor: "#4f5bff", flexShrink: 0 }}
                    />
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}>
                        {f.label}
                      </span>
                      <span style={{ fontSize: 11.5, color: "var(--color-muted)", marginLeft: 6 }}>
                        ({f.fieldType})
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {/* Save row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={isPending || fields.length === 0}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Save size={13} strokeWidth={2} />
              {isPending ? "Guardando…" : "Guardar"}
            </button>
            <span style={{ fontSize: 12, color: "var(--color-muted)" }}>
              {selected.length}/{MAX_SUMMARY_FIELDS} campos seleccionados
            </span>
            {saved && <span style={{ fontSize: 12.5, color: "#16a34a", fontWeight: 600 }}>✓ Guardado</span>}
            {error && <span style={{ fontSize: 12.5, color: "#dc2626" }}>{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

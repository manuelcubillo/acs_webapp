"use client";

/**
 * ActiveCardFieldsSection
 *
 * Per-card-type layout of the "last scanned card" panel (ActiveCardZone) on the
 * operator dashboard: a 3×3 grid of up to 9 cells, each holding one field of the
 * card type. A `photo` field can be toggled to occupy two rows.
 *
 * Distinct from SummaryFieldsSection, which configures the ACTIVITY FEED. The
 * two surfaces are stored separately and never influence each other — see ADR
 * 2026-08-04-active-card-summary-grid.md.
 *
 * ── Why per-cell selects instead of drag & drop ──────────────────────────────
 * The card-type wizard reorders fields with @dnd-kit, but that is a 1-D list:
 * drag position maps directly onto list index. This grid is 2-D and its cells
 * have variable height (a two-row photo covers two of them), so dragging would
 * need cross-axis collision handling plus span-aware drop targets — a lot of
 * custom interaction to reimplement what a labelled <Select> per cell already
 * does. The select route is keyboard-operable and screen-reader correct out of
 * the box via the Radix primitive, which matters more here: this is a rarely
 * touched configuration screen, not a high-frequency editing surface.
 *
 * Validation mirrors the Server Action exactly (both call
 * `validateActiveZoneLayout`), so the UI can keep invalid layouts unreachable
 * while the backend stays authoritative.
 */

import { useMemo, useState, useTransition } from "react";
import { Save, Check, ChevronDown, ChevronUp, Image as ImageIcon } from "lucide-react";

import { setCardTypeActiveZoneFieldsAction } from "@/lib/actions/dashboard-settings";
import {
  ACTIVE_ZONE_CELL_COUNT,
  ACTIVE_ZONE_POSITIONS,
  MAX_SPANNING_POSITION,
  buildOccupancyMap,
  canSpanTwoRows,
  occupiedCells,
  validateActiveZoneLayout,
  type ActiveZoneLayoutCell,
} from "@/lib/dashboard/active-zone-layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { CardType, FieldDefinition, CardTypeActiveZoneField } from "@/lib/dal";

// ─── Text constants ─────────────────────────────────────────────────────────

const TEXT = {
  TITLE: "Campos del último carnet escaneado",
  SUBTITLE:
    "Coloca hasta 9 campos en la cuadrícula que se muestra al escanear un carnet. Cada tipo de carnet tiene su propia disposición.",
  UNCONFIGURED_HINT:
    "Sin celdas asignadas se mantiene el comportamiento actual: se muestran los primeros campos con valor.",
  EMPTY: "No hay tipos de carnet activos.",
  NO_FIELDS: "Este tipo de carnet no tiene campos activos.",
  NO_LAYOUT: "Sin disposición configurada",
  CELL_EMPTY: "Vacía",
  CELL_PLACEHOLDER: "Vacía",
  CELL_LABEL: "Celda",
  RESERVED: "Ocupada por la foto superior",
  SPAN_TOGGLE: "Ocupar dos filas",
  SPAN_UNAVAILABLE_LAST_ROW: "No disponible en la última fila",
  SPAN_UNAVAILABLE_TAKEN: "Libera la celda inferior para activarlo",
  FIELDS_COUNT: "campos",
  CELLS_USED: "celdas ocupadas",
  SAVING: "Guardando…",
  SAVE: "Guardar",
  SAVED: "Guardado",
} as const;

/** Radix Select forbids an empty-string value, so "no field" needs a sentinel. */
const EMPTY_VALUE = "__empty__";

// ─── Section ────────────────────────────────────────────────────────────────

interface ActiveCardFieldsSectionProps {
  cardTypes: CardType[];
  /** Active field definitions keyed by cardTypeId. Includes photo fields. */
  fieldsByCardType: Record<string, FieldDefinition[]>;
  /** Currently stored grid layout keyed by cardTypeId. */
  activeZoneByCardType: Record<string, CardTypeActiveZoneField[]>;
}

export default function ActiveCardFieldsSection({
  cardTypes,
  fieldsByCardType,
  activeZoneByCardType,
}: ActiveCardFieldsSectionProps) {
  return (
    <section className="rounded-xl border bg-card p-6">
      <div className="mb-5">
        <div className="font-heading text-[15px] font-bold text-foreground">
          {TEXT.TITLE}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">{TEXT.SUBTITLE}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {TEXT.UNCONFIGURED_HINT}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {cardTypes.map((ct) => (
          <CardTypeGridEditor
            key={ct.id}
            cardType={ct}
            fields={fieldsByCardType[ct.id] ?? []}
            currentLayout={activeZoneByCardType[ct.id] ?? []}
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

// ─── Per-card-type grid editor ──────────────────────────────────────────────

interface CardTypeGridEditorProps {
  cardType: CardType;
  fields: FieldDefinition[];
  currentLayout: CardTypeActiveZoneField[];
}

function CardTypeGridEditor({
  cardType,
  fields,
  currentLayout,
}: CardTypeGridEditorProps) {
  const [open, setOpen] = useState(false);
  const [cells, setCells] = useState<ActiveZoneLayoutCell[]>(() =>
    currentLayout.map((row) => ({
      fieldDefinitionId: row.fieldDefinitionId,
      position: row.position,
      // Stored as smallint; narrow it to the union the layout rules expect.
      rowSpan: row.rowSpan === 2 ? 2 : 1,
    })),
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const fieldById = useMemo(
    () => new Map(fields.map((f) => [f.id, f])),
    [fields],
  );
  const occupancy = useMemo(() => buildOccupancyMap(cells), [cells]);
  const cellsUsed = useMemo(
    () => cells.reduce((sum, c) => sum + occupiedCells(c).length, 0),
    [cells],
  );

  /**
   * Assign a field to a cell, or clear it when `fieldId` is null.
   *
   * A field may appear only once in the grid, so assigning one that already sits
   * elsewhere MOVES it rather than duplicating it. Any placement is reset to a
   * single row: a span that was valid in the old cell may not be in the new one,
   * and re-enabling it is one click.
   */
  function assignField(position: number, fieldId: string | null) {
    setError(null);
    setCells((prev) => {
      const next = prev.filter(
        (c) => c.position !== position && c.fieldDefinitionId !== fieldId,
      );
      if (fieldId === null) return sortCells(next);
      return sortCells([...next, { fieldDefinitionId: fieldId, position, rowSpan: 1 }]);
    });
  }

  /** Toggle a photo cell between one and two rows. */
  function toggleSpan(position: number, span: boolean) {
    setError(null);
    setCells((prev) =>
      prev.map((c) =>
        c.position === position ? { ...c, rowSpan: span ? 2 : 1 } : c,
      ),
    );
  }

  function handleSave() {
    setError(null);
    setSaved(false);

    // Re-run the shared rules before the round trip. The editor should never be
    // able to produce an invalid layout, so a failure here is a bug guard, not
    // an expected path — but it reports the same message the server would.
    const layout = validateActiveZoneLayout(cells, (id) =>
      fieldById.get(id)?.fieldType,
    );
    if (!layout.ok) {
      setError(layout.error);
      return;
    }

    startTransition(async () => {
      const result = await setCardTypeActiveZoneFieldsAction(cardType.id, { cells });
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.error);
      }
    });
  }

  const summary =
    cells.length === 0
      ? TEXT.NO_LAYOUT
      : `${cells.length} ${TEXT.FIELDS_COUNT} · ${cellsUsed}/${ACTIVE_ZONE_CELL_COUNT} ${TEXT.CELLS_USED}`;

  return (
    <div className="overflow-hidden rounded-xl border">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between px-4 py-3.5 text-left",
          open ? "bg-muted/40" : "bg-card",
        )}
      >
        <div>
          <div className="text-sm font-semibold text-foreground">{cardType.name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{summary}</div>
        </div>
        {open ? (
          <ChevronUp className="size-4 text-muted-foreground" strokeWidth={2} />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" strokeWidth={2} />
        )}
      </button>

      {open && (
        <div className="border-t p-4">
          {fields.length === 0 ? (
            <div className="text-sm text-muted-foreground">{TEXT.NO_FIELDS}</div>
          ) : (
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {ACTIVE_ZONE_POSITIONS.map((position) => {
                const owner = occupancy.get(position);
                const isReserved = owner !== undefined && owner.position !== position;

                if (isReserved) {
                  return (
                    <ReservedCell
                      key={position}
                      position={position}
                      label={fieldById.get(owner.fieldDefinitionId)?.label ?? ""}
                    />
                  );
                }

                const assigned = owner ?? null;
                const assignedField = assigned
                  ? fieldById.get(assigned.fieldDefinitionId)
                  : undefined;

                // A field already placed in another cell is not offered again;
                // the one in THIS cell stays so the select can show it.
                const takenElsewhere = new Set(
                  cells
                    .filter((c) => c.position !== position)
                    .map((c) => c.fieldDefinitionId),
                );
                const options = fields.filter(
                  (f) => !takenElsewhere.has(f.id) || f.id === assigned?.fieldDefinitionId,
                );

                const isPhoto = assignedField?.fieldType === "photo";
                const spanAllowed = isPhoto && canSpanTwoRows(position, cells);

                return (
                  <GridCell
                    key={position}
                    position={position}
                    options={options}
                    assignedFieldId={assigned?.fieldDefinitionId ?? null}
                    isPhoto={isPhoto}
                    spans={assigned?.rowSpan === 2}
                    spanAllowed={spanAllowed}
                    onAssign={(fieldId) => assignField(position, fieldId)}
                    onToggleSpan={(span) => toggleSpan(position, span)}
                  />
                );
              })}
            </div>
          )}

          {/* Save row */}
          <div className="flex flex-wrap items-center gap-2.5 border-t pt-4">
            <Button onClick={handleSave} disabled={isPending || fields.length === 0}>
              <Save strokeWidth={2} />
              {isPending ? TEXT.SAVING : TEXT.SAVE}
            </Button>
            <span className="text-xs text-muted-foreground">
              {cells.length} {TEXT.FIELDS_COUNT} · {cellsUsed}/{ACTIVE_ZONE_CELL_COUNT}{" "}
              {TEXT.CELLS_USED}
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

/** Keep the layout in reading order so saved rows and the UI agree. */
function sortCells(cells: ActiveZoneLayoutCell[]): ActiveZoneLayoutCell[] {
  return [...cells].sort((a, b) => a.position - b.position);
}

// ─── Single editable cell ───────────────────────────────────────────────────

interface GridCellProps {
  position: number;
  options: FieldDefinition[];
  assignedFieldId: string | null;
  isPhoto: boolean;
  spans: boolean;
  spanAllowed: boolean;
  onAssign: (fieldId: string | null) => void;
  onToggleSpan: (span: boolean) => void;
}

function GridCell({
  position,
  options,
  assignedFieldId,
  isPhoto,
  spans,
  spanAllowed,
  onAssign,
  onToggleSpan,
}: GridCellProps) {
  const selectId = `active-zone-cell-${position}`;
  const switchId = `active-zone-span-${position}`;
  // Cells are 0-indexed internally but numbered from 1 for the operator.
  const cellNumber = position + 1;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-[10px] border px-3 py-2.5 transition-colors",
        assignedFieldId ? "border-primary/30 bg-accent" : "border-border bg-muted/40",
      )}
    >
      <Label htmlFor={selectId} className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {TEXT.CELL_LABEL} {cellNumber}
      </Label>

      <Select
        value={assignedFieldId ?? EMPTY_VALUE}
        onValueChange={(v) => onAssign(v === EMPTY_VALUE ? null : v)}
      >
        <SelectTrigger id={selectId} size="sm" className="w-full">
          <SelectValue placeholder={TEXT.CELL_PLACEHOLDER} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY_VALUE}>{TEXT.CELL_EMPTY}</SelectItem>
          {options.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Two-row span — only meaningful for a photo */}
      {isPhoto && (
        <div className="flex items-start gap-2">
          <Switch
            id={switchId}
            size="sm"
            checked={spans}
            disabled={!spanAllowed && !spans}
            onCheckedChange={onToggleSpan}
            className="mt-0.5"
          />
          <div className="min-w-0">
            <Label htmlFor={switchId} className="text-xs font-medium text-foreground">
              {TEXT.SPAN_TOGGLE}
            </Label>
            {!spanAllowed && !spans && (
              <div className="text-[11px] text-muted-foreground">
                {position > MAX_SPANNING_POSITION
                  ? TEXT.SPAN_UNAVAILABLE_LAST_ROW
                  : TEXT.SPAN_UNAVAILABLE_TAKEN}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cell reserved by the photo above it ────────────────────────────────────

function ReservedCell({ position, label }: { position: number; label: string }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-[10px] border border-dashed border-primary/30 bg-accent/50 px-3 py-2.5"
      aria-label={`${TEXT.CELL_LABEL} ${position + 1}: ${TEXT.RESERVED}`}
    >
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {TEXT.CELL_LABEL} {position + 1}
      </span>
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ImageIcon aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
        <span className="truncate">{label}</span>
      </span>
      <span className="text-[11px] text-muted-foreground">{TEXT.RESERVED}</span>
    </div>
  );
}

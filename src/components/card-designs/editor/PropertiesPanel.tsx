"use client";

/**
 * PropertiesPanel — right panel of the card design editor.
 * Context-aware: shows canvas properties when nothing is selected,
 * or node-specific properties for the selected node.
 */

import { useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  Lock,
  LockOpen,
  Unlock,
  Trash2,
  Copy,
  Link2,
  Unlink,
  Loader2,
} from "lucide-react";
import { listCardTypesAction } from "@/lib/actions/card-types";
import type { CardDesignLayout, LayoutNode, WebSafeFont } from "@/lib/card-designs/types";
import {
  WEB_SAFE_FONTS,
  TEXT_FONT_WEIGHTS,
  resolveFontWeight,
} from "@/lib/card-designs/types";
import {
  EXPORT_DPI,
  MAX_EXPORT_CM,
  MIN_EXPORT_CM,
  clampExportCm,
  cmToPx,
  designAspect,
  heightFromWidthCm,
  roundExportCm,
  widthFromHeightCm,
} from "@/lib/card-designs/export-size";
import type { CommonFieldDefinition, CardTypeWithFields, CardType } from "@/lib/dal";
import { COMPATIBLE_FIELD_TYPES } from "./CardDesignEditor";
import PhotoUploader from "@/components/shared/PhotoUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const LABELS = {
  panelTitle: "Propiedades",
  generalSection: "General",
  descriptionLabel: "Descripción",
  descriptionPlaceholder: "Descripción opcional…",
  canvasSection: "Canvas",
  background: "Fondo",
  safeMargin: "Margen seguro",
  top: "Sup",
  right: "Der",
  bottom: "Inf",
  left: "Izq",
  positionSection: "Posición y tamaño",
  x: "X",
  y: "Y",
  width: "Ancho",
  height: "Alto",
  rotation: "Rotación",
  layerSection: "Capa",
  bringFront: "Al frente",
  bringForward: "Subir",
  sendBackward: "Bajar",
  sendBack: "Al fondo",
  lockNode: "Bloquear",
  unlockNode: "Desbloquear",
  duplicate: "Duplicar",
  delete: "Eliminar",
  styleSection: "Estilo",
  fontFamily: "Fuente",
  fontSize: "Tamaño",
  fontWeight: "Peso",
  weightNormal: "Normal",
  weightBold: "Negrita",
  color: "Color",
  textAlign: "Alineación",
  multiline: "Multilínea",
  overflow: "Desbordamiento",
  contentSection: "Contenido",
  staticValue: "Valor estático",
  imageUpload: "Imagen estática",
  imageMode: "Modo imagen",
  fill: "Relleno",
  stroke: "Borde",
  strokeWidth: "Grosor",
  cornerRadius: "Radio",
  x1: "X1",
  y1: "Y1",
  x2: "X2",
  y2: "Y2",
  exportSizeSection: "Tamaño de exportación",
  exportWidth: "Ancho (cm)",
  exportHeight: "Alto (cm)",
  exportLockOn: "Proporción bloqueada",
  exportLockOff: "Proporción libre",
  exportPixels: (w: number, h: number) =>
    `≈ ${w} × ${h} px @ ${EXPORT_DPI} DPI`,
  exportDesignCm: (w: string, h: string) => `Diseño: ${w} × ${h} cm`,
  exportDesignPx: (w: string, h: string) => `Diseño: ${w} × ${h} px`,
  exportUseDesignSize: "Usar tamaño del diseño",
  exportClear: "Quitar",
  exportEmptyHint:
    "Sin definir: la descarga mantiene el tamaño actual del diseño.",
  noSelection: "Selecciona un elemento para editar sus propiedades.",
  linkedTypesSection: "Tipos de tarjeta",
  noLinkedTypes: "Sin tipos vinculados.",
  linkType: "+ Vincular",
  unlinkType: "Desvincular",
  linkPickerPlaceholder: "Selecciona un tipo…",
  linkConfirm: "Vincular",
  linkCancel: "Cancelar",
  linkError: "Error al vincular.",
  unlinkError: "Error al desvincular.",
  loading: "Cargando…",
  dataSourceSection: "Fuente de datos",
  sourceStatic: "Estático",
  sourceField: "Campo",
  sourceCardCode: "Código",
  fieldSelector: "Campo vinculado",
  fieldSelectorPlaceholder: "Selecciona un campo…",
  cardCodeHint: "Mostrará el código único de la tarjeta.",
  noFieldsHint: "Sin campos. Vincula un tipo de tarjeta al diseño.",
} as const;

// Sentinel for the field-selector "no field" option (Select can't use "").
const NO_FIELD = "__none__";

/**
 * Export size as the panel sees it: the two configurable cm values, the padlock
 * state, and the design's own dimensions (used for the aspect ratio and the
 * footprint hint). Both cm values are null when the design has no configured
 * export size — the inputs then show placeholders, never a prefilled guess, so
 * an untouched design keeps NULL in the DB and its legacy export behaviour.
 */
export interface ExportSizeState {
  widthCm: number | null;
  heightCm: number | null;
  lockAspect: boolean;
  designWidthUnits: number;
  designHeightUnits: number;
  designUnit: "mm" | "px";
}

/** Partial update emitted by the export-size section. */
export interface ExportSizePatch {
  widthCm?: number | null;
  heightCm?: number | null;
  lockAspect?: boolean;
}

/** Segmented-toggle button class (active = brand accent). */
function toggleBtnClass(active: boolean): string {
  return cn(
    "flex-1 rounded-md border px-0 py-1 text-[11px] font-semibold transition-colors",
    active
      ? "border-primary bg-accent text-primary"
      : "border-border bg-card text-muted-foreground hover:bg-muted",
  );
}

interface Props {
  layout: CardDesignLayout;
  selectedNodeId: string | null;
  unit: "mm" | "px";
  availableFields: CommonFieldDefinition[];
  linkedCardTypes: CardTypeWithFields[];
  designId: string;
  /** Design description (editable from the canvas/no-selection view). */
  description: string;
  onDescriptionChange: (value: string) => void;
  /** Physical size of the downloaded PNG (canvas/no-selection view). */
  outputSize: ExportSizeState;
  onOutputSizeChange: (patch: ExportSizePatch) => void;
  /** Object-key → signed URL for static image nodes (read by uploader for previews). */
  staticImageUrls: Record<string, string>;
  /** Called by the uploader to register a fresh signed URL after upload. */
  onRegisterStaticImageUrl: (key: string, url: string) => void;
  onUpdateLayout: (patch: Partial<CardDesignLayout["canvas"]>) => void;
  onUpdateNode: (id: string, patch: Record<string, unknown>) => void;
  onDeleteNode: (id: string) => void;
  onDuplicateNode: (id: string) => void;
  onReorderNode: (
    id: string,
    dir: "front" | "back" | "forward" | "backward",
  ) => void;
  onLink: (cardTypeId: string) => Promise<string | null>;
  onUnlink: (cardTypeId: string) => Promise<string | null>;
}

export default function PropertiesPanel({
  layout,
  selectedNodeId,
  unit,
  availableFields,
  linkedCardTypes,
  designId,
  description,
  onDescriptionChange,
  outputSize,
  onOutputSizeChange,
  staticImageUrls,
  onRegisterStaticImageUrl,
  onUpdateLayout,
  onUpdateNode,
  onDeleteNode,
  onDuplicateNode,
  onReorderNode,
  onLink,
  onUnlink,
}: Props) {
  const selectedNode = selectedNodeId
    ? layout.nodes.find((n) => n.id === selectedNodeId) ?? null
    : null;

  return (
    <div className="flex w-64 shrink-0 flex-col overflow-hidden border-l bg-card">
      {/* Header */}
      <div className="border-b px-4 pt-3.5 pb-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {LABELS.panelTitle}
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-3">
        {!selectedNode ? (
          <CanvasProperties
            canvas={layout.canvas}
            unit={unit}
            linkedCardTypes={linkedCardTypes}
            description={description}
            onDescriptionChange={onDescriptionChange}
            outputSize={outputSize}
            onOutputSizeChange={onOutputSizeChange}
            onUpdate={onUpdateLayout}
            onLink={onLink}
            onUnlink={onUnlink}
          />
        ) : (
          <NodeProperties
            node={selectedNode}
            unit={unit}
            availableFields={availableFields}
            designId={designId}
            staticImageUrls={staticImageUrls}
            onRegisterStaticImageUrl={onRegisterStaticImageUrl}
            onUpdate={(patch) => onUpdateNode(selectedNode.id, patch)}
            onDelete={() => onDeleteNode(selectedNode.id)}
            onDuplicate={() => onDuplicateNode(selectedNode.id)}
            onReorder={(dir) => onReorderNode(selectedNode.id, dir)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Canvas properties ────────────────────────────────────────────────────────

function CanvasProperties({
  canvas,
  unit,
  linkedCardTypes,
  description,
  onDescriptionChange,
  outputSize,
  onOutputSizeChange,
  onUpdate,
  onLink,
  onUnlink,
}: {
  canvas: CardDesignLayout["canvas"];
  unit: string;
  linkedCardTypes: CardTypeWithFields[];
  description: string;
  onDescriptionChange: (value: string) => void;
  outputSize: ExportSizeState;
  onOutputSizeChange: (patch: ExportSizePatch) => void;
  onUpdate: (patch: Partial<CardDesignLayout["canvas"]>) => void;
  onLink: (cardTypeId: string) => Promise<string | null>;
  onUnlink: (cardTypeId: string) => Promise<string | null>;
}) {
  return (
    <>
      <Section title={LABELS.generalSection}>
        <Row label={LABELS.descriptionLabel}>
          <Textarea
            rows={3}
            className="resize-y text-xs"
            placeholder={LABELS.descriptionPlaceholder}
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
          />
        </Row>
      </Section>

      <Section title={LABELS.canvasSection}>
        <Row label={LABELS.background}>
          <ColorInput
            value={canvas.background}
            onChange={(v) => onUpdate({ background: v })}
          />
        </Row>
      </Section>

      <Section title={LABELS.safeMargin}>
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              ["top", LABELS.top],
              ["right", LABELS.right],
              ["bottom", LABELS.bottom],
              ["left", LABELS.left],
            ] as [keyof typeof canvas.safeMargin, string][]
          ).map(([side, label]) => (
            <Row key={side} label={`${label} (${unit})`}>
              <NumberInput
                value={canvas.safeMargin[side]}
                min={0}
                onChange={(v) =>
                  onUpdate({
                    safeMargin: { ...canvas.safeMargin, [side]: v },
                  })
                }
              />
            </Row>
          ))}
        </div>
      </Section>

      <ExportSizeSection state={outputSize} onChange={onOutputSizeChange} />

      <LinkedCardTypesSection
        linkedCardTypes={linkedCardTypes}
        onLink={onLink}
        onUnlink={onUnlink}
      />
    </>
  );
}

// ─── Export size section ──────────────────────────────────────────────────────

/**
 * "Tamaño de exportación" — the physical size of the PNG produced by
 * "Descargar PNG", in centimetres, rasterised at a fixed 300 DPI.
 *
 * Export-only: nothing here touches the canvas, the layout or the on-screen
 * preview. Leaving both fields empty keeps the design on its legacy export size.
 *
 * The padlock links the two values to the design's aspect ratio. Unlocked, the
 * export stretches the artwork to fill the target raster (non-uniform scale) —
 * the accepted trade-off of unlocking.
 */
function ExportSizeSection({
  state,
  onChange,
}: {
  state: ExportSizeState;
  onChange: (patch: ExportSizePatch) => void;
}) {
  const {
    widthCm,
    heightCm,
    lockAspect,
    designWidthUnits,
    designHeightUnits,
    designUnit,
  } = state;

  const aspect = designAspect(designWidthUnits, designHeightUnits);
  const isConfigured = widthCm !== null && heightCm !== null;

  /** Snap a typed value onto the grid the numeric(6,2) column can hold. */
  const normalize = (cm: number) => clampExportCm(roundExportCm(cm));

  function handleWidth(next: number | null) {
    // Both-or-neither: clearing one field clears the other.
    if (next === null) {
      onChange({ widthCm: null, heightCm: null });
      return;
    }
    const w = normalize(next);
    // Locked → recompute the counterpart. Unlocked but still empty → seed it
    // from the aspect ratio so the pair is never half-set; the user is then
    // free to edit it independently.
    const h =
      lockAspect || heightCm === null ? heightFromWidthCm(w, aspect) : heightCm;
    onChange({ widthCm: w, heightCm: h });
  }

  function handleHeight(next: number | null) {
    if (next === null) {
      onChange({ widthCm: null, heightCm: null });
      return;
    }
    const h = normalize(next);
    const w =
      lockAspect || widthCm === null ? widthFromHeightCm(h, aspect) : widthCm;
    onChange({ widthCm: w, heightCm: h });
  }

  function toggleLock() {
    const nextLock = !lockAspect;
    // Re-locking keeps the width authoritative and re-derives the height.
    if (nextLock && widthCm !== null) {
      onChange({ lockAspect: true, heightCm: heightFromWidthCm(widthCm, aspect) });
    } else {
      onChange({ lockAspect: nextLock });
    }
  }

  /** Fill both fields from the design's own mm footprint, padlock on. */
  function useDesignSize() {
    onChange({
      widthCm: normalize(designWidthUnits / 10),
      heightCm: normalize(designHeightUnits / 10),
      lockAspect: true,
    });
  }

  return (
    <Section title={LABELS.exportSizeSection}>
      <div className="flex items-end gap-1.5">
        <div className="flex-1">
          <Row label={LABELS.exportWidth}>
            <CmInput
              value={widthCm}
              placeholder={LABELS.exportWidth}
              onChange={handleWidth}
            />
          </Row>
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={toggleLock}
          title={lockAspect ? LABELS.exportLockOn : LABELS.exportLockOff}
          aria-pressed={lockAspect}
          aria-label={lockAspect ? LABELS.exportLockOn : LABELS.exportLockOff}
          className={cn(
            "mb-0.5 shrink-0",
            lockAspect && "border-primary bg-accent text-primary",
          )}
        >
          {lockAspect ? <Lock strokeWidth={2} /> : <LockOpen strokeWidth={2} />}
        </Button>

        <div className="flex-1">
          <Row label={LABELS.exportHeight}>
            <CmInput
              value={heightCm}
              placeholder={LABELS.exportHeight}
              onChange={handleHeight}
            />
          </Row>
        </div>
      </div>

      {/* Helper captions */}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {isConfigured
          ? LABELS.exportPixels(cmToPx(widthCm), cmToPx(heightCm))
          : LABELS.exportEmptyHint}
      </p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {designUnit === "mm"
          ? LABELS.exportDesignCm(
              formatNumber(designWidthUnits / 10, 2),
              formatNumber(designHeightUnits / 10, 2),
            )
          : LABELS.exportDesignPx(
              formatNumber(designWidthUnits, 2),
              formatNumber(designHeightUnits, 2),
            )}
      </p>

      <div className="mt-0.5 flex gap-1.5">
        {/* Only a mm design has a physical footprint to copy from. */}
        {designUnit === "mm" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={useDesignSize}
            className="flex-1 overflow-hidden px-1.5 text-[10.5px]"
          >
            <span className="truncate">{LABELS.exportUseDesignSize}</span>
          </Button>
        )}
        {isConfigured && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange({ widthCm: null, heightCm: null })}
            className="flex-1 overflow-hidden px-1.5 text-[10.5px]"
          >
            <span className="truncate">{LABELS.exportClear}</span>
          </Button>
        )}
      </div>
    </Section>
  );
}

// ─── Node properties ──────────────────────────────────────────────────────────

function NodeProperties({
  node,
  unit,
  availableFields,
  designId,
  staticImageUrls,
  onRegisterStaticImageUrl,
  onUpdate,
  onDelete,
  onDuplicate,
  onReorder,
}: {
  node: LayoutNode;
  unit: string;
  availableFields: CommonFieldDefinition[];
  designId: string;
  staticImageUrls: Record<string, string>;
  onRegisterStaticImageUrl: (key: string, url: string) => void;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onReorder: (dir: "front" | "back" | "forward" | "backward") => void;
}) {
  const isLine = node.type === "line";

  return (
    <>
      {/* Position & size */}
      <Section title={LABELS.positionSection}>
        {isLine ? (
          <div className="grid grid-cols-2 gap-1.5">
            {(["x1", "y1", "x2", "y2"] as const).map((k) => (
              <Row key={k} label={`${LABELS[k]} (${unit})`}>
                <NumberInput
                  value={(node as { x1: number; y1: number; x2: number; y2: number })[k]}
                  decimals={3}
                  onChange={(v) => onUpdate({ [k]: v })}
                />
              </Row>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <Row label={`${LABELS.x} (${unit})`}>
                <NumberInput
                  value={"x" in node ? node.x : 0}
                  decimals={3}
                  onChange={(v) => onUpdate({ x: v })}
                />
              </Row>
              <Row label={`${LABELS.y} (${unit})`}>
                <NumberInput
                  value={"y" in node ? node.y : 0}
                  decimals={3}
                  onChange={(v) => onUpdate({ y: v })}
                />
              </Row>
              <Row label={`${LABELS.width} (${unit})`}>
                <NumberInput
                  value={"width" in node ? node.width : 0}
                  min={1}
                  decimals={3}
                  onChange={(v) => onUpdate({ width: v })}
                />
              </Row>
              <Row label={`${LABELS.height} (${unit})`}>
                <NumberInput
                  value={"height" in node ? node.height : 0}
                  min={1}
                  decimals={3}
                  onChange={(v) => onUpdate({ height: v })}
                />
              </Row>
            </div>
            <Row label={`${LABELS.rotation} (°)`}>
              <NumberInput
                value={"rotation" in node ? node.rotation : 0}
                min={-360}
                max={360}
                decimals={3}
                onChange={(v) => onUpdate({ rotation: v })}
              />
            </Row>
          </>
        )}
      </Section>

      {/* Layer controls */}
      <Section title={LABELS.layerSection}>
        <div className="grid grid-cols-2 gap-1">
          <IconBtn
            icon={<ChevronsUp strokeWidth={2} />}
            label={LABELS.bringFront}
            onClick={() => onReorder("front")}
          />
          <IconBtn
            icon={<ArrowUp strokeWidth={2} />}
            label={LABELS.bringForward}
            onClick={() => onReorder("forward")}
          />
          <IconBtn
            icon={<ArrowDown strokeWidth={2} />}
            label={LABELS.sendBackward}
            onClick={() => onReorder("backward")}
          />
          <IconBtn
            icon={<ChevronsDown strokeWidth={2} />}
            label={LABELS.sendBack}
            onClick={() => onReorder("back")}
          />
        </div>

        <div className="mt-1.5 flex gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onUpdate({ locked: !node.locked })}
            className={cn(
              "flex-1",
              node.locked && "border-amber-400/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300",
            )}
          >
            {node.locked ? <Lock strokeWidth={2} /> : <Unlock strokeWidth={2} />}
            {node.locked ? LABELS.unlockNode : LABELS.lockNode}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onDuplicate} className="flex-1">
            <Copy strokeWidth={2} />
            {LABELS.duplicate}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 strokeWidth={2} />
            {LABELS.delete}
          </Button>
        </div>
      </Section>

      {/* Data source section for bindable nodes */}
      {(node.type === "text" ||
        node.type === "image" ||
        node.type === "qr" ||
        node.type === "barcode128") && (
        <DataSourceSection
          node={node}
          availableFields={availableFields}
          onUpdate={onUpdate}
        />
      )}

      {/* Type-specific sections */}
      {node.type === "text" && (
        <>
          {node.content.source === "static" && (
          <Section title={LABELS.contentSection}>
            <Row label={LABELS.staticValue}>
              <Textarea
                rows={2}
                className="resize-y text-xs"
                value={node.content.staticValue ?? ""}
                onChange={(e) =>
                  onUpdate({
                    content: { source: "static", staticValue: e.target.value },
                  })
                }
              />
            </Row>
          </Section>
          )}
          <Section title={LABELS.styleSection}>
            <Row label={LABELS.fontFamily}>
              <Select
                value={node.style.fontFamily}
                onValueChange={(v) =>
                  onUpdate({ style: { ...node.style, fontFamily: v as WebSafeFont } })
                }
              >
                <SelectTrigger size="sm" className="w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEB_SAFE_FONTS.map((f) => (
                    // fontFamily preview is functional, kept inline.
                    <SelectItem key={f} value={f} style={{ fontFamily: f }}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <div className="grid grid-cols-2 gap-1.5">
              <Row label={LABELS.fontSize}>
                <NumberInput
                  value={node.style.fontSize}
                  min={6}
                  max={200}
                  onChange={(v) =>
                    onUpdate({ style: { ...node.style, fontSize: v } })
                  }
                />
              </Row>
              <Row label={LABELS.color}>
                <ColorInput
                  value={node.style.color}
                  onChange={(v) =>
                    onUpdate({ style: { ...node.style, color: v } })
                  }
                />
              </Row>
            </div>
            <Row label={LABELS.fontWeight}>
              <div className="flex gap-1">
                {TEXT_FONT_WEIGHTS.map((weight) => (
                  <button
                    key={weight}
                    type="button"
                    onClick={() =>
                      onUpdate({ style: { ...node.style, fontWeight: weight } })
                    }
                    className={toggleBtnClass(
                      resolveFontWeight(node.style) === weight,
                    )}
                  >
                    {weight === "bold"
                      ? LABELS.weightBold
                      : LABELS.weightNormal}
                  </button>
                ))}
              </div>
            </Row>
            <Row label={LABELS.textAlign}>
              <div className="flex gap-1">
                {(["left", "center", "right"] as const).map((align) => (
                  <button
                    key={align}
                    type="button"
                    onClick={() => onUpdate({ style: { ...node.style, align } })}
                    className={toggleBtnClass(node.style.align === align)}
                  >
                    {align === "left" ? "⟵" : align === "center" ? "⟺" : "⟶"}
                  </button>
                ))}
              </div>
            </Row>
          </Section>
        </>
      )}

      {node.type === "image" && (
        <Section title={LABELS.contentSection}>
          {node.content.source === "static" && (() => {
            const c = node.content as {
              staticObjectKey?: string;
              staticUrl?: string;
            };
            const key = c.staticObjectKey ?? null;
            const readUrl = key ? staticImageUrls[key] ?? null : c.staticUrl ?? null;
            return (
              <Row label={LABELS.imageUpload}>
                <PhotoUploader
                  kind="card-design-image"
                  ownerId={designId}
                  currentObjectKey={key}
                  currentReadUrl={readUrl}
                  previewSize={96}
                  previewAspect={1}
                  onChange={(v) => {
                    if (v) {
                      onRegisterStaticImageUrl(v.objectKey, v.readUrl);
                      onUpdate({
                        content: {
                          source: "static",
                          staticObjectKey: v.objectKey,
                        },
                      });
                    } else {
                      onUpdate({ content: { source: "static" } });
                    }
                  }}
                />
              </Row>
            );
          })()}
          <Row label={LABELS.imageMode}>
            <div className="flex gap-1">
              {(["fit", "fill"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onUpdate({ mode: m })}
                  className={toggleBtnClass(node.mode === m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </Row>
        </Section>
      )}

      {(node.type === "qr" || node.type === "barcode128") &&
        node.content.source === "static" && (
        <Section title={LABELS.contentSection}>
          <Row label={LABELS.staticValue}>
            <Input
              className="text-xs"
              value={(node.content as { staticValue?: string }).staticValue ?? ""}
              onChange={(e) =>
                onUpdate({
                  content: { source: "static", staticValue: e.target.value },
                })
              }
            />
          </Row>
        </Section>
      )}

      {node.type === "rect" && (
        <Section title={LABELS.styleSection}>
          <div className="grid grid-cols-2 gap-1.5">
            <Row label={LABELS.fill}>
              <ColorInput
                value={node.style.fill}
                onChange={(v) => onUpdate({ style: { ...node.style, fill: v } })}
              />
            </Row>
            <Row label={LABELS.stroke}>
              <ColorInput
                value={node.style.stroke}
                onChange={(v) => onUpdate({ style: { ...node.style, stroke: v } })}
              />
            </Row>
            <Row label={LABELS.strokeWidth}>
              <NumberInput
                value={node.style.strokeWidth}
                min={0}
                onChange={(v) =>
                  onUpdate({ style: { ...node.style, strokeWidth: v } })
                }
              />
            </Row>
            <Row label={LABELS.cornerRadius}>
              <NumberInput
                value={node.style.cornerRadius}
                min={0}
                onChange={(v) =>
                  onUpdate({ style: { ...node.style, cornerRadius: v } })
                }
              />
            </Row>
          </div>
        </Section>
      )}

      {node.type === "line" && (
        <Section title={LABELS.styleSection}>
          <div className="grid grid-cols-2 gap-1.5">
            <Row label={LABELS.stroke}>
              <ColorInput
                value={node.style.stroke}
                onChange={(v) => onUpdate({ style: { ...node.style, stroke: v } })}
              />
            </Row>
            <Row label={LABELS.strokeWidth}>
              <NumberInput
                value={node.style.strokeWidth}
                min={0.5}
                onChange={(v) =>
                  onUpdate({ style: { ...node.style, strokeWidth: v } })
                }
              />
            </Row>
          </div>
        </Section>
      )}
    </>
  );
}

// ─── Linked card types section ────────────────────────────────────────────────

function LinkedCardTypesSection({
  linkedCardTypes,
  onLink,
  onUnlink,
}: {
  linkedCardTypes: CardTypeWithFields[];
  onLink: (cardTypeId: string) => Promise<string | null>;
  onUnlink: (cardTypeId: string) => Promise<string | null>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [availableCardTypes, setAvailableCardTypes] = useState<CardType[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const linkedIds = new Set(linkedCardTypes.map((ct) => ct.id));

  async function openPicker() {
    setPickerOpen(true);
    setPickerLoading(true);
    setSelectedId("");
    setActionError(null);
    const result = await listCardTypesAction();
    if (result.success) {
      setAvailableCardTypes(result.data.filter((ct) => !linkedIds.has(ct.id)));
    }
    setPickerLoading(false);
  }

  async function confirmLink() {
    if (!selectedId) return;
    setPickerLoading(true);
    const err = await onLink(selectedId);
    setPickerLoading(false);
    if (err) {
      setActionError(err);
    } else {
      setPickerOpen(false);
      setSelectedId("");
    }
  }

  async function handleUnlink(cardTypeId: string) {
    setPendingId(cardTypeId);
    const err = await onUnlink(cardTypeId);
    setPendingId(null);
    if (err) setActionError(err);
  }

  return (
    <Section title={LABELS.linkedTypesSection}>
      {actionError && (
        <p className="mb-1.5 text-[11px] text-destructive">{actionError}</p>
      )}

      {linkedCardTypes.length === 0 && !pickerOpen && (
        <p className="mb-1.5 text-[11px] leading-relaxed text-muted-foreground">
          {LABELS.noLinkedTypes}
        </p>
      )}

      {linkedCardTypes.map((ct) => (
        <div
          key={ct.id}
          className="mb-1 flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1.5"
        >
          <Link2 className="size-3 shrink-0 text-primary" strokeWidth={2} />
          <span className="flex-1 truncate text-xs font-medium text-foreground">
            {ct.name}
          </span>
          <button
            type="button"
            onClick={() => void handleUnlink(ct.id)}
            disabled={pendingId === ct.id}
            title={LABELS.unlinkType}
            className="flex shrink-0 items-center p-0.5 text-destructive disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingId === ct.id ? (
              <Loader2 className="size-3 animate-spin" strokeWidth={2} />
            ) : (
              <Unlink className="size-3" strokeWidth={2} />
            )}
          </button>
        </div>
      ))}

      {pickerOpen ? (
        <div className="mt-1 flex flex-col gap-1.5">
          {pickerLoading && !availableCardTypes.length ? (
            <span className="text-[11px] text-muted-foreground">{LABELS.loading}</span>
          ) : (
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger size="sm" className="w-full text-xs">
                <SelectValue placeholder={LABELS.linkPickerPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {availableCardTypes.map((ct) => (
                  <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              onClick={() => void confirmLink()}
              disabled={!selectedId || pickerLoading}
              className="flex-1"
            >
              {pickerLoading ? <Loader2 className="animate-spin" strokeWidth={2} /> : LABELS.linkConfirm}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => { setPickerOpen(false); setActionError(null); }}
              className="flex-1"
            >
              {LABELS.linkCancel}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void openPicker()}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-primary bg-accent px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-accent/70"
        >
          {LABELS.linkType}
        </button>
      )}
    </Section>
  );
}

// ─── Data source section ──────────────────────────────────────────────────────

type BindableNode = Extract<
  LayoutNode,
  { type: "text" | "image" | "qr" | "barcode128" }
>;

function DataSourceSection({
  node,
  availableFields,
  onUpdate,
}: {
  node: BindableNode;
  availableFields: CommonFieldDefinition[];
  onUpdate: (patch: Record<string, unknown>) => void;
}) {
  const nodeType = node.type as "text" | "image" | "qr" | "barcode128";
  const source = node.content.source;
  const supportsCardCode = nodeType !== "image";
  const compatible = availableFields.filter((f) =>
    (COMPATIBLE_FIELD_TYPES[nodeType] as string[]).includes(f.fieldType),
  );

  function setSource(newSource: "static" | "field" | "card_code") {
    if (newSource === source) return;
    if (newSource === "static") {
      onUpdate({
        content:
          nodeType === "image"
            ? { source: "static" }
            : { source: "static", staticValue: "" },
      });
    } else if (newSource === "field") {
      onUpdate({ content: { source: "field", fieldDefinitionId: "" } });
    } else {
      onUpdate({ content: { source: "card_code" } });
    }
  }

  const currentFieldId =
    source === "field" ? (node.content as { fieldDefinitionId: string }).fieldDefinitionId : "";

  return (
    <Section title={LABELS.dataSourceSection}>
      {/* Source toggle */}
      <Row label="">
        <div className="flex gap-1">
          <button type="button" onClick={() => setSource("static")} className={toggleBtnClass(source === "static")}>
            {LABELS.sourceStatic}
          </button>
          <button type="button" onClick={() => setSource("field")} className={toggleBtnClass(source === "field")}>
            {LABELS.sourceField}
          </button>
          {supportsCardCode && (
            <button type="button" onClick={() => setSource("card_code")} className={toggleBtnClass(source === "card_code")}>
              {LABELS.sourceCardCode}
            </button>
          )}
        </div>
      </Row>

      {/* Field selector */}
      {source === "field" && (
        <Row label={LABELS.fieldSelector}>
          {compatible.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">
              {LABELS.noFieldsHint}
            </span>
          ) : (
            <Select
              value={currentFieldId || NO_FIELD}
              onValueChange={(v) =>
                onUpdate({
                  content: { source: "field", fieldDefinitionId: v === NO_FIELD ? "" : v },
                })
              }
            >
              <SelectTrigger size="sm" className="w-full text-xs">
                <SelectValue placeholder={LABELS.fieldSelectorPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_FIELD}>{LABELS.fieldSelectorPlaceholder}</SelectItem>
                {compatible.map((f) => (
                  <SelectItem key={f.fieldDefinitionIds[0]} value={f.fieldDefinitionIds[0]}>
                    {f.label || f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Row>
      )}

      {/* Card code hint */}
      {source === "card_code" && (
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          {LABELS.cardCodeHint}
        </p>
      )}
    </Section>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label && (
        <div className="mb-0.5 text-[11px] font-medium text-muted-foreground">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = "any",
  decimals,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: string | number;
  /** When set, the displayed value is rounded to this many decimal places. */
  decimals?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const display =
    draft !== null
      ? draft
      : decimals !== undefined
      ? formatNumber(value, decimals)
      : String(value);

  return (
    <Input
      type="number"
      className="h-8 text-xs"
      value={display}
      min={min}
      max={max}
      step={step}
      onFocus={() => setDraft(display)}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) onChange(v);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

/**
 * Centimetre input for the export size. Same draft-string typing model as
 * `NumberInput`, but nullable: an empty field means "not configured" and emits
 * `null` rather than a number, which is what keeps the DB column NULL and the
 * design on its legacy export size.
 */
function CmInput({
  value,
  placeholder,
  onChange,
}: {
  value: number | null;
  placeholder: string;
  onChange: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const display =
    draft !== null ? draft : value === null ? "" : formatNumber(value, 2);

  return (
    <Input
      type="number"
      className="h-8 text-xs"
      value={display}
      placeholder={placeholder}
      min={MIN_EXPORT_CM}
      max={MAX_EXPORT_CM}
      step={0.1}
      onFocus={() => setDraft(display)}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw.trim() === "") {
          onChange(null);
          return;
        }
        const v = parseFloat(raw);
        if (!isNaN(v)) onChange(v);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

/**
 * Trim trailing zeros after rounding to `decimals` places.
 * 5 → "5", 5.123456 → "5.123", 5.10 → "5.1".
 */
function formatNumber(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "0";
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(value * factor) / factor;
  return String(rounded);
}

function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {/* Native color swatch — its value is node data; chrome via classes. */}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="size-7 shrink-0 cursor-pointer rounded-md border p-0.5"
      />
      <Input
        type="text"
        className="h-8 font-mono text-xs"
        value={value}
        maxLength={9}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function IconBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      title={label}
      className="justify-center gap-1 overflow-hidden px-1.5 text-[10.5px] hover:bg-accent hover:text-primary"
    >
      {icon}
      <span className="truncate">{label}</span>
    </Button>
  );
}

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
  Unlock,
  Trash2,
  Copy,
  Link2,
  Unlink,
  Loader2,
} from "lucide-react";
import { listCardTypesAction } from "@/lib/actions/card-types";
import type { CardDesignLayout, LayoutNode, WebSafeFont } from "@/lib/card-designs/types";
import { WEB_SAFE_FONTS } from "@/lib/card-designs/types";
import type { CommonFieldDefinition, CardTypeWithFields, CardType } from "@/lib/dal";
import { COMPATIBLE_FIELD_TYPES } from "./CardDesignEditor";

const LABELS = {
  panelTitle: "Propiedades",
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
  color: "Color",
  textAlign: "Alineación",
  multiline: "Multilínea",
  overflow: "Desbordamiento",
  contentSection: "Contenido",
  staticValue: "Valor estático",
  imageUrl: "URL de imagen",
  imageMode: "Modo imagen",
  fill: "Relleno",
  stroke: "Borde",
  strokeWidth: "Grosor",
  cornerRadius: "Radio",
  x1: "X1",
  y1: "Y1",
  x2: "X2",
  y2: "Y2",
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
  dataSourceSection: "Fuente de datos",
  sourceStatic: "Estático",
  sourceField: "Campo",
  sourceCardCode: "Código",
  fieldSelector: "Campo vinculado",
  fieldSelectorPlaceholder: "Selecciona un campo…",
  cardCodeHint: "Mostrará el código único de la tarjeta.",
  noFieldsHint: "Sin campos. Vincula un tipo de tarjeta al diseño.",
} as const;

interface Props {
  layout: CardDesignLayout;
  selectedNodeId: string | null;
  unit: "mm" | "px";
  availableFields: CommonFieldDefinition[];
  linkedCardTypes: CardTypeWithFields[];
  designId: string;
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
    <div
      style={{
        width: 256,
        flexShrink: 0,
        background: "#fff",
        borderLeft: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px 10px",
          borderBottom: "1px solid var(--color-border-soft)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--color-muted)",
        }}
      >
        {LABELS.panelTitle}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        {!selectedNode ? (
          <CanvasProperties
            canvas={layout.canvas}
            unit={unit}
            linkedCardTypes={linkedCardTypes}
            onUpdate={onUpdateLayout}
            onLink={onLink}
            onUnlink={onUnlink}
          />
        ) : (
          <NodeProperties
            node={selectedNode}
            unit={unit}
            availableFields={availableFields}
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
  onUpdate,
  onLink,
  onUnlink,
}: {
  canvas: CardDesignLayout["canvas"];
  unit: string;
  linkedCardTypes: CardTypeWithFields[];
  onUpdate: (patch: Partial<CardDesignLayout["canvas"]>) => void;
  onLink: (cardTypeId: string) => Promise<string | null>;
  onUnlink: (cardTypeId: string) => Promise<string | null>;
}) {
  return (
    <>
      <Section title={LABELS.canvasSection}>
        <Row label={LABELS.background}>
          <ColorInput
            value={canvas.background}
            onChange={(v) => onUpdate({ background: v })}
          />
        </Row>
      </Section>

      <Section title={LABELS.safeMargin}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
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

      <LinkedCardTypesSection
        linkedCardTypes={linkedCardTypes}
        onLink={onLink}
        onUnlink={onUnlink}
      />
    </>
  );
}

// ─── Node properties ──────────────────────────────────────────────────────────

function NodeProperties({
  node,
  unit,
  availableFields,
  onUpdate,
  onDelete,
  onDuplicate,
  onReorder,
}: {
  node: LayoutNode;
  unit: string;
  availableFields: CommonFieldDefinition[];
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          <IconBtn
            icon={<ChevronsUp size={13} strokeWidth={2} />}
            label={LABELS.bringFront}
            onClick={() => onReorder("front")}
          />
          <IconBtn
            icon={<ArrowUp size={13} strokeWidth={2} />}
            label={LABELS.bringForward}
            onClick={() => onReorder("forward")}
          />
          <IconBtn
            icon={<ArrowDown size={13} strokeWidth={2} />}
            label={LABELS.sendBackward}
            onClick={() => onReorder("backward")}
          />
          <IconBtn
            icon={<ChevronsDown size={13} strokeWidth={2} />}
            label={LABELS.sendBack}
            onClick={() => onReorder("back")}
          />
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button
            onClick={() => onUpdate({ locked: !node.locked })}
            style={actionBtnStyle(node.locked ? "warn" : "default")}
          >
            {node.locked ? (
              <Lock size={12} strokeWidth={2} />
            ) : (
              <Unlock size={12} strokeWidth={2} />
            )}
            {node.locked ? LABELS.unlockNode : LABELS.lockNode}
          </button>
          <button onClick={onDuplicate} style={actionBtnStyle("default")}>
            <Copy size={12} strokeWidth={2} />
            {LABELS.duplicate}
          </button>
          <button onClick={onDelete} style={actionBtnStyle("danger")}>
            <Trash2 size={12} strokeWidth={2} />
            {LABELS.delete}
          </button>
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
              <textarea
                className="input"
                rows={2}
                style={{ resize: "vertical", fontSize: 12 }}
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
              <select
                className="input"
                style={{ fontSize: 12 }}
                value={node.style.fontFamily}
                onChange={(e) =>
                  onUpdate({
                    style: { ...node.style, fontFamily: e.target.value as WebSafeFont },
                  })
                }
              >
                {WEB_SAFE_FONTS.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>
                    {f}
                  </option>
                ))}
              </select>
            </Row>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
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
            <Row label={LABELS.textAlign}>
              <div style={{ display: "flex", gap: 4 }}>
                {(["left", "center", "right"] as const).map((align) => (
                  <button
                    key={align}
                    onClick={() =>
                      onUpdate({ style: { ...node.style, align } })
                    }
                    style={{
                      flex: 1,
                      padding: "4px 0",
                      borderRadius: 6,
                      border: `1.5px solid ${node.style.align === align ? "var(--color-primary)" : "var(--color-border)"}`,
                      background: node.style.align === align ? "var(--color-primary-light)" : "#fff",
                      color: node.style.align === align ? "var(--color-primary)" : "var(--color-secondary)",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
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
          {node.content.source === "static" && (
            <Row label={LABELS.imageUrl}>
              <input
                className="input"
                style={{ fontSize: 12 }}
                value={(node.content as { staticUrl?: string }).staticUrl ?? ""}
                placeholder="https://..."
                onChange={(e) =>
                  onUpdate({ content: { source: "static", staticUrl: e.target.value } })
                }
              />
            </Row>
          )}
          <Row label={LABELS.imageMode}>
            <div style={{ display: "flex", gap: 4 }}>
              {(["fit", "fill"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => onUpdate({ mode: m })}
                  style={toggleBtnStyle(node.mode === m)}
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
            <input
              className="input"
              style={{ fontSize: 12 }}
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
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
        <p style={{ fontSize: 11.5, color: "#dc2626", margin: "0 0 6px" }}>{actionError}</p>
      )}

      {linkedCardTypes.length === 0 && !pickerOpen && (
        <p style={{ fontSize: 11.5, color: "var(--color-muted)", margin: "0 0 6px", lineHeight: 1.5 }}>
          {LABELS.noLinkedTypes}
        </p>
      )}

      {linkedCardTypes.map((ct) => (
        <div
          key={ct.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 8px",
            background: "#f8f9fc",
            borderRadius: 7,
            border: "1px solid var(--color-border-soft)",
            marginBottom: 4,
          }}
        >
          <Link2 size={11} strokeWidth={2} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: "var(--color-dark)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ct.name}
          </span>
          <button
            onClick={() => void handleUnlink(ct.id)}
            disabled={pendingId === ct.id}
            title={LABELS.unlinkType}
            style={{
              background: "none",
              border: "none",
              cursor: pendingId === ct.id ? "not-allowed" : "pointer",
              color: "#dc2626",
              padding: 2,
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            {pendingId === ct.id ? (
              <Loader2 size={11} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <Unlink size={11} strokeWidth={2} />
            )}
          </button>
        </div>
      ))}

      {pickerOpen ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          {pickerLoading && !availableCardTypes.length ? (
            <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>Cargando…</span>
          ) : (
            <select
              className="input"
              style={{ fontSize: 12 }}
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">{LABELS.linkPickerPlaceholder}</option>
              {availableCardTypes.map((ct) => (
                <option key={ct.id} value={ct.id}>{ct.name}</option>
              ))}
            </select>
          )}
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => void confirmLink()}
              disabled={!selectedId || pickerLoading}
              className="btn btn-primary"
              style={{ flex: 1, height: 30, fontSize: 12 }}
            >
              {pickerLoading ? <Loader2 size={12} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} /> : LABELS.linkConfirm}
            </button>
            <button
              onClick={() => { setPickerOpen(false); setActionError(null); }}
              className="btn btn-secondary"
              style={{ flex: 1, height: 30, fontSize: 12 }}
            >
              {LABELS.linkCancel}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => void openPicker()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "5px 10px",
            borderRadius: 7,
            border: "1.5px dashed var(--color-primary)",
            background: "var(--color-primary-light)",
            color: "var(--color-primary)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            width: "100%",
            justifyContent: "center",
          }}
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
            ? { source: "static", staticUrl: "" }
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
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setSource("static")}
            style={toggleBtnStyle(source === "static")}
          >
            {LABELS.sourceStatic}
          </button>
          <button
            onClick={() => setSource("field")}
            style={toggleBtnStyle(source === "field")}
          >
            {LABELS.sourceField}
          </button>
          {supportsCardCode && (
            <button
              onClick={() => setSource("card_code")}
              style={toggleBtnStyle(source === "card_code")}
            >
              {LABELS.sourceCardCode}
            </button>
          )}
        </div>
      </Row>

      {/* Field selector */}
      {source === "field" && (
        <Row label={LABELS.fieldSelector}>
          {compatible.length === 0 ? (
            <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
              {LABELS.noFieldsHint}
            </span>
          ) : (
            <select
              className="input"
              style={{ fontSize: 12 }}
              value={currentFieldId}
              onChange={(e) =>
                onUpdate({
                  content: { source: "field", fieldDefinitionId: e.target.value },
                })
              }
            >
              <option value="">{LABELS.fieldSelectorPlaceholder}</option>
              {compatible.map((f) => (
                <option key={f.fieldDefinitionIds[0]} value={f.fieldDefinitionIds[0]}>
                  {f.label || f.name}
                </option>
              ))}
            </select>
          )}
        </Row>
      )}

      {/* Card code hint */}
      {source === "card_code" && (
        <p
          style={{
            margin: "2px 0 0",
            fontSize: 11.5,
            color: "var(--color-muted)",
            lineHeight: 1.5,
          }}
        >
          {LABELS.cardCodeHint}
        </p>
      )}
    </Section>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--color-muted)",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "var(--color-secondary)",
          marginBottom: 3,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
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
    <input
      type="number"
      className="input"
      style={{ fontSize: 12 }}
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
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          border: "1.5px solid var(--color-border)",
          cursor: "pointer",
          padding: 2,
          flexShrink: 0,
        }}
      />
      <input
        type="text"
        className="input"
        style={{ fontSize: 12, fontFamily: "monospace" }}
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
    <button
      onClick={onClick}
      title={label}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        padding: "5px 6px",
        borderRadius: 6,
        border: "1.5px solid var(--color-border)",
        background: "#fff",
        cursor: "pointer",
        fontSize: 11,
        color: "var(--color-secondary)",
        fontWeight: 500,
        transition: "all 0.1s",
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
      onMouseOver={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          "var(--color-primary-light)";
        (e.currentTarget as HTMLButtonElement).style.color =
          "var(--color-primary)";
        (e.currentTarget as HTMLButtonElement).style.borderColor =
          "var(--color-primary)";
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "#fff";
        (e.currentTarget as HTMLButtonElement).style.color =
          "var(--color-secondary)";
        (e.currentTarget as HTMLButtonElement).style.borderColor =
          "var(--color-border)";
      }}
    >
      {icon}
      <span style={{ fontSize: 10.5 }}>{label}</span>
    </button>
  );
}

function actionBtnStyle(variant: "default" | "danger" | "warn"): React.CSSProperties {
  const colors = {
    default: {
      bg: "#fff",
      border: "var(--color-border)",
      color: "var(--color-secondary)",
    },
    danger: { bg: "#fff1f1", border: "#fca5a5", color: "#dc2626" },
    warn: { bg: "#fffbeb", border: "#fde68a", color: "#d97706" },
  };
  const c = colors[variant];
  return {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: "5px 6px",
    borderRadius: 6,
    border: `1.5px solid ${c.border}`,
    background: c.bg,
    color: c.color,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
  };
}

function toggleBtnStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "4px 0",
    borderRadius: 6,
    border: `1.5px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`,
    background: active ? "var(--color-primary-light)" : "#fff",
    color: active ? "var(--color-primary)" : "var(--color-secondary)",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  };
}

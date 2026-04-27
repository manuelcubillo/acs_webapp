"use client";

/**
 * EditorCanvas — Konva Stage for the card design editor.
 *
 * Coordinate system:
 *   - Layout JSON stores positions in design units (mm or px).
 *   - Konva shapes use canvas pixels = design units × pxPerUnit.
 *   - A zoom Group scales the display without affecting stored coordinates.
 *   - On drag/transform end, we convert back: designUnit = canvasPx / pxPerUnit.
 */

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type MutableRefObject,
} from "react";
import {
  Stage,
  Layer,
  Rect,
  Text,
  Image as KonvaImage,
  Line,
  Group,
  Transformer,
} from "react-konva";
import type Konva from "konva";
import type {
  CardDesignLayout,
  LayoutNode,
  TextNode,
  ImageNode,
  QrNode,
  Barcode128Node,
  RectNode,
  LineNode,
} from "@/lib/card-designs/types";
import type { CommonFieldDefinition } from "@/lib/dal";
import { computeSnap, type SnapGuides } from "./snapUtils";
import TextEditOverlay from "./TextEditOverlay";
import { measureText } from "./textMetrics";

const MM_TO_PX = 3.7795275591; // 96 DPI

export function getPxPerUnit(unit: "mm" | "px") {
  return unit === "mm" ? MM_TO_PX : 1;
}

interface Props {
  layout: CardDesignLayout;
  zoom: number;
  selectedNodeId: string | null;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  stageDimensions: { width: number; height: number };
  /** Common fields across all linked card types — used to label field-bound nodes. */
  availableFields: CommonFieldDefinition[];
  onSelect: (id: string | null) => void;
  onNodeUpdate: (
    id: string,
    patch: Record<string, unknown>,
    options?: { replaceCurrent?: boolean },
  ) => void;
  onDrop: (type: LayoutNode["type"], canvasX: number, canvasY: number) => void;
}

export default function EditorCanvas({
  layout,
  zoom,
  selectedNodeId,
  containerRef,
  stageDimensions,
  availableFields,
  onSelect,
  onNodeUpdate,
  onDrop,
}: Props) {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const shapeRefs = useRef<Record<string, Konva.Node | null>>({});
  const [snapGuides, setSnapGuides] = useState<SnapGuides>({ x: [], y: [] });
  const [textEditId, setTextEditId] = useState<string | null>(null);
  const [textEditValue, setTextEditValue] = useState("");

  const pxPerUnit = getPxPerUnit(layout.canvas.unit);
  const artW = layout.canvas.width * pxPerUnit;
  const artH = layout.canvas.height * pxPerUnit;
  const offsetX = Math.max((stageDimensions.width - artW * zoom) / 2, 16);
  const offsetY = Math.max((stageDimensions.height - artH * zoom) / 2, 16);

  // Attach transformer to selected node
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    // Hide transformer while inline-editing text
    if (textEditId) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const target = selectedNodeId ? shapeRefs.current[selectedNodeId] : null;
    if (target) {
      tr.nodes([target]);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedNodeId, textEditId, layout.nodes]);

  // ── QR / barcode image cache ──────────────────────────────────────────────
  // Key by `${type}:${value}` so identical values dedupe naturally and stale
  // entries (after a value change or node deletion) are simply unused.
  const [codeImages, setCodeImages] = useState<Record<string, HTMLImageElement>>({});

  useEffect(() => {
    const wanted = new Set<string>();
    for (const node of layout.nodes) {
      if (node.type !== "qr" && node.type !== "barcode128") continue;
      const value = resolveCodeValue(node);
      const key = `${node.type}:${value}`;
      wanted.add(key);
      if (codeImages[key]) continue;

      if (node.type === "qr") {
        void import("qrcode").then(({ default: QRCode }) => {
          const canvas = document.createElement("canvas");
          QRCode.toCanvas(canvas, value || "?", { width: 200, margin: 1 })
            .then(() => {
              const img = new window.Image();
              img.src = canvas.toDataURL();
              setCodeImages((prev) => ({ ...prev, [key]: img }));
            })
            .catch(() => {
              /* ignore — bad value */
            });
        });
      } else {
        void import("jsbarcode").then(({ default: JsBarcode }) => {
          const canvas = document.createElement("canvas");
          try {
            JsBarcode(canvas, value || "000000", {
              format: "CODE128",
              height: 60,
              displayValue: false,
              margin: 4,
            });
            const img = new window.Image();
            img.src = canvas.toDataURL();
            setCodeImages((prev) => ({ ...prev, [key]: img }));
          } catch {
            /* invalid barcode value — skip */
          }
        });
      }
    }
    // Garbage-collect cache entries no longer referenced by any node.
    setCodeImages((prev) => {
      const keys = Object.keys(prev);
      if (keys.every((k) => wanted.has(k))) return prev;
      const next: Record<string, HTMLImageElement> = {};
      for (const k of keys) if (wanted.has(k)) next[k] = prev[k];
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.nodes]);

  // ── HTML5 drop handler ────────────────────────────────────────────────────
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData("nodeType") as LayoutNode["type"];
    if (!nodeType) return;
    const stage = stageRef.current;
    if (!stage) return;
    const container = stage.container();
    const rect = container.getBoundingClientRect();
    // Convert screen drop position → canvas pixels (inside artboard group)
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const canvasPxX = (screenX - offsetX) / zoom;
    const canvasPxY = (screenY - offsetY) / zoom;
    // Convert to design units
    const designX = canvasPxX / pxPerUnit;
    const designY = canvasPxY / pxPerUnit;
    onDrop(nodeType, designX, designY);
  }

  function getNodeBoundsInPx(node: LayoutNode): { x: number; y: number; width: number; height: number } | null {
    if (node.type === "line") {
      const minX = Math.min(node.x1, node.x2) * pxPerUnit;
      const minY = Math.min(node.y1, node.y2) * pxPerUnit;
      const w = Math.abs(node.x2 - node.x1) * pxPerUnit;
      const h = Math.abs(node.y2 - node.y1) * pxPerUnit;
      return { x: minX, y: minY, width: Math.max(w, 1), height: Math.max(h, 1) };
    }
    if (!("x" in node)) return null;
    return {
      x: node.x * pxPerUnit,
      y: node.y * pxPerUnit,
      width: node.width * pxPerUnit,
      height: node.height * pxPerUnit,
    };
  }

  function handleDragMove(e: Konva.KonvaEventObject<DragEvent>, node: LayoutNode) {
    if (node.locked) return;
    const target = e.target;
    const pos = target.position();

    const sibs = layout.nodes
      .filter((n) => n.id !== node.id)
      .map((n) => getNodeBoundsInPx(n))
      .filter((b): b is NonNullable<typeof b> => b !== null);

    const nodeW = "width" in node ? node.width * pxPerUnit : 4;
    const nodeH = "height" in node ? node.height * pxPerUnit : 4;
    const snapped = computeSnap(pos.x, pos.y, nodeW, nodeH, artW, artH, sibs);

    target.position({ x: snapped.x, y: snapped.y });
    setSnapGuides(snapped.guides);
  }

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>, node: LayoutNode) {
    setSnapGuides({ x: [], y: [] });
    if (node.locked) return;
    const pos = e.target.position();
    if (node.type === "line") {
      const dx = (pos.x - node.x1 * pxPerUnit) / pxPerUnit;
      const dy = (pos.y - node.y1 * pxPerUnit) / pxPerUnit;
      onNodeUpdate(node.id, {
        x1: node.x1 + dx,
        y1: node.y1 + dy,
        x2: node.x2 + dx,
        y2: node.y2 + dy,
      });
    } else {
      onNodeUpdate(node.id, {
        x: pos.x / pxPerUnit,
        y: pos.y / pxPerUnit,
      });
    }
  }

  function handleTransformEnd(node: LayoutNode) {
    if (node.type === "line") return;
    const shape = shapeRefs.current[node.id];
    if (!shape) return;
    // Konva can produce negative scale on flip; use absolute value.
    const scaleX = Math.abs(shape.scaleX());
    const scaleY = Math.abs(shape.scaleY());
    shape.scaleX(1);
    shape.scaleY(1);
    onNodeUpdate(node.id, {
      x: shape.x() / pxPerUnit,
      y: shape.y() / pxPerUnit,
      width: Math.max(1, (shape.width() * scaleX) / pxPerUnit),
      height: Math.max(1, (shape.height() * scaleY) / pxPerUnit),
      rotation: shape.rotation(),
    });
  }

  function handleTextDblClick(node: TextNode) {
    const shape = shapeRefs.current[node.id];
    if (!shape || !stageRef.current) return;
    const val =
      node.content.source === "static" ? node.content.staticValue ?? "" : "";
    setTextEditValue(val);
    setTextEditId(node.id);
    onSelect(node.id);
  }

  function commitTextEdit() {
    if (!textEditId) return;
    const node = layout.nodes.find((n) => n.id === textEditId) as
      | TextNode
      | undefined;
    if (!node || node.type !== "text") {
      setTextEditId(null);
      return;
    }

    // Auto-size the node so the box hugs the new content. This also fixes
    // the "ellipsis with leftover space" symptom — there's no leftover.
    const size = measureText({
      text: textEditValue || " ",
      fontSizePx: node.style.fontSize,
      fontFamily: node.style.fontFamily,
      wrap: node.style.multiline && node.style.overflow === "wrap",
      maxWidthPx: node.style.multiline ? node.width * pxPerUnit : undefined,
    });

    onNodeUpdate(textEditId, {
      content: { source: "static", staticValue: textEditValue },
      width: size.width / pxPerUnit,
      height: size.height / pxPerUnit,
    });
    setTextEditId(null);
  }

  function cancelTextEdit() {
    setTextEditId(null);
  }

  // Compute screen-space rect of the text node currently being edited.
  // getAbsolutePosition returns stage-local pixels (already includes offset + zoom).
  const getTextEditScreenRect = useCallback(() => {
    if (!textEditId) return null;
    const node = layout.nodes.find((n) => n.id === textEditId) as TextNode | undefined;
    if (!node || node.type !== "text") return null;
    const shape = shapeRefs.current[textEditId];
    const stage = stageRef.current;
    if (!shape || !stage) return null;
    const stageRect = stage.container().getBoundingClientRect();
    const absPos = shape.getAbsolutePosition();
    return {
      left: stageRect.left + absPos.x,
      top: stageRect.top + absPos.y,
      width: node.width * pxPerUnit * zoom,
      height: node.height * pxPerUnit * zoom,
    };
  }, [textEditId, layout.nodes, pxPerUnit, zoom]);

  const safeMarginPx = {
    top: layout.canvas.safeMargin.top * pxPerUnit,
    right: layout.canvas.safeMargin.right * pxPerUnit,
    bottom: layout.canvas.safeMargin.bottom * pxPerUnit,
    left: layout.canvas.safeMargin.left * pxPerUnit,
  };

  // Sort nodes by zIndex for deterministic drawing order — matches PNG export.
  const sortedNodes = [...layout.nodes].sort((a, b) => a.zIndex - b.zIndex);

  // Map fieldDefinitionId → display label for field-bound nodes.
  const fieldLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of availableFields) {
      const display = f.label || f.name;
      for (const id of f.fieldDefinitionIds) m.set(id, display);
    }
    return m;
  }, [availableFields]);

  // Stable signature of every text node's display-affecting attrs — used to
  // gate the auto-size effect so reference changes alone don't retrigger it.
  const textNodesSignature = useMemo(() => {
    return layout.nodes
      .filter((n) => n.type === "text")
      .map((n) => {
        const t = n as TextNode;
        return [
          t.id,
          t.style.fontSize,
          t.style.fontFamily,
          t.style.multiline,
          t.style.overflow,
          t.content.source,
          t.content.source === "static" ? t.content.staticValue ?? "" : "",
          t.content.source === "field" ? t.content.fieldDefinitionId : "",
          t.style.multiline ? t.width : 0,
        ].join("|");
      })
      .join(";");
  }, [layout.nodes]);

  const fieldLabelsSignature = useMemo(
    () =>
      Array.from(fieldLabelById.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join(";"),
    [fieldLabelById],
  );

  // Auto-size text nodes whenever their displayed content / font / wrap mode
  // changes, so the box always hugs the text and ellipsis never leaves
  // dead space. Skipped while inline-editing — commitTextEdit handles it.
  useEffect(() => {
    for (const node of layout.nodes) {
      if (node.type !== "text") continue;
      if (node.id === textEditId) continue;
      const display = resolveTextDisplay(node, fieldLabelById) || " ";
      const wrap = node.style.multiline && node.style.overflow === "wrap";
      const size = measureText({
        text: display,
        fontSizePx: node.style.fontSize,
        fontFamily: node.style.fontFamily,
        wrap,
        maxWidthPx: wrap ? node.width * pxPerUnit : undefined,
      });
      const newWidth = size.width / pxPerUnit;
      const newHeight = size.height / pxPerUnit;
      const widthChanged = Math.abs(node.width - newWidth) > 0.01;
      const heightChanged = Math.abs(node.height - newHeight) > 0.01;
      // For wrap mode, keep the user's chosen width; only adjust height.
      if (wrap) {
        if (heightChanged) {
          onNodeUpdate(node.id, { height: newHeight }, { replaceCurrent: true });
        }
      } else if (widthChanged || heightChanged) {
        onNodeUpdate(
          node.id,
          { width: newWidth, height: newHeight },
          { replaceCurrent: true },
        );
      }
    }
    // The signature deps below are intentional — they capture every relevant
    // text-node attribute as a single string, avoiding loops from array-ref churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textEditId, pxPerUnit, textNodesSignature, fieldLabelsSignature]);

  const editingNode =
    textEditId
      ? (layout.nodes.find((n) => n.id === textEditId) as TextNode | undefined) ?? null
      : null;
  const textEditScreenRect = getTextEditScreenRect();

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        background: "#e8eaed",
        overflow: "hidden",
        position: "relative",
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <Stage
        ref={stageRef}
        width={stageDimensions.width}
        height={stageDimensions.height}
        onClick={(e) => {
          // Deselect when clicking the stage background or the artboard background.
          const name = e.target.name();
          if (
            e.target === e.target.getStage() ||
            name === "stage-bg" ||
            name === "artboard-bg"
          ) {
            onSelect(null);
          }
        }}
      >
        <Layer>
          {/* Stage background */}
          <Rect
            name="stage-bg"
            width={stageDimensions.width}
            height={stageDimensions.height}
            fill="#e8eaed"
          />

          {/* Artboard group (offset + zoom) */}
          <Group x={offsetX} y={offsetY} scaleX={zoom} scaleY={zoom}>
            {/* Artboard shadow */}
            <Rect
              x={2}
              y={2}
              width={artW}
              height={artH}
              fill="rgba(0,0,0,0.15)"
              cornerRadius={2}
              listening={false}
            />
            {/* Artboard background — clicking this deselects */}
            <Rect
              name="artboard-bg"
              width={artW}
              height={artH}
              fill={layout.canvas.background}
            />

            {/* Layout nodes (sorted by zIndex) */}
            {sortedNodes.map((node) => (
              <NodeShape
                key={node.id}
                node={node}
                pxPerUnit={pxPerUnit}
                isSelected={selectedNodeId === node.id}
                isEditingText={textEditId === node.id}
                fieldLabelById={fieldLabelById}
                codeImages={codeImages}
                shapeRefs={shapeRefs}
                onSelect={() => {
                  if (!node.locked) onSelect(node.id);
                }}
                onDragMove={(e) => handleDragMove(e, node)}
                onDragEnd={(e) => handleDragEnd(e, node)}
                onTransformEnd={() => handleTransformEnd(node)}
                onDblClick={
                  node.type === "text"
                    ? () => handleTextDblClick(node as TextNode)
                    : undefined
                }
              />
            ))}

            {/* Safe margin guide */}
            <Rect
              x={safeMarginPx.left}
              y={safeMarginPx.top}
              width={artW - safeMarginPx.left - safeMarginPx.right}
              height={artH - safeMarginPx.top - safeMarginPx.bottom}
              stroke="rgba(79,91,255,0.35)"
              strokeWidth={1 / zoom}
              dash={[4 / zoom, 3 / zoom]}
              fill="transparent"
              listening={false}
            />

            {/* Snap guides */}
            {snapGuides.x.map((xPos, i) => (
              <Line
                key={`gx-${i}`}
                points={[xPos, 0, xPos, artH]}
                stroke="#4f5bff"
                strokeWidth={1 / zoom}
                dash={[4 / zoom, 2 / zoom]}
                listening={false}
              />
            ))}
            {snapGuides.y.map((yPos, i) => (
              <Line
                key={`gy-${i}`}
                points={[0, yPos, artW, yPos]}
                stroke="#4f5bff"
                strokeWidth={1 / zoom}
                dash={[4 / zoom, 2 / zoom]}
                listening={false}
              />
            ))}

            {/* Transformer */}
            <Transformer
              ref={transformerRef}
              rotateEnabled={true}
              keepRatio={false}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 5 || newBox.height < 5) return oldBox;
                return newBox;
              }}
            />
          </Group>
        </Layer>
      </Stage>

      {/* Text edit overlay */}
      {textEditId && editingNode && textEditScreenRect && (
        <TextEditOverlay
          value={textEditValue}
          onChange={setTextEditValue}
          onCommit={commitTextEdit}
          onCancel={cancelTextEdit}
          screenRect={textEditScreenRect}
          fontSize={editingNode.style.fontSize * zoom}
          fontFamily={editingNode.style.fontFamily}
          color={editingNode.style.color}
          align={editingNode.style.align}
        />
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveCodeValue(node: QrNode | Barcode128Node): string {
  const content = node.content;
  if (content.source === "static") {
    return (content as { staticValue?: string }).staticValue ?? "";
  }
  // Field/card_code → placeholder (editor only; PNG render uses real data).
  return node.type === "qr" ? "https://example.com" : "1234567890";
}

/**
 * Resolves the editor display string for a text node:
 *   - static  → the raw value
 *   - card_code → "[CÓDIGO]" placeholder
 *   - field   → the bound field's name/label, or "[Campo]" if not yet selected.
 */
function resolveTextDisplay(
  node: TextNode,
  fieldLabelById: Map<string, string>,
): string {
  const c = node.content;
  if (c.source === "static") return c.staticValue ?? "";
  if (c.source === "card_code") return "[CÓDIGO]";
  const id = c.fieldDefinitionId;
  if (!id) return "[Campo]";
  return fieldLabelById.get(id) ?? "[Campo]";
}

// ─── Per-node renderer ────────────────────────────────────────────────────────

interface NodeShapeProps {
  node: LayoutNode;
  pxPerUnit: number;
  isSelected: boolean;
  isEditingText: boolean;
  /** Map of fieldDefinitionId → display label, used for field-bound text. */
  fieldLabelById: Map<string, string>;
  codeImages: Record<string, HTMLImageElement>;
  shapeRefs: MutableRefObject<Record<string, Konva.Node | null>>;
  onSelect: () => void;
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: () => void;
  onDblClick?: () => void;
}

function NodeShape({
  node,
  pxPerUnit,
  isSelected,
  isEditingText,
  fieldLabelById,
  codeImages,
  shapeRefs,
  onSelect,
  onDragMove,
  onDragEnd,
  onTransformEnd,
  onDblClick,
}: NodeShapeProps) {
  const commonDragProps = {
    draggable: !node.locked,
    onDragMove,
    onDragEnd,
    onTransformEnd,
    onClick: onSelect,
    onTap: onSelect,
    onDblClick,
    onDblTap: onDblClick,
    ref: (n: Konva.Node | null) => {
      shapeRefs.current[node.id] = n;
    },
    opacity: node.locked ? 0.6 : 1,
  };

  if (node.type === "text") {
    const n = node as TextNode;
    const displayText = resolveTextDisplay(n, fieldLabelById);
    return (
      <Text
        {...commonDragProps}
        x={n.x * pxPerUnit}
        y={n.y * pxPerUnit}
        width={n.width * pxPerUnit}
        height={n.height * pxPerUnit}
        rotation={n.rotation}
        text={displayText || " "}
        fontSize={n.style.fontSize}
        fontFamily={n.style.fontFamily}
        fill={n.style.color}
        align={n.style.align}
        wrap={n.style.multiline ? "word" : "none"}
        ellipsis={n.style.overflow === "truncate"}
        // Hide the canvas text while inline-editing so the textarea is the only visible copy.
        opacity={isEditingText ? 0 : node.locked ? 0.6 : 1}
        strokeWidth={isSelected && !isEditingText ? 1 : 0}
        stroke={isSelected && !isEditingText ? "#4f5bff" : undefined}
      />
    );
  }

  if (node.type === "image") {
    return (
      <ImageShape
        node={node as ImageNode}
        pxPerUnit={pxPerUnit}
        commonDragProps={commonDragProps}
      />
    );
  }

  if (node.type === "qr" || node.type === "barcode128") {
    const n = node as QrNode | Barcode128Node;
    const value = resolveCodeValue(n);
    const imgKey = `${n.type}:${value}`;
    const img = codeImages[imgKey];
    return img ? (
      <KonvaImage
        {...commonDragProps}
        x={n.x * pxPerUnit}
        y={n.y * pxPerUnit}
        width={n.width * pxPerUnit}
        height={n.height * pxPerUnit}
        rotation={n.rotation}
        image={img}
      />
    ) : (
      <Rect
        {...commonDragProps}
        x={n.x * pxPerUnit}
        y={n.y * pxPerUnit}
        width={n.width * pxPerUnit}
        height={n.height * pxPerUnit}
        rotation={n.rotation}
        fill="#f9fafb"
        stroke="#9ca3af"
        strokeWidth={1}
        dash={[4, 3]}
      />
    );
  }

  if (node.type === "rect") {
    const n = node as RectNode;
    return (
      <Rect
        {...commonDragProps}
        x={n.x * pxPerUnit}
        y={n.y * pxPerUnit}
        width={n.width * pxPerUnit}
        height={n.height * pxPerUnit}
        rotation={n.rotation}
        fill={n.style.fill}
        stroke={n.style.stroke}
        strokeWidth={n.style.strokeWidth}
        cornerRadius={n.style.cornerRadius}
      />
    );
  }

  if (node.type === "line") {
    const n = node as LineNode;
    return (
      <Line
        {...commonDragProps}
        x={0}
        y={0}
        points={[
          n.x1 * pxPerUnit,
          n.y1 * pxPerUnit,
          n.x2 * pxPerUnit,
          n.y2 * pxPerUnit,
        ]}
        stroke={n.style.stroke}
        strokeWidth={n.style.strokeWidth}
        hitStrokeWidth={10}
      />
    );
  }

  return null;
}

// ─── Image node renderer ──────────────────────────────────────────────────────
// Extracted into its own component so its useState/useEffect are not called
// conditionally inside NodeShape (Rules of Hooks).

interface ImageShapeProps {
  node: ImageNode;
  pxPerUnit: number;
  commonDragProps: Record<string, unknown>;
}

function ImageShape({ node, pxPerUnit, commonDragProps }: ImageShapeProps) {
  const src =
    node.content.source === "static"
      ? (node.content as { staticUrl?: string }).staticUrl ?? ""
      : "";
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImg(null);
      return;
    }
    let cancelled = false;
    const i = new window.Image();
    i.crossOrigin = "anonymous";
    i.onload = () => {
      if (!cancelled) setImg(i);
    };
    i.onerror = () => {
      if (!cancelled) setImg(null);
    };
    i.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return img ? (
    <KonvaImage
      {...commonDragProps}
      x={node.x * pxPerUnit}
      y={node.y * pxPerUnit}
      width={node.width * pxPerUnit}
      height={node.height * pxPerUnit}
      rotation={node.rotation}
      image={img}
    />
  ) : (
    <Rect
      {...commonDragProps}
      x={node.x * pxPerUnit}
      y={node.y * pxPerUnit}
      width={node.width * pxPerUnit}
      height={node.height * pxPerUnit}
      rotation={node.rotation}
      fill="#f3f4f6"
      stroke="#d1d5db"
      strokeWidth={1}
      dash={[4, 3]}
    />
  );
}

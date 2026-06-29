"use client";

/**
 * CardDesignEditor — three-pane visual editor for card designs.
 *
 * State ownership:
 *   layoutHistory + historyIndex  → undo/redo (10-step ring buffer)
 *   selectedNodeId                → which node is selected in the canvas
 *   zoom                          → canvas display scale
 *   isDirty                       → unsaved changes flag
 *
 * Konva (react-konva) is only rendered client-side (this file is the boundary).
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type MutableRefObject,
} from "react";
import { useRouter } from "next/navigation";
import {
  Undo2,
  Redo2,
  Save,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
  Eye,
  Sparkles,
} from "lucide-react";
import type { CardDesign, CardTypeWithFields, CommonFieldDefinition, FieldType } from "@/lib/dal";
import type { CardDesignLayout, LayoutNode } from "@/lib/card-designs/types";
import { isBindableNode } from "@/lib/card-designs/types";
import {
  updateCardDesignAction,
  linkDesignToCardTypeAction,
  unlinkDesignFromCardTypeAction,
} from "@/lib/actions/card-designs";
import { createNode, getCenteredPosition } from "./nodeFactory";
import ElementPalette from "./ElementPalette";
import EditorCanvas, { getPxPerUnit } from "./EditorCanvas";
import PropertiesPanel from "./PropertiesPanel";
import CardDesignPreviewModal from "../CardDesignPreviewModal";
import { buildMockPreviewData } from "@/lib/card-designs/mock-preview-data";
import TemplatePicker from "./TemplatePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Vertical divider used between toolbar groups. */
function ToolbarDivider() {
  return <div className="mx-1 h-6 w-px bg-border" />;
}

const LABELS = {
  backBtn: "Volver",
  saveBtn: "Guardar",
  savingBtn: "Guardando…",
  savedMsg: "Guardado",
  saveError: "Error al guardar",
  unsavedWarning: "Tienes cambios sin guardar. ¿Salir de todas formas?",
  zoomFit: "Ajustar",
  undo: "Deshacer",
  redo: "Rehacer",
  preview: "Vista previa",
  templates: "Plantillas",
  bindingBannerTitle: "Vinculaciones rotas",
  bindingBannerMsg: (n: number) =>
    `${n} elemento${n !== 1 ? "s" : ""} referencia${n === 1 ? "" : "n"} un campo que ya no existe en los tipos de tarjeta vinculados.`,
  bindingBannerDismiss: "Descartar",
  unsavedBadge: "Sin guardar",
} as const;

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const HISTORY_CAPACITY = 10;

interface Props {
  design: CardDesign;
  linkedCardTypes: CardTypeWithFields[];
  initialStaticImageUrls: Record<string, string>;
}

export default function CardDesignEditor({
  design,
  linkedCardTypes: initialLinkedCardTypes,
  initialStaticImageUrls,
}: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null) as MutableRefObject<HTMLDivElement | null>;

  // ── Parse initial layout ───────────────────────────────────────────────────
  const parsedLayout = parseLayout(design);

  // ── Linked card types (mutable — user can link/unlink without page reload) ─
  const [linkedCardTypes, setLinkedCardTypes] = useState(initialLinkedCardTypes);

  // ── Common available fields (intersection across all linked card types) ────
  const availableFields = computeCommonFields(linkedCardTypes);

  // ── Editor state ───────────────────────────────────────────────────────────
  const [layoutHistory, setLayoutHistory] = useState<CardDesignLayout[]>([parsedLayout]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [zoom, setZoom] = useState(1);
  const [stageDimensions, setStageDimensions] = useState({ width: 800, height: 600 });
  const [brokenBindingCount, setBrokenBindingCount] = useState(0);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  // Object-key → signed read URL for static `image` nodes. Seeded from the
  // server, extended on every successful upload from the properties panel.
  const [staticImageUrls, setStaticImageUrls] = useState<Record<string, string>>(
    initialStaticImageUrls,
  );

  const registerStaticImageUrl = useCallback(
    (key: string, url: string) => {
      setStaticImageUrls((prev) =>
        prev[key] === url ? prev : { ...prev, [key]: url },
      );
    },
    [],
  );

  const layout = layoutHistory[historyIndex];
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < layoutHistory.length - 1;

  // ── Responsive stage size ──────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setStageDimensions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── Compute fit zoom on first render ───────────────────────────────────────
  useEffect(() => {
    const pxPerUnit = getPxPerUnit(layout.canvas.unit);
    const artW = layout.canvas.width * pxPerUnit;
    const artH = layout.canvas.height * pxPerUnit;
    const { width, height } = stageDimensions;
    const fitZoom = Math.min((width - 80) / artW, (height - 80) / artH, 2);
    setZoom(Math.max(0.25, Math.round(fitZoom * 100) / 100));
  // Run only on mount / when stage dimensions first become nonzero
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageDimensions.width !== 800 ? stageDimensions.width : null]);

  // ── Warn on browser navigation ─────────────────────────────────────────────
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undo();
      } else if (ctrl && (e.shiftKey ? e.key === "z" : e.key === "y")) {
        e.preventDefault();
        redo();
      } else if (ctrl && e.key === "s") {
        e.preventDefault();
        void handleSave();
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedNodeId &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        deleteNode(selectedNodeId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyIndex, selectedNodeId, layoutHistory]);

  // ── Broken binding detection ───────────────────────────────────────────────
  useEffect(() => {
    const allIds = new Set(availableFields.flatMap((f) => f.fieldDefinitionIds));
    const broken = parsedLayout.nodes.filter(
      (n) => isBindableNode(n) && n.content.source === "field" && !allIds.has(n.content.fieldDefinitionId),
    ).length;
    setBrokenBindingCount(broken);
  // Only run on mount to report initial broken state
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── History helpers ────────────────────────────────────────────────────────
  const pushLayout = useCallback(
    (newLayout: CardDesignLayout) => {
      setLayoutHistory((prev) => {
        const truncated = prev.slice(0, historyIndex + 1);
        const next = [...truncated, newLayout].slice(-HISTORY_CAPACITY);
        return next;
      });
      setHistoryIndex((i) =>
        Math.min(i + 1, HISTORY_CAPACITY - 1),
      );
      setIsDirty(true);
    },
    [historyIndex],
  );

  /**
   * Updates the current history entry in place, without pushing a new one.
   * Used for derived patches (e.g. text auto-resize) that should ride along
   * with the user-initiated change instead of polluting undo history.
   */
  const replaceCurrentLayout = useCallback(
    (newLayout: CardDesignLayout) => {
      setLayoutHistory((prev) => {
        if (prev.length === 0) return [newLayout];
        const next = [...prev];
        next[historyIndex] = newLayout;
        return next;
      });
      setIsDirty(true);
    },
    [historyIndex],
  );

  function undo() {
    if (canUndo) {
      setHistoryIndex((i) => i - 1);
    }
  }

  function redo() {
    if (canRedo) {
      setHistoryIndex((i) => i + 1);
    }
  }

  // ── Node helpers ───────────────────────────────────────────────────────────
  function addNode(node: LayoutNode) {
    pushLayout({ ...layout, nodes: [...layout.nodes, node] });
    setSelectedNodeId(node.id);
  }

  function updateNode(
    id: string,
    patch: Record<string, unknown>,
    options?: { replaceCurrent?: boolean },
  ) {
    const newNodes = layout.nodes.map((n) =>
      n.id === id ? ({ ...n, ...patch } as unknown as LayoutNode) : n,
    );
    const next = { ...layout, nodes: newNodes };
    if (options?.replaceCurrent) {
      replaceCurrentLayout(next);
    } else {
      pushLayout(next);
    }
  }

  function deleteNode(id: string) {
    pushLayout({ ...layout, nodes: layout.nodes.filter((n) => n.id !== id) });
    if (selectedNodeId === id) setSelectedNodeId(null);
  }

  function duplicateNode(id: string) {
    const original = layout.nodes.find((n) => n.id === id);
    if (!original) return;
    const clone = {
      ...original,
      id: crypto.randomUUID(),
      ...("x" in original ? { x: original.x + 5, y: original.y + 5 } : {}),
      ...("x1" in original
        ? {
            x1: (original as { x1: number }).x1 + 5,
            y1: (original as { y1: number }).y1 + 5,
            x2: (original as { x2: number }).x2 + 5,
            y2: (original as { y2: number }).y2 + 5,
          }
        : {}),
      zIndex: layout.nodes.length,
      locked: false,
    } as unknown as LayoutNode;
    addNode(clone);
  }

  function reorderNode(id: string, dir: "front" | "back" | "forward" | "backward") {
    const nodes = [...layout.nodes];
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx === -1) return;

    let reordered: LayoutNode[];
    if (dir === "front") {
      reordered = [...nodes.filter((n) => n.id !== id), nodes[idx]];
    } else if (dir === "back") {
      reordered = [nodes[idx], ...nodes.filter((n) => n.id !== id)];
    } else if (dir === "forward" && idx < nodes.length - 1) {
      reordered = [...nodes];
      [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
    } else if (dir === "backward" && idx > 0) {
      reordered = [...nodes];
      [reordered[idx], reordered[idx - 1]] = [reordered[idx - 1], reordered[idx]];
    } else {
      return;
    }

    pushLayout({
      ...layout,
      nodes: reordered.map((n, i) => ({ ...n, zIndex: i } as LayoutNode)),
    });
  }

  function updateCanvasProps(patch: Partial<CardDesignLayout["canvas"]>) {
    pushLayout({ ...layout, canvas: { ...layout.canvas, ...patch } });
  }

  // ── Drop handler ───────────────────────────────────────────────────────────
  function handleDrop(type: LayoutNode["type"], designX: number, designY: number) {
    const node = createNode(type, designX, designY, layout.nodes.length);
    addNode(node);
  }

  // ── Add centered (double-click on palette item) ────────────────────────────
  function handleAddCentered(type: LayoutNode["type"]) {
    const { x, y } = getCenteredPosition(type, layout.canvas.width, layout.canvas.height);
    const node = createNode(type, x, y, layout.nodes.length);
    addNode(node);
  }

  // ── Apply a starter template (replaces canvas + nodes) ─────────────────────
  function handleApplyTemplate(templateLayout: CardDesignLayout) {
    pushLayout(templateLayout);
    setSelectedNodeId(null);
  }

  // ── Link / Unlink card types ───────────────────────────────────────────────
  async function handleLink(cardTypeId: string): Promise<string | null> {
    const linkResult = await linkDesignToCardTypeAction(design.id, cardTypeId);
    if (!linkResult.success) return linkResult.error ?? "Error al vincular";
    // Fetch full card type (with field defs) so availableFields updates correctly
    const { getCardTypeAction } = await import("@/lib/actions/card-types");
    const ctResult = await getCardTypeAction(cardTypeId);
    if (ctResult.success) {
      setLinkedCardTypes((prev) => [...prev, ctResult.data]);
    }
    return null;
  }

  async function handleUnlink(cardTypeId: string): Promise<string | null> {
    const result = await unlinkDesignFromCardTypeAction(design.id, cardTypeId);
    if (!result.success) return result.error ?? "Error al desvincular";
    setLinkedCardTypes((prev) => prev.filter((ct) => ct.id !== cardTypeId));
    return null;
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaveStatus("saving");
    const result = await updateCardDesignAction(design.id, {
      layout: layout as unknown as Record<string, unknown>,
    });
    if (result.success) {
      setSaveStatus("saved");
      setIsDirty(false);
      setTimeout(() => setSaveStatus("idle"), 2500);
    } else {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }

  // ── Zoom helpers ───────────────────────────────────────────────────────────
  function zoomIn() {
    const next = ZOOM_LEVELS.find((z) => z > zoom);
    if (next) setZoom(next);
  }

  function zoomOut() {
    const prev = [...ZOOM_LEVELS].reverse().find((z) => z < zoom);
    if (prev) setZoom(prev);
  }

  function fitZoom() {
    const pxPerUnit = getPxPerUnit(layout.canvas.unit);
    const artW = layout.canvas.width * pxPerUnit;
    const artH = layout.canvas.height * pxPerUnit;
    const fit = Math.min(
      (stageDimensions.width - 80) / artW,
      (stageDimensions.height - 80) / artH,
      2,
    );
    setZoom(Math.max(0.25, Math.round(fit * 100) / 100));
  }

  // ── Back navigation ────────────────────────────────────────────────────────
  function handleBack() {
    if (isDirty && !window.confirm(LABELS.unsavedWarning)) return;
    router.push("/card-designs");
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex h-13 shrink-0 items-center gap-2 border-b bg-card px-4">
        {/* Back */}
        <Button variant="outline" size="sm" onClick={handleBack}>
          <ArrowLeft strokeWidth={1.8} />
          {LABELS.backBtn}
        </Button>

        <ToolbarDivider />

        {/* Design name */}
        <span className="max-w-60 truncate font-heading text-sm font-bold text-foreground">
          {design.name}
        </span>

        {isDirty && <Badge variant="secondary">Sin guardar</Badge>}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Undo/Redo */}
        <Button variant="outline" size="icon-sm" onClick={undo} disabled={!canUndo} title={LABELS.undo}>
          <Undo2 strokeWidth={1.8} />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={redo} disabled={!canRedo} title={LABELS.redo}>
          <Redo2 strokeWidth={1.8} />
        </Button>

        <ToolbarDivider />

        {/* Zoom */}
        <Button variant="outline" size="icon-sm" onClick={zoomOut} title="Alejar" disabled={zoom <= ZOOM_LEVELS[0]}>
          <ZoomOut strokeWidth={1.8} />
        </Button>
        <span className="min-w-[38px] text-center text-xs font-semibold text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button variant="outline" size="icon-sm" onClick={zoomIn} title="Acercar" disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}>
          <ZoomIn strokeWidth={1.8} />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={fitZoom} title={LABELS.zoomFit}>
          <Maximize2 strokeWidth={1.8} />
        </Button>

        <ToolbarDivider />

        {/* Templates */}
        <Button variant="outline" size="sm" onClick={() => setTemplatesOpen(true)} title={LABELS.templates}>
          <Sparkles strokeWidth={1.8} />
          {LABELS.templates}
        </Button>

        {/* Preview */}
        <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} title={LABELS.preview}>
          <Eye strokeWidth={1.8} />
          {LABELS.preview}
        </Button>

        <ToolbarDivider />

        {/* Save */}
        <Button onClick={handleSave} disabled={saveStatus === "saving"}>
          {saveStatus === "saving" ? (
            <>
              <Loader2 className="animate-spin" strokeWidth={2} />
              {LABELS.savingBtn}
            </>
          ) : saveStatus === "saved" ? (
            <>
              <CheckCircle strokeWidth={2} />
              {LABELS.savedMsg}
            </>
          ) : saveStatus === "error" ? (
            <>
              <AlertCircle strokeWidth={2} />
              {LABELS.saveError}
            </>
          ) : (
            <>
              <Save strokeWidth={1.8} />
              {LABELS.saveBtn}
            </>
          )}
        </Button>
      </div>

      {/* Broken binding banner */}
      {brokenBindingCount > 0 && !bannerDismissed && (
        <div className="flex shrink-0 items-center gap-2.5 border-b border-amber-400/50 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="size-3.5 shrink-0" strokeWidth={2} />
          <span className="flex-1">
            <strong>{LABELS.bindingBannerTitle}:</strong>{" "}
            {LABELS.bindingBannerMsg(brokenBindingCount)}
          </span>
          <button
            onClick={() => setBannerDismissed(true)}
            className="rounded px-1.5 py-0.5 text-[11px] font-semibold hover:bg-amber-500/20"
          >
            {LABELS.bindingBannerDismiss}
          </button>
        </div>
      )}

      {/* Three-pane body */}
      <div className="flex flex-1 overflow-hidden">
        <ElementPalette onAddCentered={handleAddCentered} />

        <EditorCanvas
          layout={layout}
          zoom={zoom}
          selectedNodeId={selectedNodeId}
          containerRef={containerRef}
          stageDimensions={stageDimensions}
          availableFields={availableFields}
          staticImageUrls={staticImageUrls}
          onSelect={setSelectedNodeId}
          onNodeUpdate={updateNode}
          onDrop={handleDrop}
        />

        <PropertiesPanel
          layout={layout}
          selectedNodeId={selectedNodeId}
          unit={layout.canvas.unit}
          availableFields={availableFields}
          linkedCardTypes={linkedCardTypes}
          designId={design.id}
          staticImageUrls={staticImageUrls}
          onRegisterStaticImageUrl={registerStaticImageUrl}
          onUpdateLayout={updateCanvasProps}
          onUpdateNode={updateNode}
          onDeleteNode={deleteNode}
          onDuplicateNode={duplicateNode}
          onReorderNode={reorderNode}
          onLink={handleLink}
          onUnlink={handleUnlink}
        />
      </div>

      {/* Preview modal — uses mocked data for in-editor preview */}
      {previewOpen && (() => {
        const mock = buildMockPreviewData(availableFields);
        return (
          <CardDesignPreviewModal
            layout={layout}
            fieldValues={mock.fieldValues}
            photoValues={mock.photoValues}
            staticImageUrls={staticImageUrls}
            cardCode={mock.cardCode}
            designName={`${design.name} (datos de muestra)`}
            onClose={() => setPreviewOpen(false)}
          />
        );
      })()}

      {/* Template picker — load a starter layout */}
      {templatesOpen && (
        <TemplatePicker
          kind={design.kind}
          designHasContent={layout.nodes.length > 0}
          onApply={handleApplyTemplate}
          onClose={() => setTemplatesOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Node-type → compatible field types for data binding. */
const COMPATIBLE_FIELD_TYPES: Record<
  "text" | "image" | "qr" | "barcode128",
  FieldType[]
> = {
  text: ["text", "number", "date", "boolean", "select"],
  image: ["photo"],
  qr: ["text", "number", "select"],
  barcode128: ["text", "number", "select"],
};

export { COMPATIBLE_FIELD_TYPES };

/**
 * Compute the intersection of field definitions across all linked card types.
 * Two fields are considered the same if they share the same `name` and `fieldType`.
 */
function computeCommonFields(cardTypes: CardTypeWithFields[]): CommonFieldDefinition[] {
  if (cardTypes.length === 0) return [];
  if (cardTypes.length === 1) {
    return cardTypes[0].fieldDefinitions.map((fd) => ({
      name: fd.name,
      label: fd.label,
      fieldType: fd.fieldType,
      validationRules: fd.validationRules,
      fieldDefinitionIds: [fd.id],
    }));
  }
  const result: CommonFieldDefinition[] = [];
  for (const fd of cardTypes[0].fieldDefinitions) {
    const ids: string[] = [fd.id];
    let ok = true;
    for (let i = 1; i < cardTypes.length; i++) {
      const match = cardTypes[i].fieldDefinitions.find(
        (f) => f.name === fd.name && f.fieldType === fd.fieldType,
      );
      if (!match) { ok = false; break; }
      ids.push(match.id);
    }
    if (ok) {
      result.push({
        name: fd.name,
        label: fd.label,
        fieldType: fd.fieldType,
        validationRules: fd.validationRules,
        fieldDefinitionIds: ids,
      });
    }
  }
  return result;
}

function parseLayout(design: CardDesign): CardDesignLayout {
  try {
    const raw = design.layout as unknown;
    if (raw && typeof raw === "object" && "version" in (raw as object)) {
      return raw as CardDesignLayout;
    }
  } catch {
    // fall through
  }
  return {
    version: 1,
    canvas: {
      width: design.widthUnits,
      height: design.heightUnits,
      unit: design.unit,
      safeMargin: { top: 3, right: 3, bottom: 3, left: 3 },
      // Default canvas background is design DATA (stored in the layout).
      background: "#ffffff",
    },
    nodes: [],
  };
}

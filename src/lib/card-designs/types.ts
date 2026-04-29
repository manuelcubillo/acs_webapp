/**
 * Card Design Layout Types
 *
 * Canonical TypeScript types for the layout JSON stored in card_designs.layout.
 * Version 1 schema — increment the version field when making breaking changes.
 */

// ─── Web-safe fonts ───────────────────────────────────────────────────────────

export const WEB_SAFE_FONTS = [
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Courier New",
  "Georgia",
  "Verdana",
  "Tahoma",
] as const;

export type WebSafeFont = (typeof WEB_SAFE_FONTS)[number];

// ─── Shared node base ─────────────────────────────────────────────────────────

interface LayoutNodeBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  locked: boolean;
}

// ─── Content source discriminated union ──────────────────────────────────────

export interface StaticContent {
  source: "static";
  staticValue: string;
}

export interface FieldContent {
  source: "field";
  fieldDefinitionId: string;
}

export interface CardCodeContent {
  source: "card_code";
}

export type TextContent = StaticContent | FieldContent | CardCodeContent;

/**
 * Static image content. Modern uploads write `staticObjectKey` (resolved
 * to a signed URL at render time). `staticUrl` remains for legacy nodes
 * and externally-hosted images and is treated as a literal URL when present.
 */
export interface ImageStaticContent {
  source: "static";
  /** Object key in the photo storage bucket (preferred). */
  staticObjectKey?: string;
  /** Legacy / external absolute URL. */
  staticUrl?: string;
}
export type ImageContent = ImageStaticContent | FieldContent;
export type CodeContent = StaticContent | FieldContent | CardCodeContent;

// ─── Node types ───────────────────────────────────────────────────────────────

export interface TextNode extends LayoutNodeBase {
  type: "text";
  content: TextContent;
  style: {
    fontFamily: WebSafeFont;
    fontSize: number;
    color: string;
    align: "left" | "center" | "right";
    multiline: boolean;
    overflow: "truncate" | "wrap";
  };
}

export interface ImageNode extends LayoutNodeBase {
  type: "image";
  content: ImageContent;
  mode: "fit" | "fill";
}

export interface QrNode extends LayoutNodeBase {
  type: "qr";
  content: CodeContent;
}

export interface Barcode128Node extends LayoutNodeBase {
  type: "barcode128";
  content: CodeContent;
}

export interface RectNode extends LayoutNodeBase {
  type: "rect";
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    cornerRadius: number;
  };
}

export interface LineNode {
  id: string;
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  zIndex: number;
  locked: boolean;
  style: {
    stroke: string;
    strokeWidth: number;
  };
}

export type LayoutNode =
  | TextNode
  | ImageNode
  | QrNode
  | Barcode128Node
  | RectNode
  | LineNode;

// ─── Root layout type ─────────────────────────────────────────────────────────

export interface CardDesignLayout {
  version: 1;
  canvas: {
    width: number;
    height: number;
    unit: "mm" | "px";
    safeMargin: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
    background: string;
  };
  nodes: LayoutNode[];
}

// ─── Default layout factory ───────────────────────────────────────────────────

export function createDefaultLayout(
  width: number,
  height: number,
  unit: "mm" | "px",
): CardDesignLayout {
  return {
    version: 1,
    canvas: {
      width,
      height,
      unit,
      safeMargin: { top: 3, right: 3, bottom: 3, left: 3 },
      background: "#ffffff",
    },
    nodes: [],
  };
}

// ─── Type guards ──────────────────────────────────────────────────────────────

export function isBindableNode(
  node: LayoutNode,
): node is TextNode | ImageNode | QrNode | Barcode128Node {
  return (
    node.type === "text" ||
    node.type === "image" ||
    node.type === "qr" ||
    node.type === "barcode128"
  );
}

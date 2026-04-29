/**
 * nodeFactory — creates new LayoutNodes with sensible defaults.
 * All positions are in design units (mm for mm designs, px for px designs).
 */

import type {
  LayoutNode,
  TextNode,
  ImageNode,
  QrNode,
  Barcode128Node,
  RectNode,
  LineNode,
} from "@/lib/card-designs/types";

/** Default footprint (width × height in design units) per node type. */
export const NODE_DEFAULT_SIZE: Record<LayoutNode["type"], { width: number; height: number }> = {
  text: { width: 30, height: 8 },
  image: { width: 20, height: 20 },
  qr: { width: 20, height: 20 },
  barcode128: { width: 40, height: 10 },
  rect: { width: 20, height: 10 },
  line: { width: 20, height: 0 },
};

/**
 * Returns the (x, y) position needed to render a default-sized node of `type`
 * centered on the given canvas (width × height in design units).
 */
export function getCenteredPosition(
  type: LayoutNode["type"],
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  const size = NODE_DEFAULT_SIZE[type];
  return {
    x: Math.max(0, (canvasWidth - size.width) / 2),
    y: Math.max(0, (canvasHeight - size.height) / 2),
  };
}

const DEFAULT_FONT = "Arial" as const;

/** Creates a node at the given (x, y) position in design units. */
export function createNode(
  type: LayoutNode["type"],
  x: number,
  y: number,
  existingCount: number,
): LayoutNode {
  const id = crypto.randomUUID();
  const zIndex = existingCount;

  switch (type) {
    case "text":
      return {
        id,
        type: "text",
        x,
        y,
        width: 30,
        height: 8,
        rotation: 0,
        zIndex,
        locked: false,
        content: { source: "static", staticValue: "Texto" },
        style: {
          fontFamily: DEFAULT_FONT,
          fontSize: 12,
          color: "#000000",
          align: "left",
          multiline: false,
          overflow: "truncate",
        },
      } satisfies TextNode;

    case "image":
      return {
        id,
        type: "image",
        x,
        y,
        width: 20,
        height: 20,
        rotation: 0,
        zIndex,
        locked: false,
        content: { source: "static" },
        mode: "fit",
      } satisfies ImageNode;

    case "qr":
      return {
        id,
        type: "qr",
        x,
        y,
        width: 20,
        height: 20,
        rotation: 0,
        zIndex,
        locked: false,
        content: { source: "static", staticValue: "https://example.com" },
      } satisfies QrNode;

    case "barcode128":
      return {
        id,
        type: "barcode128",
        x,
        y,
        width: 40,
        height: 10,
        rotation: 0,
        zIndex,
        locked: false,
        content: { source: "static", staticValue: "1234567890" },
      } satisfies Barcode128Node;

    case "rect":
      return {
        id,
        type: "rect",
        x,
        y,
        width: 20,
        height: 10,
        rotation: 0,
        zIndex,
        locked: false,
        style: {
          fill: "#e0e7ff",
          stroke: "#4f5bff",
          strokeWidth: 1,
          cornerRadius: 0,
        },
      } satisfies RectNode;

    case "line":
      return {
        id,
        type: "line",
        x1: x,
        y1: y,
        x2: x + 20,
        y2: y,
        zIndex,
        locked: false,
        style: { stroke: "#4f5bff", strokeWidth: 1 },
      } satisfies LineNode;
  }
}

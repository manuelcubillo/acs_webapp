/**
 * Card Design Canvas Renderer
 *
 * Renders a CardDesignLayout to a PNG data URL using the browser Canvas API.
 * All operations are client-only (uses document.createElement, Image, etc.).
 *
 * Field resolution:
 *   - source "static"    → node's staticValue / staticObjectKey / staticUrl.
 *     Image static nodes prefer `staticObjectKey` (resolved through
 *     `staticImageUrls`) and fall back to `staticUrl` for legacy data.
 *   - source "field"     → fieldValues[fieldDefinitionId]
 *   - source "card_code" → cardCode argument
 */

import type {
  CardDesignLayout,
  LayoutNode,
  TextNode,
  ImageNode,
  QrNode,
  Barcode128Node,
  RectNode,
  LineNode,
} from "./types";

const MM_TO_PX = 3.7795275591;

export interface RenderInput {
  layout: CardDesignLayout;
  /** Text/number/boolean/date/select display strings keyed by fieldDefinitionId. */
  fieldValues: Record<string, string>;
  /** Photo URL strings keyed by fieldDefinitionId. */
  photoValues: Record<string, string>;
  /**
   * Signed read URLs for static `image` nodes that reference an object key.
   * Keyed by `staticObjectKey`. Callers (server components or the editor) sign
   * the keys before render — the renderer never talks to storage directly.
   */
  staticImageUrls?: Record<string, string>;
  cardCode: string;
  /** Output scale multiplier — 2 produces retina-quality output. */
  scale?: number;
}

/**
 * Renders a design layout to a PNG data URL.
 * Must be called in a browser context.
 */
export async function renderDesignToDataURL({
  layout,
  fieldValues,
  photoValues,
  staticImageUrls = {},
  cardCode,
  scale = 2,
}: RenderInput): Promise<string> {
  const pxPerUnit = layout.canvas.unit === "mm" ? MM_TO_PX : 1;
  const artW = Math.round(layout.canvas.width * pxPerUnit);
  const artH = Math.round(layout.canvas.height * pxPerUnit);

  const canvas = document.createElement("canvas");
  canvas.width = artW * scale;
  canvas.height = artH * scale;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = layout.canvas.background || "#ffffff";
  ctx.fillRect(0, 0, artW, artH);

  // Sort by zIndex
  const sorted = [...layout.nodes].sort((a, b) => a.zIndex - b.zIndex);

  // Pre-render async assets (images, QR codes, barcodes) in parallel
  const assets = new Map<string, HTMLImageElement | HTMLCanvasElement | null>();

  await Promise.allSettled(
    sorted.map(async (node) => {
      if (node.type === "image") {
        const url = resolveImageUrl(node as ImageNode, photoValues, staticImageUrls);
        assets.set(node.id, url ? await loadImage(url).catch(() => null) : null);
      } else if (node.type === "qr") {
        const value = resolveCode(node as QrNode, fieldValues, cardCode);
        assets.set(node.id, value ? await renderQR(value, Math.round((node as QrNode).width * pxPerUnit * scale)).catch(() => null) : null);
      } else if (node.type === "barcode128") {
        const value = resolveCode(node as Barcode128Node, fieldValues, cardCode);
        const n = node as Barcode128Node;
        assets.set(
          node.id,
          value
            ? await renderBarcode(
                value,
                Math.round(n.width * pxPerUnit * scale),
                Math.round(n.height * pxPerUnit * scale),
              ).catch(() => null)
            : null,
        );
      }
    }),
  );

  // Draw all nodes
  for (const node of sorted) {
    drawNode(ctx, node, pxPerUnit, fieldValues, photoValues, cardCode, assets);
  }

  return canvas.toDataURL("image/png");
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

function drawNode(
  ctx: CanvasRenderingContext2D,
  node: LayoutNode,
  pxPerUnit: number,
  fieldValues: Record<string, string>,
  photoValues: Record<string, string>,
  cardCode: string,
  assets: Map<string, HTMLImageElement | HTMLCanvasElement | null>,
) {
  if (node.type === "line") {
    drawLine(ctx, node as LineNode, pxPerUnit);
    return;
  }

  const n = node as TextNode | ImageNode | QrNode | Barcode128Node | RectNode;
  const x = n.x * pxPerUnit;
  const y = n.y * pxPerUnit;
  const w = n.width * pxPerUnit;
  const h = n.height * pxPerUnit;
  const deg = (n.rotation || 0) * (Math.PI / 180);

  ctx.save();
  // Rotate around the node's center
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(deg);
  ctx.translate(-w / 2, -h / 2);

  switch (node.type) {
    case "rect": drawRect(ctx, node as RectNode, w, h, pxPerUnit); break;
    case "text": drawText(ctx, node as TextNode, w, h, pxPerUnit, fieldValues, cardCode); break;
    case "image": drawImage(ctx, node as ImageNode, w, h, assets.get(node.id) as HTMLImageElement | null ?? null); break;
    case "qr":
    case "barcode128": drawCode(ctx, w, h, assets.get(node.id) as HTMLCanvasElement | null ?? null); break;
  }

  ctx.restore();
}

function drawLine(ctx: CanvasRenderingContext2D, node: LineNode, pxPerUnit: number) {
  ctx.save();
  ctx.strokeStyle = node.style.stroke;
  ctx.lineWidth = node.style.strokeWidth;
  ctx.beginPath();
  ctx.moveTo(node.x1 * pxPerUnit, node.y1 * pxPerUnit);
  ctx.lineTo(node.x2 * pxPerUnit, node.y2 * pxPerUnit);
  ctx.stroke();
  ctx.restore();
}

function drawRect(ctx: CanvasRenderingContext2D, node: RectNode, w: number, h: number, pxPerUnit: number) {
  const r = Math.min((node.style.cornerRadius || 0) * pxPerUnit, w / 2, h / 2);
  ctx.fillStyle = node.style.fill;
  roundedRect(ctx, 0, 0, w, h, r);
  ctx.fill();
  if (node.style.strokeWidth > 0) {
    ctx.strokeStyle = node.style.stroke;
    ctx.lineWidth = node.style.strokeWidth;
    ctx.stroke();
  }
}

function drawText(
  ctx: CanvasRenderingContext2D,
  node: TextNode,
  w: number,
  h: number,
  pxPerUnit: number,
  fieldValues: Record<string, string>,
  cardCode: string,
) {
  const text = resolveText(node, fieldValues, cardCode);
  if (!text) return;

  const fontSize = node.style.fontSize * pxPerUnit;
  ctx.fillStyle = node.style.color;
  ctx.font = `${fontSize}px ${node.style.fontFamily}`;
  ctx.textBaseline = "top";
  ctx.textAlign = node.style.align;

  const textX =
    node.style.align === "left" ? 0 : node.style.align === "center" ? w / 2 : w;
  const lineHeight = fontSize * 1.2;

  if (node.style.multiline && node.style.overflow === "wrap") {
    const lines = wrapText(ctx, text, w);
    lines.forEach((line, i) => {
      if (i * lineHeight <= h - lineHeight) {
        ctx.fillText(line, textX, i * lineHeight);
      }
    });
  } else {
    ctx.fillText(text, textX, 0, w);
  }
}

function drawImage(
  ctx: CanvasRenderingContext2D,
  node: ImageNode,
  w: number,
  h: number,
  img: HTMLImageElement | null,
) {
  if (!img) {
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (node.mode === "fill") {
    const ra = img.naturalWidth / img.naturalHeight;
    const rn = w / h;
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if (ra > rn) {
      sw = img.naturalHeight * rn;
      sx = (img.naturalWidth - sw) / 2;
    } else {
      sh = img.naturalWidth / rn;
      sy = (img.naturalHeight - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  } else {
    const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
}

function drawCode(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  src: HTMLCanvasElement | null,
) {
  if (!src) {
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(0, 0, w, h);
    return;
  }
  ctx.drawImage(src, 0, 0, w, h);
}

// ─── Async asset loaders ──────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function renderQR(value: string, size: number): Promise<HTMLCanvasElement> {
  const QRCode = await import("qrcode");
  const c = document.createElement("canvas");
  await QRCode.toCanvas(c, value, { width: size, margin: 1 });
  return c;
}

async function renderBarcode(value: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const { default: JsBarcode } = await import("jsbarcode");
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  JsBarcode(c, value, {
    format: "CODE128",
    width: Math.max(1, width / (value.length * 11 + 35)),
    height: height - 10,
    displayValue: false,
    margin: 4,
  });
  return c;
}

// ─── Content resolvers ────────────────────────────────────────────────────────

function resolveText(
  node: TextNode,
  fieldValues: Record<string, string>,
  cardCode: string,
): string {
  const c = node.content;
  if (c.source === "static") return c.staticValue ?? "";
  if (c.source === "card_code") return cardCode;
  return fieldValues[c.fieldDefinitionId] ?? "";
}

function resolveCode(
  node: QrNode | Barcode128Node,
  fieldValues: Record<string, string>,
  cardCode: string,
): string {
  const c = node.content;
  if (c.source === "static") return (c as { staticValue?: string }).staticValue ?? "";
  if (c.source === "card_code") return cardCode;
  return fieldValues[(c as { fieldDefinitionId: string }).fieldDefinitionId] ?? "";
}

function resolveImageUrl(
  node: ImageNode,
  photoValues: Record<string, string>,
  staticImageUrls: Record<string, string>,
): string {
  const c = node.content;
  if (c.source === "static") {
    const key = (c as { staticObjectKey?: string }).staticObjectKey;
    if (key && staticImageUrls[key]) return staticImageUrls[key];
    return (c as { staticUrl?: string }).staticUrl ?? "";
  }
  if (c.source === "field") return photoValues[c.fieldDefinitionId] ?? "";
  return "";
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [""];
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (r <= 0) { ctx.rect(x, y, w, h); return; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

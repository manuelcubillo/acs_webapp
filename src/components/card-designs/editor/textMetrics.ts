/**
 * textMetrics — measures rendered text dimensions using a shared offscreen
 * 2D canvas so we can auto-size text nodes to fit their content.
 *
 * All measurements are returned in canvas pixels and converted by callers
 * back into design units.
 */

let measureCtx: CanvasRenderingContext2D | null = null;

function getCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (measureCtx) return measureCtx;
  const canvas = document.createElement("canvas");
  measureCtx = canvas.getContext("2d");
  return measureCtx;
}

export interface MeasureInput {
  /** Text to measure (newlines treated as hard line breaks). */
  text: string;
  /** Font size in canvas pixels. */
  fontSizePx: number;
  /** Font family (must match the rendered Konva text). */
  fontFamily: string;
  /** When true, soft-wraps long lines at maxWidthPx (approx word wrap). */
  wrap?: boolean;
  /** Optional max width in canvas pixels for soft-wrap mode. */
  maxWidthPx?: number;
}

export interface TextSize {
  /** Tight content width (canvas pixels). */
  width: number;
  /** Tight content height (canvas pixels). */
  height: number;
}

const LINE_HEIGHT_RATIO = 1.3;
const HORIZONTAL_PADDING = 4; // matches Konva's default text padding visually

/**
 * Returns the tight bounding size for the given text under the given style.
 *
 * Returns at least 1×1 canvas pixel so a node never collapses to zero.
 */
export function measureText({
  text,
  fontSizePx,
  fontFamily,
  wrap,
  maxWidthPx,
}: MeasureInput): TextSize {
  const ctx = getCtx();
  // Empty string → caret-sized box so the user can still see/select the node.
  const safeText = text.length > 0 ? text : " ";

  if (!ctx) {
    // Server-side fallback — rough heuristic.
    const lines = safeText.split("\n");
    return {
      width: Math.max(1, Math.max(...lines.map((l) => l.length)) * fontSizePx * 0.55),
      height: Math.max(1, lines.length * fontSizePx * LINE_HEIGHT_RATIO),
    };
  }

  ctx.font = `${fontSizePx}px ${fontFamily}`;

  const paragraphs = safeText.split("\n");
  const lines: string[] = [];

  if (wrap && maxWidthPx && maxWidthPx > 0) {
    for (const paragraph of paragraphs) {
      const words = paragraph.split(" ");
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width > maxWidthPx && line) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      lines.push(line);
    }
  } else {
    lines.push(...paragraphs);
  }

  const widest = lines.reduce(
    (max, line) => Math.max(max, ctx.measureText(line).width),
    0,
  );

  return {
    width: Math.max(1, widest + HORIZONTAL_PADDING),
    height: Math.max(1, lines.length * fontSizePx * LINE_HEIGHT_RATIO),
  };
}

/**
 * Card Design Export Size
 *
 * Pure conversion helpers for the physical (centimetre) size of a DOWNLOADED
 * card image. This is export-only: it never touches the editor canvas, the
 * stored `layout` jsonb, the `width_units` / `height_units` / `unit` columns,
 * or the on-screen preview.
 *
 * A design stores `outputWidthCm` / `outputHeightCm` (both NULL = legacy export
 * behaviour) plus `outputLockAspect`, which only drives the editor UI.
 *
 * Dependency-free on purpose — imported by the renderer, the editor UI and the
 * Server Action boundary alike, and directly unit-testable.
 */

/** Fixed rasterisation density used ONLY when generating a downloadable card image. */
export const EXPORT_DPI = 300;
export const CM_PER_INCH = 2.54;

/**
 * Guards to keep the exported raster within sane bounds.
 * MAX_EXPORT_CM * (EXPORT_DPI / CM_PER_INCH) ~= 3543 px at 30 cm.
 */
export const MIN_EXPORT_CM = 0.5;
export const MAX_EXPORT_CM = 30;

/** Convert a centimetre length to integer pixels at the fixed export density. */
export function cmToPx(cm: number): number {
  return Math.round((cm / CM_PER_INCH) * EXPORT_DPI);
}

/** True only when BOTH cm dimensions are present and valid (export is enabled). */
export function hasExportSize(
  widthCm: number | null | undefined,
  heightCm: number | null | undefined,
): widthCm is number {
  return (
    typeof widthCm === "number" &&
    typeof heightCm === "number" &&
    widthCm >= MIN_EXPORT_CM &&
    heightCm >= MIN_EXPORT_CM
  );
}

/**
 * Design aspect ratio (width / height); falls back to 1 if dimensions are
 * missing. Unit-agnostic — the ratio of two mm values equals the ratio of the
 * same design expressed in px.
 */
export function designAspect(widthUnits: number, heightUnits: number): number {
  return heightUnits > 0 ? widthUnits / heightUnits : 1;
}

/**
 * Clamp a centimetre value into the accepted export range.
 * NaN (an unparseable draft string) collapses to the minimum; ±Infinity
 * clamps to the corresponding bound.
 */
export function clampExportCm(cm: number): number {
  if (Number.isNaN(cm)) return MIN_EXPORT_CM;
  return Math.min(MAX_EXPORT_CM, Math.max(MIN_EXPORT_CM, cm));
}

/** Round a centimetre value to the 2 decimals the DB column stores. */
export function roundExportCm(cm: number): number {
  return Math.round(cm * 100) / 100;
}

/**
 * Derive the counterpart dimension from the design's aspect ratio.
 * Used by the padlock: editing one cm value recomputes the other so the two
 * stay linked to the design's proportions.
 */
export function heightFromWidthCm(widthCm: number, aspect: number): number {
  return clampExportCm(roundExportCm(widthCm / (aspect > 0 ? aspect : 1)));
}

/** Inverse of `heightFromWidthCm`. */
export function widthFromHeightCm(heightCm: number, aspect: number): number {
  return clampExportCm(roundExportCm(heightCm * (aspect > 0 ? aspect : 1)));
}

/** Raster dimensions plus the per-axis scales that map design px onto them. */
export interface OutputRaster {
  canvasW: number;
  canvasH: number;
  scaleX: number;
  scaleY: number;
}

/**
 * Resolve the output raster for a render.
 *
 * Two paths, one drawing routine:
 *   - No (or incomplete) `output` → the legacy uniform `scale` on both axes.
 *     Byte-for-byte the pre-export behaviour.
 *   - A complete `output` → the design is stretched to fill the requested
 *     physical size. Locked to the design's aspect ratio the two scales match
 *     and nothing distorts; unlocked they differ and the content stretches.
 *
 * @param baseW  Design width in px at scale 1.
 * @param baseH  Design height in px at scale 1.
 * @param scale  Legacy uniform multiplier (2 = retina).
 */
export function resolveOutputRaster(
  baseW: number,
  baseH: number,
  scale: number,
  output?: { widthCm: number; heightCm: number } | null,
): OutputRaster {
  if (!output || !hasExportSize(output.widthCm, output.heightCm)) {
    return {
      canvasW: baseW * scale,
      canvasH: baseH * scale,
      scaleX: scale,
      scaleY: scale,
    };
  }

  const canvasW = cmToPx(output.widthCm);
  const canvasH = cmToPx(output.heightCm);
  return {
    canvasW,
    canvasH,
    // Defensive: a zero-sized design must not produce a NaN transform.
    scaleX: baseW > 0 ? canvasW / baseW : scale,
    scaleY: baseH > 0 ? canvasH / baseH : scale,
  };
}

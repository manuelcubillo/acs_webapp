/**
 * Unit tests for the card-design export size conversions.
 *
 * Pure logic, no database and no canvas. These helpers run in three places —
 * the renderer (raster dimensions), the properties panel (padlock maths) and
 * the Server Action boundary (bounds) — so a regression here silently produces
 * a downloaded PNG of the wrong physical size.
 */

import { describe, it, expect } from "vitest";
import {
  CM_PER_INCH,
  EXPORT_DPI,
  MAX_EXPORT_CM,
  MIN_EXPORT_CM,
  clampExportCm,
  cmToPx,
  designAspect,
  hasExportSize,
  heightFromWidthCm,
  resolveOutputRaster,
  roundExportCm,
  widthFromHeightCm,
} from "../export-size";

describe("cmToPx", () => {
  it("converts at the fixed 300 DPI density", () => {
    expect(EXPORT_DPI).toBe(300);
    expect(CM_PER_INCH).toBe(2.54);
    // 2.54 cm = 1 inch = 300 px
    expect(cmToPx(2.54)).toBe(300);
  });

  it("matches the CR80 card reference values", () => {
    // 85.6 × 54 mm — the default "card" design footprint.
    expect(cmToPx(8.56)).toBe(1011);
    expect(cmToPx(5.4)).toBe(638);
  });

  it("returns whole pixels", () => {
    expect(Number.isInteger(cmToPx(10))).toBe(true);
    expect(Number.isInteger(cmToPx(7.77))).toBe(true);
  });

  it("stays inside the guarded raster bound", () => {
    expect(cmToPx(MAX_EXPORT_CM)).toBe(3543);
  });
});

describe("hasExportSize", () => {
  it("requires both dimensions", () => {
    expect(hasExportSize(8.56, 5.4)).toBe(true);
    expect(hasExportSize(8.56, null)).toBe(false);
    expect(hasExportSize(null, 5.4)).toBe(false);
    expect(hasExportSize(null, null)).toBe(false);
    expect(hasExportSize(undefined, undefined)).toBe(false);
  });

  it("rejects values below the minimum", () => {
    expect(hasExportSize(MIN_EXPORT_CM, MIN_EXPORT_CM)).toBe(true);
    expect(hasExportSize(0.4, 5)).toBe(false);
    expect(hasExportSize(5, 0)).toBe(false);
    expect(hasExportSize(-1, -1)).toBe(false);
  });
});

describe("designAspect", () => {
  it("is unit-agnostic", () => {
    // 85.6 × 54 mm and the same design in px yield the same ratio.
    expect(designAspect(85.6, 54)).toBeCloseTo(designAspect(856, 540), 10);
  });

  it("falls back to 1 when the height is missing", () => {
    // Defensive: a corrupt design row must not divide by zero.
    expect(designAspect(85.6, 0)).toBe(1);
    expect(designAspect(85.6, -5)).toBe(1);
  });
});

describe("clampExportCm / roundExportCm", () => {
  it("clamps into the accepted range", () => {
    expect(clampExportCm(0)).toBe(MIN_EXPORT_CM);
    expect(clampExportCm(999)).toBe(MAX_EXPORT_CM);
    expect(clampExportCm(8.56)).toBe(8.56);
  });

  it("collapses NaN to the minimum and clamps infinities", () => {
    expect(clampExportCm(NaN)).toBe(MIN_EXPORT_CM);
    expect(clampExportCm(Infinity)).toBe(MAX_EXPORT_CM);
    expect(clampExportCm(-Infinity)).toBe(MIN_EXPORT_CM);
  });

  it("rounds to the 2 decimals the column stores", () => {
    expect(roundExportCm(5.4045)).toBe(5.4);
    expect(roundExportCm(5.406)).toBe(5.41);
  });
});

describe("aspect-linked dimensions", () => {
  const aspect = designAspect(85.6, 54);

  it("derives the height from the width (CR80: 8.56 → 5.4)", () => {
    expect(heightFromWidthCm(8.56, aspect)).toBe(5.4);
  });

  it("derives the width from the height", () => {
    expect(widthFromHeightCm(5.4, aspect)).toBe(8.56);
  });

  it("clamps a derived value that would fall out of range", () => {
    // A very wide design would push the derived height under the minimum.
    expect(heightFromWidthCm(MAX_EXPORT_CM, designAspect(1000, 1))).toBe(
      MIN_EXPORT_CM,
    );
    expect(widthFromHeightCm(MAX_EXPORT_CM, designAspect(1000, 1))).toBe(
      MAX_EXPORT_CM,
    );
  });

  it("never divides by zero on a degenerate aspect", () => {
    expect(heightFromWidthCm(8.56, 0)).toBe(8.56);
    expect(widthFromHeightCm(5.4, 0)).toBe(5.4);
  });
});

describe("resolveOutputRaster", () => {
  // 85.6 × 54 mm at 96 DPI — what render.ts computes for a CR80 design.
  const BASE_W = 324;
  const BASE_H = 204;

  it("keeps the legacy uniform scale when no output size is given", () => {
    // This is the regression guard: an unconfigured design must produce the
    // exact dimensions and transform the renderer produced before export
    // sizes existed (canvas = base × scale, one uniform scale).
    for (const output of [undefined, null]) {
      expect(resolveOutputRaster(BASE_W, BASE_H, 2, output)).toEqual({
        canvasW: 648,
        canvasH: 408,
        scaleX: 2,
        scaleY: 2,
      });
    }
  });

  it("ignores a half-set output size", () => {
    // Both-or-neither is enforced upstream; the renderer refuses to guess.
    expect(
      resolveOutputRaster(BASE_W, BASE_H, 2, {
        widthCm: 8.56,
        heightCm: 0,
      }),
    ).toEqual({ canvasW: 648, canvasH: 408, scaleX: 2, scaleY: 2 });
  });

  it("rasterises to the requested physical size at 300 DPI", () => {
    const raster = resolveOutputRaster(BASE_W, BASE_H, 2, {
      widthCm: 8.56,
      heightCm: 5.4,
    });
    expect(raster.canvasW).toBe(1011);
    expect(raster.canvasH).toBe(638);
    // Aspect-locked → effectively uniform. Not bit-identical: the artboard px
    // are rounded (85.6mm → 324px) and the target px are rounded again, so a
    // sub-percent difference survives. Well under anything visible.
    const skew = Math.abs(raster.scaleX / raster.scaleY - 1);
    expect(skew).toBeLessThan(0.01);
  });

  it("stretches on independent axes when the ratio is unlocked", () => {
    const raster = resolveOutputRaster(BASE_W, BASE_H, 2, {
      widthCm: 10,
      heightCm: 6,
    });
    expect(raster.canvasW).toBe(1181);
    expect(raster.canvasH).toBe(709);
    // 10 × 6 cm (ratio 1.667) on a 1.588 design → ~4.9% stretch, by design.
    // An order of magnitude above the locked case's rounding skew.
    const skew = Math.abs(raster.scaleX / raster.scaleY - 1);
    expect(skew).toBeGreaterThan(0.02);
  });

  it("falls back to the uniform scale on a zero-sized design", () => {
    // Defensive: a NaN transform would blank the whole export.
    const raster = resolveOutputRaster(0, 0, 2, { widthCm: 8.56, heightCm: 5.4 });
    expect(raster.scaleX).toBe(2);
    expect(raster.scaleY).toBe(2);
  });
});

/**
 * Image Optimization — Browser-side pipeline
 *
 * Reads the input File, optionally centre-crops to `cropAspect`, resizes
 * to fit `maxWidth`/`maxHeight`, encodes to `targetFormat`, and recompresses
 * iteratively until the output is at or below `maxOutputBytes`.
 *
 * EXIF is dropped automatically — re-encoding via `<canvas>.toBlob` does
 * not preserve EXIF segments, so the `stripExif: true` flag is informational.
 *
 * This module runs in the browser only. Do not import from a server file.
 */

import { ALLOWED_INPUT_MIME, type AllowedInputMime } from "@/lib/storage/types";
import { ImageTooLargeError, UnsupportedImageError } from "./errors";
import type { ImageOptimizationProfile, OptimizedImage } from "./types";

const QUALITY_RETRY_STEPS = [0, -0.1, -0.2, -0.3];

export async function optimizeImage(
  file: File,
  profile: ImageOptimizationProfile,
): Promise<OptimizedImage> {
  if (!ALLOWED_INPUT_MIME.includes(file.type as AllowedInputMime)) {
    throw new UnsupportedImageError(
      `Tipo de imagen no soportado: ${file.type || "desconocido"}`,
    );
  }

  const bitmap = await loadBitmap(file);
  try {
    const cropped = profile.cropAspect
      ? cropToAspect(bitmap, profile.cropAspect)
      : { sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height };

    const { width, height } = fitWithin(
      cropped.sw,
      cropped.sh,
      profile.maxWidth,
      profile.maxHeight,
    );

    const canvas = drawToCanvas(bitmap, cropped, width, height);

    for (const delta of QUALITY_RETRY_STEPS) {
      const q = clamp(profile.quality + delta, 0.4, 1);
      const blob = await canvasToBlob(canvas, profile.targetFormat, q);
      if (!blob) continue;
      if (blob.size <= profile.maxOutputBytes) {
        return {
          blob,
          width,
          height,
          bytes: blob.size,
          mimeType: profile.targetFormat,
        };
      }
    }

    throw new ImageTooLargeError(
      "La imagen sigue siendo demasiado grande tras la optimización",
    );
  } finally {
    bitmap.close?.();
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function loadBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new UnsupportedImageError("No se pudo decodificar la imagen");
  }
}

function cropToAspect(
  bitmap: ImageBitmap,
  aspect: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const srcAspect = bitmap.width / bitmap.height;
  if (Math.abs(srcAspect - aspect) < 0.001) {
    return { sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height };
  }
  if (srcAspect > aspect) {
    // Too wide → crop horizontally.
    const sw = Math.round(bitmap.height * aspect);
    const sx = Math.round((bitmap.width - sw) / 2);
    return { sx, sy: 0, sw, sh: bitmap.height };
  }
  // Too tall → crop vertically.
  const sh = Math.round(bitmap.width / aspect);
  const sy = Math.round((bitmap.height - sh) / 2);
  return { sx: 0, sy, sw: bitmap.width, sh };
}

function fitWithin(
  sw: number,
  sh: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  const ratio = Math.min(maxW / sw, maxH / sh, 1);
  return {
    width: Math.max(1, Math.round(sw * ratio)),
    height: Math.max(1, Math.round(sh * ratio)),
  };
}

function drawToCanvas(
  bitmap: ImageBitmap,
  src: { sx: number; sy: number; sw: number; sh: number },
  dw: number,
  dh: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new UnsupportedImageError("Canvas 2D no disponible");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, src.sx, src.sy, src.sw, src.sh, 0, 0, dw, dh);
  return canvas;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

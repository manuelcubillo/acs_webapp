/**
 * Image Optimization — Types
 *
 * `ImageOptimizationProfile` is the per-call-site configuration. Profiles
 * live in `profiles.ts` and are imported by the surface that owns the kind
 * (card photo input, member-avatar settings, tenant-logo settings, etc.).
 */

import type { AllowedOutputMime, PhotoKind } from "@/lib/storage/types";

export interface ImageOptimizationProfile {
  kind: PhotoKind;
  /** Hard cap on output width (px). */
  maxWidth: number;
  /** Hard cap on output height (px). */
  maxHeight: number;
  /** Output format the client encodes to. */
  targetFormat: AllowedOutputMime;
  /** Encoder quality (0..1). Used as the starting point for the size loop. */
  quality: number;
  /** Hard cap on output bytes; the encoder retries with lower quality. */
  maxOutputBytes: number;
  /** EXIF strip is always on. Declared for readability. */
  stripExif: true;
  /** Optional centre-crop ratio (e.g. 1 for square avatars). */
  cropAspect?: number;
}

export interface OptimizedImage {
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
  mimeType: AllowedOutputMime;
}

/**
 * A crop region expressed in source-image pixel coordinates. This is the exact
 * shape `react-easy-crop` reports as `croppedAreaPixels`, so an interactive
 * cropper can hand its result straight to `optimizeImage`.
 */
export interface PixelCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Per-call overrides for the optimization pipeline. Kept separate from the
 * per-kind `ImageOptimizationProfile` because these come from user interaction
 * (an interactive crop), not from the fixed storage policy of a photo kind.
 */
export interface OptimizeOptions {
  /**
   * Explicit source-pixel crop region (e.g. from an interactive cropper).
   * When present it overrides the profile's centre-crop `cropAspect`.
   */
  cropRect?: PixelCropRect;
}

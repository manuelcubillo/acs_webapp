/**
 * Image Optimization — Per-kind profiles
 *
 * Each photo surface owns one profile. Resize ceilings, output format,
 * starting quality and the max-bytes cap are tuned per use case.
 *
 * Tweak these values to globally change how that kind of photo is stored.
 */

import type { ImageOptimizationProfile } from "./types";

export const CARD_PHOTO_PROFILE: ImageOptimizationProfile = {
  kind: "card-photo",
  maxWidth: 800,
  maxHeight: 1000,
  targetFormat: "image/webp",
  quality: 0.82,
  maxOutputBytes: 180 * 1024,
  stripExif: true,
};

export const MEMBER_AVATAR_PROFILE: ImageOptimizationProfile = {
  kind: "member-avatar",
  maxWidth: 256,
  maxHeight: 256,
  targetFormat: "image/webp",
  quality: 0.85,
  maxOutputBytes: 60 * 1024,
  stripExif: true,
  cropAspect: 1,
};

export const TENANT_LOGO_PROFILE: ImageOptimizationProfile = {
  kind: "tenant-logo",
  maxWidth: 512,
  maxHeight: 512,
  targetFormat: "image/webp",
  quality: 0.9,
  maxOutputBytes: 120 * 1024,
  stripExif: true,
};

export const CARD_DESIGN_IMAGE_PROFILE: ImageOptimizationProfile = {
  kind: "card-design-image",
  maxWidth: 1200,
  maxHeight: 1200,
  targetFormat: "image/webp",
  quality: 0.85,
  maxOutputBytes: 300 * 1024,
  stripExif: true,
};

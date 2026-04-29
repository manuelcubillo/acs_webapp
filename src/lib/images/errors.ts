/**
 * Image Optimization — Errors
 *
 * Surface-friendly errors so the UI can show a precise reason without
 * leaking implementation details.
 */

export class UnsupportedImageError extends Error {
  constructor(message = "Unsupported image format") {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

export class ImageTooLargeError extends Error {
  constructor(message = "Image exceeds the maximum allowed size") {
    super(message);
    this.name = "ImageTooLargeError";
  }
}

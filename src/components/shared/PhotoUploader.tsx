"use client";

/**
 * PhotoUploader — shared component for every photo surface.
 *
 * Responsibilities:
 *  1. Obtain a source image, either by file pick or (opt-in) webcam capture.
 *  2. Optionally route it through an interactive crop step.
 *  3. Run it through the kind's `ImageOptimizationProfile` (resize / WebP /
 *     EXIF strip / size cap), applying the crop rect when present.
 *  4. Request a presigned PUT from `requestPhotoUploadUrlAction`.
 *  5. PUT the optimized blob directly to the storage bucket.
 *  6. Confirm via `confirmPhotoUploadAction` and report `{ key, readUrl }`.
 *
 * The webcam and crop capabilities are opt-in via `enableWebcam` / `enableCrop`
 * so surfaces that only need a plain file upload (avatar, tenant logo, design
 * image) keep their exact prior behaviour. Card photos turn both on.
 *
 * The component does NOT persist the key on the owning row — that is the
 * responsibility of the surface that owns the kind (card form, settings page,
 * card design editor). The parent receives the key + signed read URL via
 * `onChange` and decides what to write where.
 *
 * The `<img>` src and dimensions are runtime data — preserved inline. All
 * other chrome uses tokens + shadcn primitives.
 */

import { useRef, useState } from "react";
import { Camera, ImageIcon, Loader2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CARD_DESIGN_IMAGE_PROFILE,
  CARD_PHOTO_PROFILE,
  MEMBER_AVATAR_PROFILE,
  TENANT_LOGO_PROFILE,
  optimizeImage,
  type ImageOptimizationProfile,
  type PixelCropRect,
} from "@/lib/images";
import {
  confirmPhotoUploadAction,
  requestPhotoUploadUrlAction,
} from "@/lib/actions/uploads";
import type { PhotoKind } from "@/lib/storage/types";
import WebcamCaptureDialog from "@/components/shared/WebcamCaptureDialog";
import ImageCropDialog from "@/components/shared/ImageCropDialog";

const TEXT = {
  uploadCta:       "Subir foto",
  webcamCta:       "Tomar foto",
  uploading:       "Subiendo…",
  optimizing:      "Optimizando…",
  remove:          "Quitar",
  uploadFailed:    "No se pudo subir la imagen",
  defaultAlt:      "Foto",
} as const;

const PROFILE_BY_KIND: Record<PhotoKind, ImageOptimizationProfile> = {
  "card-photo":         CARD_PHOTO_PROFILE,
  "card-design-image":  CARD_DESIGN_IMAGE_PROFILE,
  "member-avatar":      MEMBER_AVATAR_PROFILE,
  "tenant-logo":        TENANT_LOGO_PROFILE,
};

export interface PhotoUploaderValue {
  /** Object key as stored in the bucket. */
  objectKey: string;
  /** Signed read URL valid for ~15 min, ready to render. */
  readUrl: string;
}

interface Props {
  kind: PhotoKind;
  /** UUID of the entity that owns the photo (cardId, designId, userId, tenantId). */
  ownerId: string;
  /** Current persisted object key (informational only). */
  currentObjectKey?: string | null;
  /** Current signed read URL to preview alongside the upload control. */
  currentReadUrl?: string | null;
  /** Override the kind's default profile (rare). */
  profile?: ImageOptimizationProfile;
  /** Visual aspect of the preview thumbnail (CSS aspect-ratio). Default 1. */
  previewAspect?: number;
  /** Pixel size of the preview thumbnail. Default 120. */
  previewSize?: number;
  /** Disable interactions. */
  disabled?: boolean;
  /** Hide the explicit "remove" affordance. */
  allowRemove?: boolean;
  /** Offer a "take photo with webcam" source in addition to file upload. */
  enableWebcam?: boolean;
  /** Show an interactive crop step after a photo is picked or captured. */
  enableCrop?: boolean;
  /** Called whenever the value changes. `null` means the photo was removed. */
  onChange: (value: PhotoUploaderValue | null) => void;
  /** Optional alt text for the preview image. */
  alt?: string;
}

export default function PhotoUploader({
  kind,
  ownerId,
  currentReadUrl,
  profile,
  previewAspect = 1,
  previewSize = 120,
  disabled = false,
  allowRemove = true,
  enableWebcam = false,
  enableCrop = false,
  onChange,
  alt,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"idle" | "optimizing" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);

  // Webcam + crop dialog state.
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const activeProfile = profile ?? PROFILE_BY_KIND[kind];

  /**
   * Entry point for a source image (from file pick or webcam). Routes through
   * the crop step when enabled, otherwise straight to the upload pipeline.
   */
  function beginWithFile(file: File) {
    setError(null);
    if (enableCrop) {
      setPendingFile(file);
      setCropOpen(true);
    } else {
      void runUploadPipeline(file);
    }
  }

  /** Optimize (optionally cropped) → presign → PUT → confirm → report. */
  async function runUploadPipeline(file: File, cropRect?: PixelCropRect) {
    setError(null);
    try {
      setBusy("optimizing");
      const optimized = await optimizeImage(
        file,
        activeProfile,
        cropRect ? { cropRect } : undefined,
      );

      setBusy("uploading");
      const reqResult = await requestPhotoUploadUrlAction({
        kind,
        ownerId,
        contentType: optimized.mimeType,
        contentLength: optimized.bytes,
      });
      if (!reqResult.success) {
        throw new Error(reqResult.error ?? TEXT.uploadFailed);
      }

      const putRes = await fetch(reqResult.data.uploadUrl, {
        method: "PUT",
        body: optimized.blob,
        headers: reqResult.data.requiredHeaders,
      });
      if (!putRes.ok) {
        throw new Error(`${TEXT.uploadFailed} (${putRes.status})`);
      }

      const confirmResult = await confirmPhotoUploadAction({
        kind,
        ownerId,
        key: reqResult.data.key,
      });
      if (!confirmResult.success) {
        throw new Error(confirmResult.error ?? TEXT.uploadFailed);
      }

      onChange({
        objectKey: confirmResult.data.key,
        readUrl: confirmResult.data.readUrl,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : TEXT.uploadFailed;
      setError(msg);
    } finally {
      setBusy("idle");
    }
  }

  const isBusy = busy !== "idle";
  const previewWidth = Math.round(previewSize * previewAspect);

  // data-driven — preview tile dimensions come from per-call props at runtime.
  const previewDimensionStyle: React.CSSProperties = {
    width: previewWidth,
    height: previewSize,
  };

  const openFilePicker = () => {
    if (!disabled && !isBusy) inputRef.current?.click();
  };

  const busyOverlay = (
    <div className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-xl bg-neutral-950/40 text-xs font-semibold text-white">
      <Loader2 className="size-4 animate-spin" />
      {busy === "optimizing" ? TEXT.optimizing : TEXT.uploading}
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) beginWithFile(f);
          e.target.value = "";
        }}
      />

      {currentReadUrl ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentReadUrl}
            alt={alt ?? TEXT.defaultAlt}
            style={previewDimensionStyle}
            className={cn(
              "block rounded-xl border border-border object-cover",
              isBusy && "opacity-50",
            )}
          />
          {allowRemove && !disabled && !isBusy && (
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label={TEXT.remove}
              title={TEXT.remove}
              className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition-shadow hover:shadow-md"
            >
              <X className="size-3" strokeWidth={2.5} />
            </button>
          )}
          {/* Legacy inline "change photo" affordance — only when the explicit
              source buttons below are absent (non-webcam surfaces). */}
          {!enableWebcam && !disabled && !isBusy && (
            <button
              type="button"
              onClick={openFilePicker}
              className="absolute bottom-1.5 right-1.5 rounded-md bg-neutral-950/65 px-2.5 py-1 text-[11px] font-semibold text-white"
            >
              {TEXT.uploadCta}
            </button>
          )}
          {isBusy && busyOverlay}
        </div>
      ) : enableWebcam ? (
        // Webcam surfaces: non-interactive placeholder; actions are the
        // explicit buttons rendered below.
        <div
          style={previewDimensionStyle}
          className={cn(
            "relative flex items-center justify-center rounded-xl border-2 border-dashed",
            "bg-muted/40 text-muted-foreground",
            error && "border-destructive",
          )}
        >
          {isBusy ? busyOverlay : <ImageIcon className="size-6" />}
        </div>
      ) : (
        // Legacy surfaces: the dashed box itself is the upload button.
        <Button
          type="button"
          variant="outline"
          onClick={openFilePicker}
          disabled={disabled || isBusy}
          style={previewDimensionStyle}
          className={cn(
            "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed",
            "bg-muted/40 text-xs font-medium text-muted-foreground hover:bg-muted",
            error && "border-destructive",
          )}
        >
          {isBusy ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              {busy === "optimizing" ? TEXT.optimizing : TEXT.uploading}
            </>
          ) : (
            <>
              <Upload className="size-5" />
              {TEXT.uploadCta}
            </>
          )}
        </Button>
      )}

      {/* Explicit, clearly-distinguished source choices (webcam surfaces). */}
      {enableWebcam && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openFilePicker}
            disabled={disabled || isBusy}
          >
            <Upload className="size-4" />
            {TEXT.uploadCta}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => !disabled && !isBusy && setWebcamOpen(true)}
            disabled={disabled || isBusy}
          >
            <Camera className="size-4" />
            {TEXT.webcamCta}
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Webcam capture — captured still is routed into the crop step. */}
      {enableWebcam && (
        <WebcamCaptureDialog
          open={webcamOpen}
          onCapture={(file) => {
            setWebcamOpen(false);
            beginWithFile(file);
          }}
          onCancel={() => setWebcamOpen(false)}
        />
      )}

      {/* Crop step — shared by both sources. */}
      {enableCrop && (
        <ImageCropDialog
          file={pendingFile}
          open={cropOpen}
          onConfirm={(file, cropRect) => {
            setCropOpen(false);
            setPendingFile(null);
            void runUploadPipeline(file, cropRect);
          }}
          onCancel={() => {
            setCropOpen(false);
            setPendingFile(null);
          }}
        />
      )}
    </div>
  );
}

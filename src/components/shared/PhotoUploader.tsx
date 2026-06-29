"use client";

/**
 * PhotoUploader — shared component for every photo surface.
 *
 * Responsibilities:
 *  1. Read the user's File and run it through the kind's `ImageOptimizationProfile`.
 *  2. Request a presigned PUT from `requestPhotoUploadUrlAction`.
 *  3. PUT the optimized blob directly to the storage bucket.
 *  4. Confirm via `confirmPhotoUploadAction` and report `{ key, readUrl }` to the parent.
 *
 * The component does NOT persist the key on the owning row — that is the
 * responsibility of the surface that owns the kind (card form, settings page,
 * card design editor). The parent receives the key + signed read URL via
 * `onChange` and decides what to write where.
 *
 * The `<img>` src and dimensions are runtime data — preserved inline. All
 * other chrome migrates to tokens.
 */

import { useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CARD_DESIGN_IMAGE_PROFILE,
  CARD_PHOTO_PROFILE,
  MEMBER_AVATAR_PROFILE,
  TENANT_LOGO_PROFILE,
  optimizeImage,
  type ImageOptimizationProfile,
} from "@/lib/images";
import {
  confirmPhotoUploadAction,
  requestPhotoUploadUrlAction,
} from "@/lib/actions/uploads";
import type { PhotoKind } from "@/lib/storage/types";

const TEXT = {
  uploadCta:       "Subir foto",
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
  onChange,
  alt,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"idle" | "optimizing" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);

  const activeProfile = profile ?? PROFILE_BY_KIND[kind];

  async function handleFile(file: File) {
    setError(null);
    try {
      setBusy("optimizing");
      const optimized = await optimizeImage(file, activeProfile);

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

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
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
          {!disabled && !isBusy && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="absolute bottom-1.5 right-1.5 rounded-md bg-neutral-950/65 px-2.5 py-1 text-[11px] font-semibold text-white"
            >
              {TEXT.uploadCta}
            </button>
          )}
          {isBusy && (
            <div className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-xl bg-neutral-950/40 text-xs font-semibold text-white">
              <Loader2 className="size-4 animate-spin" />
              {busy === "optimizing" ? TEXT.optimizing : TEXT.uploading}
            </div>
          )}
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => !disabled && !isBusy && inputRef.current?.click()}
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

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

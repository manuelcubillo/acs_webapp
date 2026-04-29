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
 */

import { useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
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
  uploadCta: "Subir foto",
  uploading: "Subiendo…",
  optimizing: "Optimizando…",
  remove: "Quitar",
  uploadFailed: "No se pudo subir la imagen",
  optimizeFailed: "No se pudo optimizar la imagen",
} as const;

const PROFILE_BY_KIND: Record<PhotoKind, ImageOptimizationProfile> = {
  "card-photo": CARD_PHOTO_PROFILE,
  "card-design-image": CARD_DESIGN_IMAGE_PROFILE,
  "member-avatar": MEMBER_AVATAR_PROFILE,
  "tenant-logo": TENANT_LOGO_PROFILE,
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
  /** Current persisted object key (for re-upload state) — purely informational. */
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />

      {currentReadUrl ? (
        <div style={{ position: "relative", display: "inline-block" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentReadUrl}
            alt={alt ?? "Foto"}
            style={{
              width: previewWidth,
              height: previewSize,
              objectFit: "cover",
              borderRadius: 10,
              border: "1px solid var(--color-border)",
              display: "block",
              opacity: isBusy ? 0.5 : 1,
            }}
          />
          {allowRemove && !disabled && !isBusy && (
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label={TEXT.remove}
              title={TEXT.remove}
              style={{
                position: "absolute",
                top: -8,
                right: -8,
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "#ef4444",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={13} />
            </button>
          )}
          {!disabled && !isBusy && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              style={{
                position: "absolute",
                bottom: 4,
                right: 4,
                padding: "4px 8px",
                borderRadius: 6,
                background: "rgba(0,0,0,0.65)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {TEXT.uploadCta}
            </button>
          )}
          {isBusy && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <Loader2
                size={16}
                style={{ animation: "spin 1s linear infinite" }}
              />
              {busy === "optimizing" ? TEXT.optimizing : TEXT.uploading}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => !disabled && !isBusy && inputRef.current?.click()}
          disabled={disabled || isBusy}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            width: previewWidth,
            height: previewSize,
            borderRadius: 10,
            border: `2px dashed ${error ? "#ef4444" : "var(--color-border)"}`,
            background: "var(--color-page-bg)",
            cursor: disabled || isBusy ? "default" : "pointer",
            color: "var(--color-muted)",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {isBusy ? (
            <>
              <Loader2
                size={20}
                style={{ animation: "spin 1s linear infinite" }}
              />
              {busy === "optimizing" ? TEXT.optimizing : TEXT.uploading}
            </>
          ) : (
            <>
              <Upload size={20} />
              {TEXT.uploadCta}
            </>
          )}
        </button>
      )}

      {error && (
        <span style={{ fontSize: 12, color: "#ef4444" }}>{error}</span>
      )}
    </div>
  );
}

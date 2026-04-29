"use client";

/**
 * PhotoInput — photo field input for the card form.
 *
 * `value` is the persisted object key (or null). `initialReadUrl` is the
 * signed read URL the parent supplies for existing photos so we can render
 * a preview without round-tripping through storage. After a successful
 * upload, we remember the new signed URL locally for the lifetime of this
 * form so the user keeps seeing their picture.
 *
 * Card-photo uploads need an `ownerId` (the card UUID) for key layout.
 * For new cards we generate a stable draft UUID — the server validates
 * tenant prefix + kind path, not the owner segment.
 */

import { useRef, useState } from "react";
import PhotoUploader from "@/components/shared/PhotoUploader";

interface PhotoInputProps {
  fieldId: string;
  label: string;
  value: unknown;
  onChange: (value: string | null) => void;
  isRequired?: boolean;
  error?: string;
  disabled?: boolean;
  /** Card UUID when editing an existing card; null/undefined when creating. */
  cardId?: string | null;
  /** Pre-signed URL for the current value (only when editing existing card). */
  initialReadUrl?: string | null;
}

export default function PhotoInput({
  label,
  value,
  onChange,
  isRequired,
  error,
  disabled,
  cardId,
  initialReadUrl,
}: PhotoInputProps) {
  // Stable owner id for the lifetime of this form.
  const draftOwnerRef = useRef<string>(
    cardId ?? (typeof crypto !== "undefined" ? crypto.randomUUID() : "draft"),
  );

  const [readUrl, setReadUrl] = useState<string | null>(
    initialReadUrl ?? null,
  );

  const objectKey = typeof value === "string" && value.length > 0 ? value : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}
      >
        {label}
        {isRequired && (
          <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>
        )}
      </label>

      <PhotoUploader
        kind="card-photo"
        ownerId={draftOwnerRef.current}
        currentObjectKey={objectKey}
        currentReadUrl={readUrl}
        disabled={disabled}
        alt={label}
        onChange={(v) => {
          if (v === null) {
            setReadUrl(null);
            onChange(null);
          } else {
            setReadUrl(v.readUrl);
            onChange(v.objectKey);
          }
        }}
      />

      {error && (
        <span style={{ fontSize: 12, color: "#ef4444" }}>{error}</span>
      )}
    </div>
  );
}

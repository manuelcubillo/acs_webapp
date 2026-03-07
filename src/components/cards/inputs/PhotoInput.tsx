"use client";

import { useState, useRef } from "react";
import { Upload, X } from "lucide-react";

interface PhotoInputProps {
  fieldId: string;
  label: string;
  value: unknown;
  onChange: (value: string | null) => void;
  isRequired?: boolean;
  error?: string;
  disabled?: boolean;
  tenantId?: string;
}

export default function PhotoInput({
  label,
  value,
  onChange,
  isRequired,
  error,
  disabled,
}: PhotoInputProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentUrl = value ? String(value) : null;

  async function handleFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Error al subir");
      if (json.url) onChange(json.url);
    } catch (e) {
      setUploadError(
        e instanceof Error ? e.message : "Error al subir la foto",
      );
    } finally {
      setUploading(false);
    }
  }

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

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          // Reset so the same file can be re-selected.
          e.target.value = "";
        }}
      />

      {currentUrl ? (
        <div style={{ position: "relative", display: "inline-block" }}>
          <img
            src={currentUrl}
            alt={label}
            style={{
              width: 120,
              height: 120,
              objectFit: "cover",
              borderRadius: 10,
              border: "1px solid var(--color-border)",
              display: "block",
            }}
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
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
        </div>
      ) : (
        <button
          type="button"
          onClick={() => !disabled && inputRef.current?.click()}
          disabled={disabled || uploading}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            width: 120,
            height: 120,
            borderRadius: 10,
            border: `2px dashed ${error ? "#ef4444" : "var(--color-border)"}`,
            background: "var(--color-page-bg)",
            cursor: disabled || uploading ? "default" : "pointer",
            color: "var(--color-muted)",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          <Upload size={20} />
          {uploading ? "Subiendo..." : "Subir foto"}
        </button>
      )}

      {(error || uploadError) && (
        <span style={{ fontSize: 12, color: "#ef4444" }}>
          {uploadError ?? error}
        </span>
      )}
    </div>
  );
}

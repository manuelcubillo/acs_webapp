"use client";

import { useState, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, Camera, X } from "lucide-react";
import { useExternalScanner } from "@/hooks/useExternalScanner";
import type { ScanMode } from "@/lib/dal/types";
import dynamic from "next/dynamic";

// Lazy-load heavy camera components (avoids SSR issues with html5-qrcode).
const QRScanner = dynamic(() => import("./scanner/QRScanner"), { ssr: false });
const ScannerOverlay = dynamic(
  () => import("./scanner/ScannerOverlay"),
  { ssr: false },
);

interface CardSearchProps {
  scanMode: ScanMode;
  /** Initial value (from server-rendered URL param). */
  defaultValue?: string;
  placeholder?: string;
}

export default function CardSearch({
  scanMode,
  defaultValue = "",
  placeholder = "Buscar por código...",
}: CardSearchProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState(defaultValue);
  const [showCamera, setShowCamera] = useState(false);

  const cameraEnabled = scanMode === "camera" || scanMode === "both";
  const externalEnabled = scanMode === "external_reader" || scanMode === "both";

  /** Push a new search to the URL; the server page will refetch. */
  function navigate(q: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (q.trim()) {
      params.set("q", q.trim());
    } else {
      params.delete("q");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigate(query);
  }

  function handleQRScan(code: string) {
    setShowCamera(false);
    setQuery(code);
    navigate(code);
  }

  function handleClear() {
    setQuery("");
    navigate("");
    inputRef.current?.focus();
  }

  // External scanner (barcode reader via HID keyboard injection).
  useExternalScanner({
    onScan: (code) => {
      setQuery(code);
      navigate(code);
    },
    enabled: externalEnabled,
  });

  return (
    <>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
        {/* Search input */}
        <div style={{ flex: 1, position: "relative" }}>
          <Search
            size={16}
            style={{
              position: "absolute",
              left: 11,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-muted)",
              pointerEvents: "none",
            }}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            style={{
              width: "100%",
              padding: "9px 36px",
              borderRadius: 8,
              border: "1.5px solid var(--color-border)",
              fontSize: 14,
              outline: "none",
              background: "#fff",
              color: "var(--color-dark)",
              boxSizing: "border-box",
            }}
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--color-muted)",
                display: "flex",
                alignItems: "center",
                padding: 2,
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Search button */}
        <button
          type="submit"
          style={{
            padding: "9px 18px",
            borderRadius: 8,
            background: "var(--color-primary)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          Buscar
        </button>

        {/* Camera button */}
        {cameraEnabled && (
          <button
            type="button"
            onClick={() => setShowCamera(true)}
            title="Escanear con cámara"
            style={{
              padding: "9px 14px",
              borderRadius: 8,
              background: "#f3f4f6",
              border: "1.5px solid var(--color-border)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              color: "var(--color-dark)",
            }}
          >
            <Camera size={17} strokeWidth={1.8} />
          </button>
        )}
      </form>

      {/* Camera overlay */}
      {showCamera && (
        <ScannerOverlay onClose={() => setShowCamera(false)}>
          <QRScanner onScan={handleQRScan} />
        </ScannerOverlay>
      )}
    </>
  );
}

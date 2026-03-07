"use client";

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";
import type { ScanMode } from "@/lib/dal/types";
import { useExternalScanner } from "@/hooks/useExternalScanner";

const QRScanner = dynamic(
  () => import("@/components/cards/scanner/QRScanner"),
  { ssr: false },
);

interface ScanClientProps {
  scanMode: ScanMode;
}

export default function ScanClient({ scanMode }: ScanClientProps) {
  const router = useRouter();
  const showCamera = scanMode === "camera" || scanMode === "both";
  const showExternal =
    scanMode === "external_reader" || scanMode === "both";

  function handleScan(code: string) {
    router.push(`/cards/${encodeURIComponent(code.trim())}`);
  }

  // External scanner (barcode reader).
  useExternalScanner({ onScan: handleScan, enabled: showExternal });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        padding: 24,
        maxWidth: 480,
        margin: "0 auto",
      }}
    >
      <button
        onClick={() => router.back()}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-muted)",
          fontSize: 13,
          alignSelf: "flex-start",
          padding: 0,
        }}
      >
        <ArrowLeft size={16} />
        Volver
      </button>

      <div style={{ textAlign: "center" }}>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--color-dark)",
            fontFamily: "var(--font-heading)",
            margin: "0 0 6px",
          }}
        >
          Escanear carnet
        </h2>
        <p style={{ fontSize: 13, color: "var(--color-muted)", margin: 0 }}>
          {showCamera && showExternal
            ? "Usa la cámara o pasa el lector de código de barras"
            : showCamera
              ? "Apunta la cámara al código del carnet"
              : "Pasa el lector de código de barras"}
        </p>
      </div>

      {showCamera && (
        <div
          style={{
            width: "100%",
            borderRadius: 16,
            overflow: "hidden",
            background: "#1a1d2e",
            padding: 16,
          }}
        >
          <QRScanner onScan={handleScan} />
        </div>
      )}

      {showExternal && !showCamera && (
        <div
          style={{
            padding: 40,
            borderRadius: 16,
            border: "2px dashed var(--color-border)",
            textAlign: "center",
            color: "var(--color-muted)",
            fontSize: 14,
          }}
        >
          Listo para lector externo — pasa el código
        </div>
      )}
    </div>
  );
}

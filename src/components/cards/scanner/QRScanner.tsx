"use client";

import { useEffect, useRef } from "react";
import { useQRScanner } from "@/hooks/useQRScanner";

const ELEMENT_ID = "qr-scanner-viewport";

interface QRScannerProps {
  onScan: (code: string) => void;
  onError?: (error: string) => void;
}

export default function QRScanner({ onScan, onError }: QRScannerProps) {
  const { isScanning, error, start, stop } = useQRScanner({ onScan });
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    start(ELEMENT_ID);
    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error && onError) onError(error);
  }, [error, onError]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        width: "100%",
      }}
    >
      <div
        id={ELEMENT_ID}
        style={{
          width: "100%",
          maxWidth: 400,
          borderRadius: 16,
          overflow: "hidden",
          background: "#000",
          minHeight: 300,
        }}
      />

      {!isScanning && !error && (
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: 0 }}>
          Iniciando cámara...
        </p>
      )}

      {error && (
        <p
          style={{
            fontSize: 13,
            color: "#fca5a5",
            margin: 0,
            textAlign: "center",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

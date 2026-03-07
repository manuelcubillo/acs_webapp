"use client";

import { useState, useRef, useCallback } from "react";

interface UseQRScannerOptions {
  onScan: (code: string) => void;
  enabled?: boolean;
}

/**
 * Manages an html5-qrcode scanner instance.
 *
 * html5-qrcode is loaded dynamically to avoid SSR issues.
 * Call start(elementId) to attach the scanner to a DOM element,
 * and stop() to tear it down.
 */
export function useQRScanner({ onScan, enabled = true }: UseQRScannerOptions) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const start = useCallback(
    async (elementId: string) => {
      if (!enabled || scannerRef.current) return;
      setError(null);
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode(elementId);
        // Store with only the interface we need so TypeScript is happy.
        scannerRef.current = scanner as unknown as { stop: () => Promise<void> };
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            onScanRef.current(decodedText);
          },
          undefined,
        );
        setIsScanning(true);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "No se pudo iniciar la cámara. Comprueba los permisos.",
        );
        setIsScanning(false);
        scannerRef.current = null;
      }
    },
    [enabled],
  );

  const stop = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {
        // Ignore stop errors (e.g. already stopped).
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  return { isScanning, error, start, stop };
}

"use client";

/**
 * QRScanner — html5-qrcode camera capture wrapper.
 *
 * Behavior preserved: useQRScanner lifecycle, single-start gate via
 * startedRef, ssr:false dynamic import done by the consumer.
 *
 * The viewport is intentionally dark (--neutral-950) so the live camera
 * preview reads well — this is not a brand surface.
 */

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { useQRScanner } from "@/hooks/useQRScanner";

const TEXT = {
  STARTING: "Iniciando cámara…",
} as const;

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
    <div className="flex w-full flex-col items-center gap-3.5">
      <div
        id={ELEMENT_ID}
        className={cn(
          "w-full max-w-sm min-h-[300px] overflow-hidden rounded-2xl bg-black",
        )}
      />

      {!isScanning && !error && (
        <p className="text-sm text-white/60">{TEXT.STARTING}</p>
      )}

      {error && (
        <p
          role="alert"
          className="text-center text-sm text-state-denied-icon"
        >
          {error}
        </p>
      )}
    </div>
  );
}

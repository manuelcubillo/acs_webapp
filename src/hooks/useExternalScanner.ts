"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * Detects barcode/QR reader input injected via the HID keyboard interface.
 *
 * Barcode readers typically fire keydown events much faster than a human
 * can type. When the inter-character delay is below THRESHOLD_MS and the
 * accumulated string is at least MIN_LENGTH characters, we treat it as a
 * scanner event and call onScan().
 *
 * The Enter key (commonly appended by scanners) flushes the buffer.
 */

const THRESHOLD_MS = 50; // chars arriving faster than this = scanner
const MIN_LENGTH = 4; // discard accidental short bursts

interface UseExternalScannerOptions {
  onScan: (code: string) => void;
  /** Set to false to temporarily disable listening. Default: true. */
  enabled?: boolean;
}

export function useExternalScanner({
  onScan,
  enabled = true,
}: UseExternalScannerOptions) {
  const bufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Ignore pure modifier keys.
      if (
        e.key === "Shift" ||
        e.key === "Control" ||
        e.key === "Alt" ||
        e.key === "Meta"
      )
        return;

      const now = Date.now();
      const elapsed = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Enter → flush buffer.
      if (e.key === "Enter") {
        const code = bufferRef.current.trim();
        if (code.length >= MIN_LENGTH) {
          onScanRef.current(code);
        }
        bufferRef.current = "";
        return;
      }

      // If the gap since the last key is too long, this is human input —
      // reset the buffer so we don't mix scanner + manual chars.
      if (elapsed > THRESHOLD_MS && bufferRef.current.length > 0) {
        bufferRef.current = "";
      }

      // Accumulate printable characters.
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);
}

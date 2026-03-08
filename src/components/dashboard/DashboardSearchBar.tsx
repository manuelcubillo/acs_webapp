"use client";

/**
 * DashboardSearchBar
 *
 * Operational scan input for the dashboard.
 * Handles both:
 *   - Manual code entry (text input + "Escanear" button)
 *   - External barcode reader (fast keystrokes detected by useExternalScanner)
 *
 * When a scan is submitted, calls `onScan(code)` which triggers
 * executeScanWithAutoActionsAction on the parent.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, Loader2, ScanLine } from "lucide-react";

interface DashboardSearchBarProps {
  onScan: (code: string) => Promise<void>;
  isScanning: boolean;
}

export default function DashboardSearchBar({ onScan, isScanning }: DashboardSearchBarProps) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount for immediate barcode reader capture
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed || isScanning) return;
    await onScan(trimmed);
    setCode("");
    inputRef.current?.focus();
  }, [code, isScanning, onScan]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
      <div style={{ position: "relative", flex: 1 }}>
        <ScanLine
          size={16}
          strokeWidth={1.8}
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--color-muted)",
            pointerEvents: "none",
          }}
        />
        <input
          ref={inputRef}
          type="text"
          className="form-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Código de carnet…"
          disabled={isScanning}
          style={{ paddingLeft: 38, width: "100%", boxSizing: "border-box" }}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>
      <button
        className="btn btn-primary"
        onClick={handleSubmit}
        disabled={isScanning || !code.trim()}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          opacity: isScanning || !code.trim() ? 0.55 : 1,
          flexShrink: 0,
        }}
      >
        {isScanning
          ? <Loader2 size={15} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
          : <Search size={15} strokeWidth={2} />
        }
        {isScanning ? "Escaneando…" : "Escanear"}
      </button>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

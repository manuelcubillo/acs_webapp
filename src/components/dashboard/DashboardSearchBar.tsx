"use client";

/**
 * DashboardSearchBar — operational scan input.
 *
 * Behavior preserved EXACTLY:
 *   - Autofocus on mount (immediate barcode-reader capture).
 *   - Enter submits → onScan(code) (parent handles executeScanWithAutoActionsAction).
 *   - External reader keystrokes land in this input via natural focus + useExternalScanner.
 *
 * Presentation rebuilt on shadcn Input + Button. Token-driven, no hex, no inline styles.
 * Visually the primary operational action on the page.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { Camera, Loader2, ScanLine, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const TEXT = {
  PLACEHOLDER:  "Escanea o introduce el código del carnet…",
  BTN_SCAN:     "Escanear",
  BTN_SCANNING: "Escaneando…",
  BTN_CAMERA:   "Cámara",
  ARIA_INPUT:   "Código del carnet",
  ARIA_SUBMIT:  "Iniciar escaneo",
  HINT:         "Pulsa Enter para escanear. El lector externo escribe directamente aquí.",
} as const;

interface DashboardSearchBarProps {
  onScan: (code: string) => Promise<void>;
  isScanning: boolean;
}

export default function DashboardSearchBar({ onScan, isScanning }: DashboardSearchBarProps) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on mount for immediate external-reader capture.
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

  const submitDisabled = isScanning || !code.trim();

  return (
    <section
      aria-label="Escaneo operacional"
      className={cn(
        "rounded-2xl border bg-card shadow-sm",
        "border-border ring-1 ring-transparent",
        "transition-shadow focus-within:ring-ring/40 focus-within:shadow-md",
      )}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-stretch sm:gap-3 sm:p-5">
        <div className="relative flex-1">
          <ScanLine
            aria-hidden
            className={cn(
              "pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2",
              "text-muted-foreground",
            )}
            strokeWidth={1.8}
          />
          <Input
            ref={inputRef}
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={TEXT.PLACEHOLDER}
            aria-label={TEXT.ARIA_INPUT}
            disabled={isScanning}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className={cn(
              "h-12 w-full rounded-xl pl-12 pr-4 text-base font-medium",
              "placeholder:text-muted-foreground/70",
            )}
          />
        </div>

        <Button
          type="button"
          size="lg"
          className="h-12 rounded-xl px-6 text-sm font-semibold"
          onClick={handleSubmit}
          disabled={submitDisabled}
          aria-label={TEXT.ARIA_SUBMIT}
        >
          {isScanning ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Search />
          )}
          <span>{isScanning ? TEXT.BTN_SCANNING : TEXT.BTN_SCAN}</span>
        </Button>

        <Button
          type="button"
          size="lg"
          variant="outline"
          className="h-12 rounded-xl px-5 text-sm font-medium"
          asChild
        >
          <Link href="/cards/scan">
            <Camera />
            <span>{TEXT.BTN_CAMERA}</span>
          </Link>
        </Button>
      </div>

      <p className="border-t border-border bg-muted/40 px-5 py-2 text-xs text-muted-foreground">
        {TEXT.HINT}
      </p>
    </section>
  );
}

"use client";

/**
 * ScanClient — informational scan page (NOT the operational scan path).
 *
 * Behavior unchanged: on scan → router.push(`/cards/${code}`). No log, no
 * auto-actions. See decisions/2026-03-20-operational-vs-informational.md.
 *
 * useExternalScanner is mounted here so the HID reader works on this route too.
 */

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ScanMode } from "@/lib/dal/types";
import { useExternalScanner } from "@/hooks/useExternalScanner";

const TEXT = {
  BTN_BACK:      "Volver",
  TITLE:         "Escanear carnet",
  HINT_BOTH:     "Usa la cámara o pasa el lector de código de barras",
  HINT_CAMERA:   "Apunta la cámara al código del carnet",
  HINT_EXTERNAL: "Pasa el lector de código de barras",
  READY:         "Listo para lector externo — pasa el código",
} as const;

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
  const showExternal = scanMode === "external_reader" || scanMode === "both";

  function handleScan(code: string) {
    router.push(`/cards/${encodeURIComponent(code.trim())}`);
  }

  useExternalScanner({ onScan: handleScan, enabled: showExternal });

  const hint = showCamera && showExternal
    ? TEXT.HINT_BOTH
    : showCamera
      ? TEXT.HINT_CAMERA
      : TEXT.HINT_EXTERNAL;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 p-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="self-start text-muted-foreground"
      >
        <ArrowLeft />
        {TEXT.BTN_BACK}
      </Button>

      <div className="text-center">
        <h2 className="mb-1.5 font-heading text-xl font-bold text-foreground">
          {TEXT.TITLE}
        </h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>

      {showCamera && (
        <div className="w-full overflow-hidden rounded-2xl bg-neutral-950 p-4">
          <QRScanner onScan={handleScan} />
        </div>
      )}

      {showExternal && !showCamera && (
        <div className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/40 px-10 py-12 text-center text-sm text-muted-foreground">
          <Radio aria-hidden className="size-6 animate-pulse" strokeWidth={1.8} />
          {TEXT.READY}
        </div>
      )}
    </div>
  );
}

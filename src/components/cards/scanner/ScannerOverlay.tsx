"use client";

/**
 * ScannerOverlay — fixed-position dark overlay for camera scanning surfaces.
 *
 * The black backdrop is intentional (matches the camera medium), so this
 * surface intentionally does not follow brand or dark/light mode — it is
 * always the dark scanner backdrop.
 */

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

const TEXT = {
  DEFAULT_TITLE: "Escanear código",
  DEFAULT_HINT:  "Apunta la cámara al código QR o de barras del carnet",
  ARIA_CLOSE:    "Cerrar escáner",
} as const;

interface ScannerOverlayProps {
  children: React.ReactNode;
  onClose: () => void;
  title?: string;
  hint?: string;
}

export default function ScannerOverlay({
  children,
  onClose,
  title = TEXT.DEFAULT_TITLE,
  hint = TEXT.DEFAULT_HINT,
}: ScannerOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-6">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClose}
        aria-label={TEXT.ARIA_CLOSE}
        className="absolute right-5 top-5 size-10 rounded-full bg-white/15 text-white hover:bg-white/25"
      >
        <X />
      </Button>

      <h2 className="mb-5 font-heading text-lg font-bold text-white">
        {title}
      </h2>

      {children}

      <p className="mt-5 max-w-xs text-center text-sm text-white/60">
        {hint}
      </p>
    </div>
  );
}

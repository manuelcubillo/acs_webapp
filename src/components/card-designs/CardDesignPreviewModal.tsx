"use client";

/**
 * CardDesignPreviewModal — renders a card design with real (or sample) data
 * and allows the user to download the result as a PNG.
 *
 * Uses renderDesignToDataURL from @/lib/card-designs/render (Canvas API).
 */

import { useEffect, useState } from "react";
import { Download, Loader2, AlertCircle } from "lucide-react";
import type { CardDesignLayout } from "@/lib/card-designs/types";
import { renderDesignToDataURL } from "@/lib/card-designs/render";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const LABELS = {
  title: "Vista previa del diseño",
  downloading: "Generando…",
  download: "Descargar PNG",
  close: "Cerrar",
  renderError: "No se pudo generar la vista previa.",
  loading: "Renderizando diseño…",
} as const;

interface Props {
  layout: CardDesignLayout;
  fieldValues: Record<string, string>;
  photoValues: Record<string, string>;
  /** Signed read URLs for static image nodes that reference an object key. */
  staticImageUrls?: Record<string, string>;
  cardCode: string;
  designName: string;
  onClose: () => void;
}

export default function CardDesignPreviewModal({
  layout,
  fieldValues,
  photoValues,
  staticImageUrls,
  cardCode,
  designName,
  onClose,
}: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Render on mount
  useEffect(() => {
    let cancelled = false;
    renderDesignToDataURL({
      layout,
      fieldValues,
      photoValues,
      staticImageUrls,
      cardCode,
      scale: 2,
    })
      .then((url) => { if (!cancelled) setDataUrl(url); })
      .catch(() => { if (!cancelled) setError(LABELS.renderError); });
    return () => { cancelled = true; };
  }, [layout, fieldValues, photoValues, staticImageUrls, cardCode]);

  function handleDownload() {
    if (!dataUrl) return;
    setDownloading(true);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${designName.replace(/[^a-z0-9]/gi, "_")}.png`;
    a.click();
    setTimeout(() => setDownloading(false), 500);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-[640px] gap-0 overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="border-b p-5">
          <DialogTitle className="truncate font-heading text-[15px] font-bold">
            {LABELS.title} — {designName}
          </DialogTitle>
        </DialogHeader>

        {/* Preview area */}
        <div className="flex min-h-[200px] flex-1 items-center justify-center overflow-y-auto bg-muted p-6">
          {error ? (
            <div className="flex flex-col items-center gap-2 text-destructive">
              <AlertCircle className="size-7" strokeWidth={1.5} />
              <span className="text-sm">{error}</span>
            </div>
          ) : !dataUrl ? (
            <div className="flex flex-col items-center gap-2.5 text-muted-foreground">
              <Loader2 className="size-7 animate-spin" strokeWidth={1.5} />
              <span className="text-sm">{LABELS.loading}</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dataUrl}
              alt={designName}
              className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-lg"
            />
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="border-t p-5">
          <Button variant="outline" onClick={onClose}>
            {LABELS.close}
          </Button>
          <Button onClick={handleDownload} disabled={!dataUrl || downloading}>
            {downloading ? (
              <Loader2 className="animate-spin" strokeWidth={2} />
            ) : (
              <Download strokeWidth={2} />
            )}
            {downloading ? LABELS.downloading : LABELS.download}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

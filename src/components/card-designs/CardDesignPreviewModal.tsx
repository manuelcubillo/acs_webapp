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
import { hasExportSize } from "@/lib/card-designs/export-size";
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
  /**
   * Physical size of the DOWNLOADED image, in centimetres. Both must be set for
   * it to take effect; the on-screen preview below ignores them entirely and
   * keeps rendering at its usual size.
   */
  outputWidthCm?: number | null;
  outputHeightCm?: number | null;
  onClose: () => void;
}

export default function CardDesignPreviewModal({
  layout,
  fieldValues,
  photoValues,
  staticImageUrls,
  cardCode,
  designName,
  outputWidthCm = null,
  outputHeightCm = null,
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

  /** Fires the browser download for an already-rendered data URL. */
  function triggerDownload(url: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${designName.replace(/[^a-z0-9]/gi, "_")}.png`;
    a.click();
  }

  /**
   * Downloads the design. When the design carries a configured export size the
   * file is re-rendered at that physical size (300 DPI) instead of reusing the
   * preview bitmap; otherwise the preview data URL is downloaded as before.
   */
  async function handleDownload() {
    if (!dataUrl) return;
    setDownloading(true);
    try {
      if (hasExportSize(outputWidthCm, outputHeightCm)) {
        // hasExportSize guarantees both dimensions; a type predicate can only
        // narrow its first parameter, hence the cast on the height.
        const exportUrl = await renderDesignToDataURL({
          layout,
          fieldValues,
          photoValues,
          staticImageUrls,
          cardCode,
          output: { widthCm: outputWidthCm, heightCm: outputHeightCm as number },
        });
        triggerDownload(exportUrl);
      } else {
        triggerDownload(dataUrl);
      }
    } catch {
      setError(LABELS.renderError);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[95vh] max-w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(95vw,1100px)]">
        {/* Header */}
        <DialogHeader className="border-b p-5">
          <DialogTitle className="truncate font-heading text-[15px] font-bold">
            {LABELS.title} — {designName}
          </DialogTitle>
        </DialogHeader>

        {/* Preview area */}
        <div className="flex min-h-[200px] flex-1 items-center justify-center overflow-auto bg-muted p-6">
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
              className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-lg"
            />
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="border-t p-5">
          <Button variant="outline" onClick={onClose}>
            {LABELS.close}
          </Button>
          <Button onClick={() => void handleDownload()} disabled={!dataUrl || downloading}>
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

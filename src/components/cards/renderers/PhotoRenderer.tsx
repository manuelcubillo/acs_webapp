"use client";

/**
 * PhotoRenderer — thumbnail + lightbox preview.
 *
 * `<img src>` is data — preserved inline. The chrome (border, lightbox surface)
 * is migrated to tokens + shadcn Dialog.
 *
 * When the card `code` and this field's `fieldDefinitionId` are provided, the
 * lightbox also offers a download. The download goes through the same-origin
 * photo route with `?field=…&download`, which 302-redirects to a signed URL
 * whose `Content-Disposition` names the file `<code>_<fieldName>_<random>.<ext>`
 * — human-readable and traceable to the stored object.
 */

import { useState } from "react";
import { Download } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const TEXT = {
  ALT_DEFAULT:  "Foto",
  ARIA_PREVIEW: "Ampliar foto",
  DOWNLOAD:     "Descargar",
} as const;

interface PhotoRendererProps {
  value: unknown;
  label?: string;
  /** Card code — enables the download affordance when paired with the field id. */
  cardCode?: string;
  /** This photo field's definition id — selects the exact object to download. */
  fieldDefinitionId?: string;
}

export default function PhotoRenderer({
  value,
  label,
  cardCode,
  fieldDefinitionId,
}: PhotoRendererProps) {
  const [open, setOpen] = useState(false);

  if (!value) {
    return <span className="italic text-muted-foreground">—</span>;
  }

  const src = String(value);
  const alt = label ?? TEXT.ALT_DEFAULT;
  const downloadHref =
    cardCode && fieldDefinitionId
      ? `/api/photos/cards/${encodeURIComponent(cardCode)}?field=${encodeURIComponent(
          fieldDefinitionId,
        )}&download`
      : null;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={() => setOpen(true)}
        aria-label={TEXT.ARIA_PREVIEW}
        className="block h-auto max-h-[var(--photo-thumbnail-size)] w-auto max-w-[var(--photo-thumbnail-size)] shrink-0 cursor-pointer self-start rounded-md border border-border transition-shadow hover:shadow-md"
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          className="w-fit max-w-[95vw] border-none bg-black/90 p-0 sm:max-w-3xl"
        >
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="block max-h-[90vh] w-auto rounded-md object-contain"
          />
          {downloadHref && (
            <Button
              asChild
              size="sm"
              variant="secondary"
              className="absolute bottom-3 right-3"
            >
              {/* Same-origin route → 302 → signed attachment URL. */}
              <a href={downloadHref} download>
                <Download className="size-4" />
                {TEXT.DOWNLOAD}
              </a>
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

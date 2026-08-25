"use client";

/**
 * PhotoRenderer — thumbnail + lightbox preview.
 *
 * When the card `code` and this field's `fieldDefinitionId` are provided, both
 * images are served from the stable same-origin photo route rather than from a
 * signed storage URL passed in through `value`. That is the addressing model of
 * ADR `2026-07-17-stable-photo-routes.md`: a signed URL embeds a timestamp, so
 * it is a different string on every render (defeating the browser cache) and it
 * dies with its 15-minute TTL. The route's URL is stable per card+field and the
 * signature is minted server-side per request, so the thumbnail cannot expire in
 * place and survives a client-side refetch that carries no signed URL at all.
 *
 * Without those two props the component falls back to treating `value` as a
 * ready-to-use URL, which is how the surfaces that still sign server-side
 * (card detail, scan results) render.
 *
 * `value` is always the presence signal — the field renders a dash when empty,
 * whatever addressing mode is in play.
 *
 * The lightbox additionally offers a download, which hits the same route with
 * `&download`: it 302-redirects to a signed URL whose `Content-Disposition`
 * names the file `<code>_<fieldName>_<random>.<ext>` — human-readable and
 * traceable to the stored object.
 *
 * `enlargeable={false}` drops the lightbox entirely and renders a static
 * thumbnail. The list surfaces use it because their row is itself a link to the
 * card detail: a photo that opened a dialog there would swallow the row's own
 * click, so it must neither intercept it nor advertise that it would.
 */

import { useState } from "react";
import { Download } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cardPhotoRoute } from "@/lib/storage/photo-routes";
import { cn } from "@/lib/utils";

/** Default thumbnail footprint; the interactive variant adds its own affordances. */
const THUMBNAIL_CLASS =
  "block h-auto max-h-[var(--photo-thumbnail-size)] w-auto max-w-[var(--photo-thumbnail-size)] shrink-0 self-start rounded-md border border-border";

const TEXT = {
  ALT_DEFAULT:  "Foto",
  ARIA_PREVIEW: "Ampliar foto",
  DOWNLOAD:     "Descargar",
} as const;

interface PhotoRendererProps {
  /**
   * Presence signal, and the image URL itself on surfaces that sign server-side.
   * Ignored as a URL once `cardCode` + `fieldDefinitionId` are supplied.
   */
  value: unknown;
  label?: string;
  /** Card code — switches the component to the stable route (see file header). */
  cardCode?: string;
  /** This photo field's definition id — selects the exact object to serve. */
  fieldDefinitionId?: string;
  /**
   * Whether clicking the thumbnail opens the lightbox. Pass `false` wherever an
   * ancestor already owns the click (see file header).
   */
  enlargeable?: boolean;
  /** Overrides `THUMBNAIL_CLASS` for a caller with different sizing needs (e.g. a two-row grid cell). */
  className?: string;
}

export default function PhotoRenderer({
  value,
  label,
  cardCode,
  fieldDefinitionId,
  enlargeable = true,
  className,
}: PhotoRendererProps) {
  const [open, setOpen] = useState(false);
  const thumbnailClass = className ?? THUMBNAIL_CLASS;

  // Stable route when the card is identified, signed URL otherwise.
  const routeSrc =
    cardCode && fieldDefinitionId
      ? cardPhotoRoute(cardCode, { fieldDefinitionId })
      : null;
  const src = routeSrc ?? (typeof value === "string" ? value : null);

  // `value` gates presence in both modes: the route would answer 404 for a
  // field that holds no object, so never mount an <img> pointing at one.
  if (!value || !src) {
    return <span className="italic text-muted-foreground">—</span>;
  }

  const alt = label ?? TEXT.ALT_DEFAULT;

  // Every thumbnail costs a round trip to the photo route, which runs a session
  // check plus `getCardByCode` before it can sign. A 50-row list would spend 50
  // of them to paint the handful of rows on screen, so defer the off-screen
  // ones to the browser's viewport heuristic.
  const loadingProps = { loading: "lazy", decoding: "async" } as const;

  if (!enlargeable) {
    // Static thumbnail — the row around it navigates to the card detail.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...loadingProps} className={thumbnailClass} />;
  }

  const downloadHref =
    cardCode && fieldDefinitionId
      ? cardPhotoRoute(cardCode, { fieldDefinitionId, download: true })
      : null;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        {...loadingProps}
        onClick={() => setOpen(true)}
        aria-label={TEXT.ARIA_PREVIEW}
        className={cn(
          thumbnailClass,
          "cursor-pointer transition-shadow hover:shadow-md",
        )}
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

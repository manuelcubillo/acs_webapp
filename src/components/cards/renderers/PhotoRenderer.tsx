"use client";

/**
 * PhotoRenderer — thumbnail + lightbox preview.
 *
 * `<img src>` is data — preserved inline. The chrome (border, lightbox surface)
 * is migrated to tokens + shadcn Dialog.
 */

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

const TEXT = {
  ALT_DEFAULT:  "Foto",
  ARIA_PREVIEW: "Ampliar foto",
} as const;

interface PhotoRendererProps {
  value: unknown;
  label?: string;
}

export default function PhotoRenderer({ value, label }: PhotoRendererProps) {
  const [open, setOpen] = useState(false);

  if (!value) {
    return <span className="italic text-muted-foreground">—</span>;
  }

  const src = String(value);
  const alt = label ?? TEXT.ALT_DEFAULT;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={() => setOpen(true)}
        aria-label={TEXT.ARIA_PREVIEW}
        className="block size-12 cursor-pointer rounded-md border border-border object-cover transition-shadow hover:shadow-md"
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          className="max-w-[95vw] border-none bg-black/90 p-0 sm:max-w-3xl"
        >
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="block max-h-[90vh] w-auto rounded-md object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

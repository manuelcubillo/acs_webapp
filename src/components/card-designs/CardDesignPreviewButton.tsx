"use client";

/**
 * CardDesignPreviewButton — opens CardDesignPreviewModal for a given design
 * rendered with real card field values.
 *
 * Receives pre-serialised props from the server component so no extra fetch
 * is needed on click.
 */

import { useState } from "react";
import { Eye } from "lucide-react";
import type { CardDesignLayout } from "@/lib/card-designs/types";
import CardDesignPreviewModal from "./CardDesignPreviewModal";
import { Button } from "@/components/ui/button";

const LABELS = {
  btn: "Ver diseño",
} as const;

interface Props {
  layout: CardDesignLayout;
  fieldValues: Record<string, string>;
  photoValues: Record<string, string>;
  /** Signed read URLs for static image nodes that reference an object key. */
  staticImageUrls?: Record<string, string>;
  cardCode: string;
  designName: string;
}

export default function CardDesignPreviewButton({
  layout,
  fieldValues,
  photoValues,
  staticImageUrls,
  cardCode,
  designName,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Eye strokeWidth={1.8} />
        {LABELS.btn}
      </Button>

      {open && (
        <CardDesignPreviewModal
          layout={layout}
          fieldValues={fieldValues}
          photoValues={photoValues}
          staticImageUrls={staticImageUrls}
          cardCode={cardCode}
          designName={designName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

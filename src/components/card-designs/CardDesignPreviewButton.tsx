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

const LABELS = {
  btn: "Ver diseño",
} as const;

interface Props {
  layout: CardDesignLayout;
  fieldValues: Record<string, string>;
  photoValues: Record<string, string>;
  cardCode: string;
  designName: string;
}

export default function CardDesignPreviewButton({
  layout,
  fieldValues,
  photoValues,
  cardCode,
  designName,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          borderRadius: 8,
          border: "1.5px solid var(--color-border)",
          background: "#fff",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--color-dark)",
          cursor: "pointer",
        }}
      >
        <Eye size={14} strokeWidth={1.8} />
        {LABELS.btn}
      </button>

      {open && (
        <CardDesignPreviewModal
          layout={layout}
          fieldValues={fieldValues}
          photoValues={photoValues}
          cardCode={cardCode}
          designName={designName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

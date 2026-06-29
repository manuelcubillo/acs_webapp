"use client";

/**
 * BooleanRenderer — Sí/No chip for a boolean field value.
 *
 * Uses the shadcn Badge primitive with neutral variants. NOT mapped to
 * --state-granted/-denied: a boolean field is not an access-control outcome.
 */

import { Badge } from "@/components/ui/badge";

const TEXT = { YES: "Sí", NO: "No" } as const;

interface BooleanRendererProps {
  value: unknown;
}

export default function BooleanRenderer({ value }: BooleanRendererProps) {
  const bool = Boolean(value);
  return (
    <Badge variant={bool ? "default" : "secondary"} className="px-2.5 py-0.5">
      {bool ? TEXT.YES : TEXT.NO}
    </Badge>
  );
}

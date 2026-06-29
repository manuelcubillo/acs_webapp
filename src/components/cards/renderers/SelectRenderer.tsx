"use client";

/**
 * SelectRenderer — chip for a select-field value.
 *
 * Uses the shadcn Badge primitive with the brand-tinted accent variant.
 * Not mapped to --state-* tokens — a select value is not an access-control
 * outcome, it's just a labelled category.
 */

import { Badge } from "@/components/ui/badge";

interface SelectRendererProps {
  value: unknown;
}

export default function SelectRenderer({ value }: SelectRendererProps) {
  if (!value) {
    return <span className="italic text-muted-foreground">—</span>;
  }
  return (
    <Badge className="bg-accent text-accent-foreground hover:bg-accent">
      {String(value)}
    </Badge>
  );
}

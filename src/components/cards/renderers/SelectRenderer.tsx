"use client";

/**
 * SelectRenderer — chip(s) for a select-field value.
 *
 * Uses the shadcn Badge primitive with the brand-tinted accent variant.
 * Not mapped to --state-* tokens — a select value is not an access-control
 * outcome, it's just a labelled category.
 *
 * A multi-select value arrives as an array (stored in `value_json`); it renders
 * as one chip per selection. The shape is read off the value itself rather
 * than off the field's `allowMultiple` rule, so a field toggled back to single
 * still shows what the card actually holds.
 */

import { Badge } from "@/components/ui/badge";

interface SelectRendererProps {
  value: unknown;
}

const CHIP_CLASS = "bg-accent text-accent-foreground hover:bg-accent";

export default function SelectRenderer({ value }: SelectRendererProps) {
  const selected = (Array.isArray(value) ? value : [value])
    .filter((v) => v !== null && v !== undefined && v !== "")
    .map((v) => String(v));

  if (selected.length === 0) {
    return <span className="italic text-muted-foreground">—</span>;
  }

  if (selected.length === 1) {
    return <Badge className={CHIP_CLASS}>{selected[0]}</Badge>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {selected.map((v) => (
        <Badge key={v} className={CHIP_CLASS}>
          {v}
        </Badge>
      ))}
    </div>
  );
}

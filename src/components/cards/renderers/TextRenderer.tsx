"use client";

interface TextRendererProps {
  value: unknown;
}

export default function TextRenderer({ value }: TextRendererProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="italic text-muted-foreground">—</span>;
  }
  return <span>{String(value)}</span>;
}

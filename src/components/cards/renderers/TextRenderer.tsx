"use client";

interface TextRendererProps {
  value: unknown;
}

export default function TextRenderer({ value }: TextRendererProps) {
  if (value === null || value === undefined || value === "") {
    return (
      <span style={{ color: "var(--color-muted)", fontStyle: "italic" }}>—</span>
    );
  }
  return <span>{String(value)}</span>;
}

"use client";

interface NumberRendererProps {
  value: unknown;
}

export default function NumberRenderer({ value }: NumberRendererProps) {
  if (value === null || value === undefined || value === "") {
    return (
      <span style={{ color: "var(--color-muted)", fontStyle: "italic" }}>—</span>
    );
  }
  const num = Number(value);
  if (isNaN(num)) return <span>{String(value)}</span>;
  return <span>{num.toLocaleString("es-ES")}</span>;
}

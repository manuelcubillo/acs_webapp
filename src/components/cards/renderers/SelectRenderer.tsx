"use client";

interface SelectRendererProps {
  value: unknown;
}

export default function SelectRenderer({ value }: SelectRendererProps) {
  if (!value) {
    return (
      <span style={{ color: "var(--color-muted)", fontStyle: "italic" }}>—</span>
    );
  }
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        background: "#e0e7ff",
        color: "var(--color-primary)",
      }}
    >
      {String(value)}
    </span>
  );
}

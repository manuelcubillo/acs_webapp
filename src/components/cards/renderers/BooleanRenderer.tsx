"use client";

interface BooleanRendererProps {
  value: unknown;
}

export default function BooleanRenderer({ value }: BooleanRendererProps) {
  const bool = Boolean(value);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 10px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        background: bool ? "#dcfce7" : "#fee2e2",
        color: bool ? "#166534" : "#991b1b",
      }}
    >
      {bool ? "Sí" : "No"}
    </span>
  );
}

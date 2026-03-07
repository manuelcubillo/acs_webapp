"use client";

interface DateRendererProps {
  value: unknown;
}

export default function DateRenderer({ value }: DateRendererProps) {
  if (!value) {
    return (
      <span style={{ color: "var(--color-muted)", fontStyle: "italic" }}>—</span>
    );
  }
  try {
    const date = new Date(String(value));
    if (isNaN(date.getTime())) return <span>{String(value)}</span>;
    return (
      <span>
        {date.toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })}
      </span>
    );
  } catch {
    return <span>{String(value)}</span>;
  }
}

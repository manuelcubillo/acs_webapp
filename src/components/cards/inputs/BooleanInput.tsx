"use client";

interface BooleanInputProps {
  fieldId: string;
  label: string;
  value: unknown;
  onChange: (value: boolean) => void;
  isRequired?: boolean;
  error?: string;
  disabled?: boolean;
}

export default function BooleanInput({
  label,
  value,
  onChange,
  error,
  disabled,
}: BooleanInputProps) {
  const checked = Boolean(value);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: disabled ? "default" : "pointer",
        }}
        onClick={() => !disabled && onChange(!checked)}
      >
        {/* Toggle track */}
        <div
          style={{
            width: 42,
            height: 24,
            borderRadius: 12,
            background: checked ? "var(--color-primary)" : "var(--color-border)",
            position: "relative",
            transition: "background 0.2s",
            flexShrink: 0,
          }}
        >
          {/* Toggle thumb */}
          <div
            style={{
              position: "absolute",
              top: 3,
              left: checked ? 21 : 3,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              transition: "left 0.2s",
            }}
          />
        </div>
        <span
          style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}
        >
          {label}
        </span>
      </div>
      {error && (
        <span style={{ fontSize: 12, color: "#ef4444" }}>{error}</span>
      )}
    </div>
  );
}

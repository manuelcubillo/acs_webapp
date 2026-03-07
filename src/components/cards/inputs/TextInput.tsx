"use client";

interface TextInputProps {
  fieldId: string;
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  isRequired?: boolean;
  error?: string;
  disabled?: boolean;
}

export default function TextInput({
  label,
  value,
  onChange,
  isRequired,
  error,
  disabled,
}: TextInputProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label
        style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}
      >
        {label}
        {isRequired && (
          <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>
        )}
      </label>
      <input
        type="text"
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          padding: "9px 12px",
          borderRadius: 8,
          border: `1.5px solid ${error ? "#ef4444" : "var(--color-border)"}`,
          fontSize: 14,
          outline: "none",
          background: disabled ? "var(--color-page-bg)" : "#fff",
          color: "var(--color-dark)",
          width: "100%",
          boxSizing: "border-box",
        }}
      />
      {error && (
        <span style={{ fontSize: 12, color: "#ef4444" }}>{error}</span>
      )}
    </div>
  );
}

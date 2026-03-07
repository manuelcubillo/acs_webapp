"use client";

import type { ValidationRules } from "@/lib/validation/types";

interface SelectInputProps {
  fieldId: string;
  label: string;
  value: unknown;
  onChange: (value: string | null) => void;
  isRequired?: boolean;
  error?: string;
  disabled?: boolean;
  validationRules?: ValidationRules | null;
}

export default function SelectInput({
  label,
  value,
  onChange,
  isRequired,
  error,
  disabled,
  validationRules,
}: SelectInputProps) {
  // Extract options from the "allowedValues" validation rule.
  const options: string[] = [];
  if (validationRules?.rules) {
    const rule = validationRules.rules.find((r) => r.rule === "allowedValues");
    if (rule && Array.isArray(rule.value)) {
      options.push(...(rule.value as string[]));
    }
  }

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
      <select
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => onChange(e.target.value || null)}
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
      >
        <option value="">— Seleccionar —</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {error && (
        <span style={{ fontSize: 12, color: "#ef4444" }}>{error}</span>
      )}
    </div>
  );
}

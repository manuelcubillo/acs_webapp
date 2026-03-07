"use client";

/**
 * ValidationRulesEditor
 *
 * Dynamically renders rule configuration inputs based on the field type.
 * Uses getRulesForFieldType() to know which rules are available.
 *
 * Each rule has a toggle (enabled/disabled) and a value input
 * whose type depends on rule.paramType.
 */

import { getRulesForFieldType, PATTERN_PRESETS } from "@/lib/validation/rules";
import type { FieldType, RuleDefinition } from "@/lib/validation/types";
import type { ValidationRule } from "@/hooks/useCardTypeWizard";

interface ValidationRulesEditorProps {
  fieldType: FieldType;
  /** Current rules array — keyed rule→value pairs already enabled. */
  rules: ValidationRule[];
  onChange: (rules: ValidationRule[]) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRule(rules: ValidationRule[], ruleName: string): ValidationRule | undefined {
  return rules.find((r) => r.rule === ruleName);
}

function setRule(rules: ValidationRule[], ruleDef: RuleDefinition, value: unknown): ValidationRule[] {
  const existing = rules.find((r) => r.rule === ruleDef.rule);
  if (existing) {
    return rules.map((r) =>
      r.rule === ruleDef.rule ? { ...r, value } : r,
    );
  }
  return [...rules, { rule: ruleDef.rule, value }];
}

function removeRule(rules: ValidationRule[], ruleName: string): ValidationRule[] {
  return rules.filter((r) => r.rule !== ruleName);
}

// ─── Rule value input ────────────────────────────────────────────────────────

interface RuleValueInputProps {
  def: RuleDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

function RuleValueInput({ def, value, onChange }: RuleValueInputProps) {
  const inputStyle: React.CSSProperties = {
    padding: "6px 10px",
    border: "1.5px solid var(--color-border)",
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "var(--font-body)",
    color: "var(--color-dark)",
    background: "#fff",
    outline: "none",
    width: "100%",
  };

  if (def.paramType === "boolean") {
    return (
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: 16, height: 16, accentColor: "var(--color-primary)", cursor: "pointer" }}
        />
        <span style={{ fontSize: 12.5, color: "var(--color-secondary)" }}>Activado</span>
      </label>
    );
  }

  if (def.paramType === "number") {
    return (
      <input
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Number(e.target.value))
        }
        placeholder={String(def.example ?? "")}
        style={inputStyle}
      />
    );
  }

  if (def.paramType === "iso-date") {
    return (
      <input
        type="date"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        style={inputStyle}
      />
    );
  }

  if (def.paramType === "string[]") {
    // Comma-separated input
    const currentArr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div>
        <input
          type="text"
          value={currentArr.join(", ")}
          onChange={(e) => {
            const arr = e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            onChange(arr.length > 0 ? arr : []);
          }}
          placeholder={Array.isArray(def.example) ? def.example.join(", ") : "op1, op2, op3"}
          style={inputStyle}
        />
        <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 4 }}>
          Separar opciones con comas
        </div>
      </div>
    );
  }

  // string — with preset dropdown for "pattern" rule
  if (def.rule === "pattern") {
    const presets = ["", ...Object.keys(PATTERN_PRESETS)];
    const isPreset = typeof value === "string" && presets.slice(1).includes(value);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <select
          value={isPreset ? (value as string) : "__custom__"}
          onChange={(e) => {
            if (e.target.value === "__custom__") onChange("");
            else onChange(e.target.value);
          }}
          style={{ ...inputStyle, appearance: "auto" }}
        >
          <option value="">— Seleccionar preset —</option>
          {Object.keys(PATTERN_PRESETS).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value="__custom__">Regex personalizado</option>
        </select>
        {(!isPreset || value === "") && (
          <input
            type="text"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="^[A-Z]{2}[0-9]+$"
            style={inputStyle}
          />
        )}
      </div>
    );
  }

  return (
    <input
      type="text"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      placeholder={String(def.example ?? "")}
      style={inputStyle}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ValidationRulesEditor({
  fieldType,
  rules,
  onChange,
}: ValidationRulesEditorProps) {
  const availableRules = getRulesForFieldType(fieldType);

  if (availableRules.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--color-muted)", fontStyle: "italic" }}>
        No hay reglas de validación disponibles para este tipo.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {availableRules.map((def) => {
        const existingRule = getRule(rules, def.rule);
        const enabled = !!existingRule;

        return (
          <div
            key={def.rule}
            style={{
              background: enabled ? "#fafbff" : "#fafbfc",
              border: `1.5px solid ${enabled ? "var(--color-primary-light)" : "var(--color-border-soft)"}`,
              borderRadius: 12,
              padding: "14px 16px",
              transition: "all 0.15s ease",
            }}
          >
            {/* Toggle row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: enabled ? 12 : 0 }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-dark)" }}>
                  {def.rule}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--color-muted)", marginTop: 2 }}>
                  {def.description}
                </div>
              </div>
              {/* Toggle switch */}
              <label style={{ display: "flex", alignItems: "center", cursor: "pointer", flexShrink: 0 }}>
                <div
                  onClick={() => {
                    if (enabled) {
                      onChange(removeRule(rules, def.rule));
                    } else {
                      // Enable with a sensible default value
                      const defaultVal =
                        def.paramType === "boolean"
                          ? true
                          : def.paramType === "number"
                          ? (def.example as number ?? 0)
                          : def.paramType === "string[]"
                          ? (def.example ?? [])
                          : def.paramType === "iso-date"
                          ? ""
                          : (def.example ?? "");
                      onChange(setRule(rules, def, defaultVal));
                    }
                  }}
                  style={{
                    width: 40,
                    height: 22,
                    borderRadius: 11,
                    background: enabled ? "var(--color-primary)" : "#e5e7eb",
                    position: "relative",
                    transition: "background 0.2s ease",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 3,
                      left: enabled ? 21 : 3,
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: "#fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                      transition: "left 0.2s ease",
                    }}
                  />
                </div>
              </label>
            </div>

            {/* Value input (only when enabled) */}
            {enabled && (
              <RuleValueInput
                def={def}
                value={existingRule.value}
                onChange={(v) => onChange(setRule(rules, def, v))}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

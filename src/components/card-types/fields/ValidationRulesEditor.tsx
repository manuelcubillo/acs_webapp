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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { FieldType, RuleDefinition } from "@/lib/validation/types";
import type { ValidationRule } from "@/hooks/useCardTypeWizard";

const TEXT = {
  EMPTY:        "No hay reglas de validación disponibles para este tipo.",
  ENABLED:      "Activado",
  ARRAY_HINT:   "Separar opciones con comas",
  PRESET_PH:    "— Seleccionar preset —",
  CUSTOM_REGEX: "Regex personalizado",
} as const;

interface ValidationRulesEditorProps {
  fieldType: FieldType;
  /** Current rules array — keyed rule→value pairs already enabled. */
  rules: ValidationRule[];
  onChange: (rules: ValidationRule[]) => void;
}

const CUSTOM_SENTINEL = "__custom__";

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
  if (def.paramType === "boolean") {
    return (
      <label className="flex cursor-pointer items-center gap-2">
        <Checkbox
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
        <span className="text-xs text-muted-foreground">{TEXT.ENABLED}</span>
      </label>
    );
  }

  if (def.paramType === "number") {
    return (
      <Input
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Number(e.target.value))
        }
        placeholder={String(def.example ?? "")}
      />
    );
  }

  if (def.paramType === "iso-date") {
    return (
      <Input
        type="date"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    );
  }

  if (def.paramType === "string[]") {
    // Comma-separated input
    const currentArr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div>
        <Input
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
        />
        <div className="mt-1 text-[11px] text-muted-foreground">
          {TEXT.ARRAY_HINT}
        </div>
      </div>
    );
  }

  // string — with preset dropdown for "pattern" rule
  if (def.rule === "pattern") {
    const presets = Object.keys(PATTERN_PRESETS);
    const isPreset = typeof value === "string" && presets.includes(value);
    return (
      <div className="flex flex-col gap-1.5">
        <Select
          value={isPreset ? (value as string) : CUSTOM_SENTINEL}
          onValueChange={(v) => {
            if (v === CUSTOM_SENTINEL) onChange("");
            else onChange(v);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={TEXT.PRESET_PH} />
          </SelectTrigger>
          <SelectContent>
            {presets.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
            <SelectItem value={CUSTOM_SENTINEL}>{TEXT.CUSTOM_REGEX}</SelectItem>
          </SelectContent>
        </Select>
        {(!isPreset || value === "") && (
          <Input
            type="text"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="^[A-Z]{2}[0-9]+$"
          />
        )}
      </div>
    );
  }

  return (
    <Input
      type="text"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      placeholder={String(def.example ?? "")}
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
      <div className="text-sm italic text-muted-foreground">
        {TEXT.EMPTY}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {availableRules.map((def) => {
        const existingRule = getRule(rules, def.rule);
        const enabled = !!existingRule;

        return (
          <div
            key={def.rule}
            className={cn(
              "rounded-xl border px-4 py-3.5 transition-colors",
              enabled ? "border-primary/30 bg-accent/40" : "bg-muted/40",
            )}
          >
            {/* Toggle row */}
            <div
              className={cn(
                "flex items-center justify-between",
                enabled && "mb-3",
              )}
            >
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {def.rule}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {def.description}
                </div>
              </div>
              {/* Toggle switch */}
              <Switch
                checked={enabled}
                onCheckedChange={(checked) => {
                  if (!checked) {
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
              />
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

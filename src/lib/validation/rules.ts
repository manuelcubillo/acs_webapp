/**
 * Validation System - Rules Registry
 *
 * Defines which rules are applicable to each field type.
 * Used by:
 * - The engine: to know which rules to enforce.
 * - The frontend configurator: to render the rule builder UI per field type.
 *
 * To add a new rule: add an entry to RULES_BY_FIELD_TYPE and implement
 * the corresponding validator in validators.ts + VALIDATOR_REGISTRY.
 */

import type { FieldType, RuleDefinition } from "./types";

// ─── Select options ──────────────────────────────────────────────────────────

/**
 * Identifier of the rule that carries a select field's allowed values.
 *
 * Single-sourced because the name is read from three unrelated layers (the
 * card form input, the shared field-filter builder, and the validator). Each
 * previously hard-coded its own spelling and two of them were wrong, which
 * silently produced empty dropdowns rather than an error.
 */
export const SELECT_OPTIONS_RULE = "options";

/**
 * Extract a select field's configured options from its `validation_rules` JSONB.
 *
 * Accepts `unknown` because callers receive this payload in different shapes:
 * typed as `ValidationRules` from the form layer, and as an untyped JSONB blob
 * from the DAL (`CommonFieldDefinition.validationRules`). Malformed or absent
 * rules yield an empty array — a select with no configured options is a valid
 * state, not an error.
 *
 * @param validationRules - The raw `field_definitions.validation_rules` payload.
 * @returns The configured option values, or an empty array.
 */
export function getSelectOptions(validationRules: unknown): string[] {
  if (!validationRules || typeof validationRules !== "object") return [];

  const { rules } = validationRules as { rules?: unknown };
  if (!Array.isArray(rules)) return [];

  const optionsRule = rules.find(
    (r): r is { rule: string; value: unknown } =>
      !!r &&
      typeof r === "object" &&
      (r as { rule?: unknown }).rule === SELECT_OPTIONS_RULE,
  );
  if (!Array.isArray(optionsRule?.value)) return [];

  return optionsRule.value.filter((o): o is string => typeof o === "string");
}

// ─── Pattern presets ─────────────────────────────────────────────────────────

/**
 * Named regex presets for the `pattern` rule.
 * The frontend offers these as a dropdown; the validator resolves them
 * to their underlying regex before testing.
 */
export const PATTERN_PRESETS: Record<string, RegExp> = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^\+?[0-9\s\-().]{6,20}$/,
  url: /^https?:\/\/[^\s/$.?#].[^\s]*$/i,
  alphanumeric: /^[a-zA-Z0-9]+$/,
  no_special_chars: /^[a-zA-Z0-9\s]+$/,
};

// ─── Rules by field type ─────────────────────────────────────────────────────

/**
 * All configurable validation rules, grouped by field type.
 * Each entry describes the rule for the UI configurator.
 */
export const RULES_BY_FIELD_TYPE: Record<FieldType, RuleDefinition[]> = {
  text: [
    {
      rule: "minLength",
      description: "Minimum number of characters",
      paramType: "number",
      example: 3,
    },
    {
      rule: "maxLength",
      description: "Maximum number of characters",
      paramType: "number",
      example: 100,
    },
    {
      rule: "pattern",
      description:
        'Regex pattern or preset name ("email", "phone", "url", "alphanumeric", "no_special_chars")',
      paramType: "string",
      example: "email",
    },
  ],

  number: [
    {
      rule: "min",
      description: "Minimum allowed value",
      paramType: "number",
      example: 0,
    },
    {
      rule: "max",
      description: "Maximum allowed value",
      paramType: "number",
      example: 999,
    },
    {
      rule: "integer",
      description: "Must be a whole number (no decimals)",
      paramType: "boolean",
      example: true,
    },
  ],

  boolean: [
    {
      rule: "mustBeTrue",
      description: "Checkbox must be checked (e.g. accept terms)",
      paramType: "boolean",
      example: true,
    },
  ],

  date: [
    {
      rule: "minDate",
      description: "Earliest allowed date (ISO 8601)",
      paramType: "iso-date",
      example: "2020-01-01",
    },
    {
      rule: "maxDate",
      description: "Latest allowed date (ISO 8601)",
      paramType: "iso-date",
      example: "2030-12-31",
    },
    {
      rule: "pastOnly",
      description: "Date must be in the past (relative to today)",
      paramType: "boolean",
      example: true,
    },
    {
      rule: "futureOnly",
      description: "Date must be in the future (relative to today)",
      paramType: "boolean",
      example: true,
    },
  ],

  photo: [
    {
      rule: "maxSizeKb",
      description: "Maximum file size in kilobytes",
      paramType: "number",
      example: 2048,
    },
    {
      rule: "allowedFormats",
      description: 'Allowed file extensions (e.g. ["jpg", "png", "webp"])',
      paramType: "string[]",
      example: ["jpg", "png", "webp"],
    },
  ],

  select: [
    {
      rule: SELECT_OPTIONS_RULE,
      description: "List of valid option values",
      paramType: "string[]",
      example: ["option_a", "option_b"],
    },
    {
      rule: "allowMultiple",
      description: "Allow selecting multiple options (value becomes an array)",
      paramType: "boolean",
      example: true,
    },
  ],
};

/**
 * Get all configurable rule definitions for a given field type.
 *
 * @param fieldType - The field type to query.
 * @returns Array of RuleDefinition objects for that type.
 */
export function getRulesForFieldType(fieldType: FieldType): RuleDefinition[] {
  return RULES_BY_FIELD_TYPE[fieldType] ?? [];
}

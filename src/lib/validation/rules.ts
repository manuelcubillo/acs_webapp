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
      rule: "options",
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

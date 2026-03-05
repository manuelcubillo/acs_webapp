/**
 * Validation System - Error Messages
 *
 * Default error message templates for each validation rule.
 * Templates support {{label}} and {{value}} placeholders.
 *
 * To internationalise: swap DEFAULT_MESSAGES for a locale-specific object
 * and pass it through resolveMessage.
 */

/** Map of rule name → message template string. */
export type MessageMap = Record<string, string>;

/**
 * Default English message templates.
 * {{label}} → field label, {{value}} → rule parameter value.
 */
export const DEFAULT_MESSAGES: MessageMap = {
  required: "{{label}} is required",
  minLength: "{{label}} must be at least {{value}} characters",
  maxLength: "{{label}} must be at most {{value}} characters",
  pattern: "{{label}} has an invalid format",
  min: "{{label}} must be at least {{value}}",
  max: "{{label}} must be at most {{value}}",
  integer: "{{label}} must be a whole number",
  mustBeTrue: "{{label}} must be accepted",
  minDate: "{{label}} must be on or after {{value}}",
  maxDate: "{{label}} must be on or before {{value}}",
  pastOnly: "{{label}} must be a past date",
  futureOnly: "{{label}} must be a future date",
  maxSizeKb: "{{label}} must be smaller than {{value}}KB",
  allowedFormats: "{{label}} must be one of: {{value}}",
  options: "{{label}} has an invalid selection",
  allowMultiple: "{{label}} contains invalid selections",
};

/**
 * Resolve the final error message for a rule failure.
 *
 * Priority:
 * 1. `customMessage` — client-defined message stored in the ValidationRule.
 * 2. Template from `messages` map with {{label}} / {{value}} replaced.
 * 3. Generic fallback if the rule has no template entry.
 *
 * @param rule          - The rule identifier (e.g. "minLength").
 * @param fieldLabel    - The human-readable field label.
 * @param ruleValue     - The rule's parameter value (used in {{value}}).
 * @param customMessage - Optional client-provided message override.
 * @param messages      - Message map to use (defaults to DEFAULT_MESSAGES).
 * @returns The resolved, human-readable error message.
 */
export function resolveMessage(
  rule: string,
  fieldLabel: string,
  ruleValue: unknown,
  customMessage?: string,
  messages: MessageMap = DEFAULT_MESSAGES,
): string {
  // Client-defined message takes top priority.
  if (customMessage) {
    return customMessage
      .replace("{{label}}", fieldLabel)
      .replace("{{value}}", formatRuleValue(ruleValue));
  }

  const template = messages[rule];

  if (!template) {
    return `${fieldLabel} failed validation rule "${rule}"`;
  }

  return template
    .replace("{{label}}", fieldLabel)
    .replace("{{value}}", formatRuleValue(ruleValue));
}

/**
 * Format a rule value for display in error messages.
 * Arrays are joined as a comma-separated list.
 */
function formatRuleValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

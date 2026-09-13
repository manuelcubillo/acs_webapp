/**
 * Validation System - Error Messages
 *
 * Default error message templates for each validation rule, in Spanish.
 * Templates support {{label}} and {{value}} placeholders.
 *
 * To internationalise: swap DEFAULT_MESSAGES for a locale-specific object
 * and pass it through resolveMessage.
 */

/** Map of rule name → message template string. */
export type MessageMap = Record<string, string>;

/**
 * Default message templates, in Spanish — the language of every operator-facing
 * surface in this system. {{label}} → field label, {{value}} → rule parameter.
 *
 * Entries exist for rules that no longer appear in the card-type wizard
 * (`mustBeTrue`, `pastOnly`, `futureOnly`, `maxSizeKb`, `allowedFormats`).
 * That is deliberate: those rules were hidden from the configurator, not
 * unregistered, so a field definition that already stores one still needs its
 * message. See RULES_BY_FIELD_TYPE in `rules.ts`.
 */
export const DEFAULT_MESSAGES: MessageMap = {
  required: "{{label}} es obligatorio",
  minLength: "{{label}} debe tener al menos {{value}} caracteres",
  maxLength: "{{label}} no puede superar {{value}} caracteres",
  pattern: "El formato de {{label}} no es válido",
  min: "{{label}} no puede ser menor que {{value}}",
  max: "{{label}} no puede ser mayor que {{value}}",
  integer: "{{label}} debe ser un número entero",
  mustBeTrue: "Debes marcar {{label}}",
  minDate: "{{label}} no puede ser anterior al {{value}}",
  maxDate: "{{label}} no puede ser posterior al {{value}}",
  pastOnly: "{{label}} debe ser una fecha pasada",
  futureOnly: "{{label}} debe ser una fecha futura",
  maxSizeKb: "{{label}} no puede superar {{value}} KB",
  allowedFormats: "{{label}} debe tener uno de estos formatos: {{value}}",
  options: "{{label}} contiene una opción que no es válida",
  allowMultiple: "{{label}} contiene opciones que no son válidas",
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
    return `${fieldLabel} no cumple la regla de validación "${rule}"`;
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

// ─── Lifecycle scan messages ──────────────────────────────────────────────────

/**
 * Field label used for the synthetic lifecycle scan-validation check. The card
 * lifecycle status is not a real field, but it surfaces through the same
 * ScanValidationResult channel at scan time, so it needs a label.
 */
export const LIFECYCLE_SCAN_FIELD_LABEL = "Estado del carnet";

/**
 * Reason shown when a card is refused — or requires an override — at scan /
 * action time because of its lifecycle status. Displayed in the override modal,
 * stored in the action-log override reason, and returned as the external API
 * denial body. `expired` behaves exactly like `inactive`; the wording differs
 * only to stay informative if a future auto-expiry mechanism ever sets it.
 */
export const LIFECYCLE_SCAN_MESSAGES = {
  inactive: "El carnet está inactivo",
  expired: "El carnet ha expirado",
  archived: "El carnet está archivado",
} as const;

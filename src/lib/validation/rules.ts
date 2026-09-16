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

import type { FieldType, RuleDefinition, ValidationRule } from "./types";

// ─── Raw payload readers ─────────────────────────────────────────────────────

/**
 * Read the rule array out of a raw `validation_rules` payload.
 *
 * Accepts `unknown` because callers receive this payload in different shapes:
 * typed as `ValidationRules` from the form layer, and as an untyped JSONB blob
 * from the DAL (`CommonFieldDefinition.validationRules`). Anything malformed
 * yields an empty array — an unconfigured field is a valid state, not an error.
 */
function listRules(validationRules: unknown): ValidationRule[] {
  if (!validationRules || typeof validationRules !== "object") return [];

  const { rules } = validationRules as { rules?: unknown };
  if (!Array.isArray(rules)) return [];

  return rules.filter(
    (r): r is ValidationRule =>
      !!r && typeof r === "object" && typeof (r as { rule?: unknown }).rule === "string",
  );
}

/** Find a single rule by identifier in a raw `validation_rules` payload. */
function findRule(validationRules: unknown, ruleName: string): ValidationRule | undefined {
  return listRules(validationRules).find((r) => r.rule === ruleName);
}

// ─── Select configuration ────────────────────────────────────────────────────

/**
 * Identifier of the rule that carries a select field's allowed values.
 *
 * Single-sourced because the name is read from three unrelated layers (the
 * card form input, the shared field-filter builder, and the validator). Each
 * previously hard-coded its own spelling and two of them were wrong, which
 * silently produced empty dropdowns rather than an error.
 */
export const SELECT_OPTIONS_RULE = "options";

/** Identifier of the rule that lets a select field hold several values. */
export const ALLOW_MULTIPLE_RULE = "allowMultiple";

/**
 * Rules that CONFIGURE how a field behaves rather than validating what the
 * operator typed into it.
 *
 * A select's option list and its multiplicity are part of the field's
 * definition — they only live inside `validation_rules` because that is where
 * the jsonb column is. The card-type wizard therefore renders them in their
 * own section and the validation-rules configurator never lists them.
 *
 * The split is expressed here rather than by removing them from
 * `RULES_BY_FIELD_TYPE`, so the engine contract is untouched: both still have
 * an entry in `VALIDATOR_REGISTRY` and are still enforced on submit.
 */
export const FIELD_CONFIGURATION_RULES: readonly string[] = [
  SELECT_OPTIONS_RULE,
  ALLOW_MULTIPLE_RULE,
];

/**
 * Extract a select field's configured options from its `validation_rules` JSONB.
 *
 * @param validationRules - The raw `field_definitions.validation_rules` payload.
 * @returns The configured option values, or an empty array.
 */
export function getSelectOptions(validationRules: unknown): string[] {
  const optionsRule = findRule(validationRules, SELECT_OPTIONS_RULE);
  if (!Array.isArray(optionsRule?.value)) return [];

  return optionsRule.value.filter((o): o is string => typeof o === "string");
}

/**
 * Whether a select field is configured to accept several values at once.
 *
 * @param validationRules - The raw `field_definitions.validation_rules` payload.
 * @returns true only when the rule is present AND enabled.
 */
export function getAllowMultiple(validationRules: unknown): boolean {
  return findRule(validationRules, ALLOW_MULTIPLE_RULE)?.value === true;
}

/**
 * Count the rules that are genuinely input validation, excluding the
 * configuration rules above.
 *
 * Used by the badges that summarise a field ("2 reglas"): counting a select's
 * option list as a validation rule is the same category error this split
 * exists to correct.
 *
 * @param validationRules - The raw `field_definitions.validation_rules` payload.
 */
export function countValidationRules(validationRules: unknown): number {
  return listRules(validationRules).filter(
    (r) => !FIELD_CONFIGURATION_RULES.includes(r.rule),
  ).length;
}

// ─── Rule array mutation (UI helpers) ────────────────────────────────────────

/**
 * Return a copy of `rules` with `ruleName` set to `value`, appending it when
 * absent. Pure — the configurator UIs own their state and just re-render.
 */
export function upsertRule(
  rules: ValidationRule[],
  ruleName: string,
  value: unknown,
): ValidationRule[] {
  if (rules.some((r) => r.rule === ruleName)) {
    return rules.map((r) => (r.rule === ruleName ? { ...r, value } : r));
  }
  return [...rules, { rule: ruleName, value }];
}

/** Return a copy of `rules` without `ruleName`. */
export function removeRule(rules: ValidationRule[], ruleName: string): ValidationRule[] {
  return rules.filter((r) => r.rule !== ruleName);
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
      label: "Longitud mínima",
      description: "Número mínimo de caracteres.",
      paramType: "number",
      example: 3,
    },
    {
      rule: "maxLength",
      label: "Longitud máxima",
      description: "Número máximo de caracteres.",
      paramType: "number",
      example: 100,
    },
    {
      rule: "pattern",
      label: "Formato",
      description:
        "Formato predefinido (correo, teléfono, URL…) o expresión regular propia.",
      paramType: "string",
      example: "email",
    },
  ],

  number: [
    {
      rule: "min",
      label: "Valor mínimo",
      description: "El número no puede ser menor que este valor.",
      paramType: "number",
      example: 0,
    },
    {
      rule: "max",
      label: "Valor máximo",
      description: "El número no puede ser mayor que este valor.",
      paramType: "number",
      example: 999,
    },
    {
      rule: "integer",
      label: "Solo números enteros",
      description: "No se admiten decimales.",
      paramType: "boolean",
      example: true,
    },
  ],

  // ⚠️ HIDDEN ON PURPOSE — do not delete the validator.
  //
  // `mustBeTrue` («debe estar marcado») was taken out of the configurator on
  // 2026-09-08 to keep the operator's screen to decisions that matter here: a
  // Sí/No field that can only be saved as "Sí" is a terms-acceptance checkbox,
  // which this system has no use for. `validateMustBeTrue` stays registered in
  // VALIDATOR_REGISTRY so a field definition that already stores the rule keeps
  // being enforced. Re-add the entry below to bring it back.
  boolean: [],

  date: [
    {
      rule: "minDate",
      label: "Fecha mínima",
      description: "La fecha no puede ser anterior a esta.",
      paramType: "iso-date",
      example: "2020-01-01",
    },
    {
      rule: "maxDate",
      label: "Fecha máxima",
      description: "La fecha no puede ser posterior a esta.",
      paramType: "iso-date",
      example: "2030-12-31",
    },
    // ⚠️ HIDDEN ON PURPOSE — do not delete the validators.
    //
    // `pastOnly` / `futureOnly` («solo pasado» / «solo futuro») were taken out
    // of the configurator on 2026-09-08: they restate «Fecha mínima» /
    // «Fecha máxima» against a reference that moves every midnight, so a card
    // that saved cleanly yesterday can stop validating overnight. Their
    // validators stay registered in VALIDATOR_REGISTRY, so a field definition
    // that already stores one keeps being enforced. Re-add the entries here to
    // bring them back.
  ],

  // ⚠️ HIDDEN ON PURPOSE — do not delete.
  //
  // `maxSizeKb` and `allowedFormats` are commented out (2026-09-08) so they no
  // longer appear in the card-type wizard. Both are already guaranteed by the
  // upload pipeline, which is the reason the operator does not need to think
  // about them: `optimizeImage` (src/lib/images/) re-encodes every capture to
  // WebP under the size ceiling of CARD_PHOTO_PROFILE before it is uploaded,
  // and `confirmPhotoUploadAction` re-checks size + content-type server-side.
  // Configuring them by hand could only contradict that pipeline.
  //
  // Their validators stay registered in VALIDATOR_REGISTRY, so a field
  // definition that already stores one keeps being enforced. Uncomment to
  // bring them back into the configurator.
  photo: [
    // {
    //   rule: "maxSizeKb",
    //   label: "Tamaño máximo",
    //   description: "Tamaño máximo del archivo, en kilobytes.",
    //   paramType: "number",
    //   example: 2048,
    // },
    // {
    //   rule: "allowedFormats",
    //   label: "Formatos permitidos",
    //   description: "Extensiones de archivo admitidas.",
    //   paramType: "string[]",
    //   example: ["jpg", "png", "webp"],
    // },
  ],

  select: [
    {
      rule: SELECT_OPTIONS_RULE,
      label: "Opciones",
      description: "Lista de valores válidos.",
      paramType: "string[]",
      example: ["option_a", "option_b"],
    },
    {
      rule: ALLOW_MULTIPLE_RULE,
      label: "Selección múltiple",
      description: "Permite elegir varias opciones a la vez.",
      paramType: "boolean",
      example: true,
    },
  ],
};

/**
 * Get every rule definition the engine can enforce for a given field type,
 * configuration rules included.
 *
 * @param fieldType - The field type to query.
 * @returns Array of RuleDefinition objects for that type.
 */
export function getRulesForFieldType(fieldType: FieldType): RuleDefinition[] {
  return RULES_BY_FIELD_TYPE[fieldType] ?? [];
}

/**
 * Get the rule definitions a "validation rules" configurator should offer —
 * i.e. everything except the field-configuration rules, which get their own
 * dedicated UI section.
 *
 * A `select` yields an empty array today: both of its rules are configuration.
 *
 * @param fieldType - The field type to query.
 */
export function getValidationRulesForFieldType(fieldType: FieldType): RuleDefinition[] {
  return getRulesForFieldType(fieldType).filter(
    (def) => !FIELD_CONFIGURATION_RULES.includes(def.rule),
  );
}

/**
 * Validation System - Engine
 *
 * Orchestrates field and card validation using the validator registry.
 * Environment-agnostic: runs identically in browser, server, and tests.
 *
 * Usage:
 *   // Single field
 *   const result = validateField({ fieldDefinition, value });
 *
 *   // Full card (use this in form submit AND API routes)
 *   const result = validateCard(fieldDefinitions, values);
 */

import { VALIDATOR_REGISTRY } from "./validators";
import { resolveMessage } from "./messages";
import { getRulesForFieldType } from "./rules";
import type {
  FieldDefinitionShape,
  FieldValidationContext,
  FieldType,
  ValidationResult,
  ValidationError,
  RuleDefinition,
} from "./types";

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Return true if a value is considered empty (null, undefined, "", []). */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/** Build a ValidationError from a failed rule. */
function makeError(
  context: FieldValidationContext,
  rule: string,
  ruleValue: unknown,
  customMessage?: string,
): ValidationError {
  const { fieldDefinition } = context;
  return {
    fieldId: fieldDefinition.id,
    fieldLabel: fieldDefinition.label,
    rule,
    message: resolveMessage(
      rule,
      fieldDefinition.label,
      ruleValue,
      customMessage,
    ),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate a single field value against its definition and configured rules.
 *
 * Evaluation order:
 * 1. `isRequired` check — if it fails, stop immediately (no further rules).
 * 2. If the value is empty and the field is not required → pass (return valid).
 * 3. Iterate over each rule in `validationRules.rules`, collect all failures.
 *
 * @param context - Field definition + value + optional form values.
 * @returns ValidationResult with valid flag and collected errors.
 */
export function validateField(context: FieldValidationContext): ValidationResult {
  const errors: ValidationError[] = [];
  const { fieldDefinition, value } = context;

  // ── Step 1: required check ─────────────────────────────────────────────────
  if (fieldDefinition.isRequired) {
    const requiredValidator = VALIDATOR_REGISTRY["required"];
    if (requiredValidator && !requiredValidator(value, true, context)) {
      errors.push(makeError(context, "required", null));
      // Stop here — no point running other rules on an empty required field.
      return { valid: false, errors };
    }
  }

  // ── Step 2: skip remaining rules if empty and optional ────────────────────
  if (isEmpty(value)) {
    return { valid: true, errors: [] };
  }

  // ── Step 3: run configured rules ──────────────────────────────────────────
  const rules = fieldDefinition.validationRules?.rules ?? [];

  for (const ruleEntry of rules) {
    const validator = VALIDATOR_REGISTRY[ruleEntry.rule];

    if (!validator) {
      // Unknown rule — skip silently. Log in dev for discoverability.
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[validation] Unknown rule "${ruleEntry.rule}" on field "${fieldDefinition.name}". ` +
            `Register it in VALIDATOR_REGISTRY to activate it.`,
        );
      }
      continue;
    }

    const passed = validator(value, ruleEntry.value, context);
    if (!passed) {
      errors.push(makeError(context, ruleEntry.rule, ruleEntry.value, ruleEntry.message));
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate all fields of a card at once.
 *
 * This is the top-level function called both in:
 * - Frontend: on form submit, to show inline errors.
 * - Backend: in the DAL createCard/updateCard, as a second safety net.
 *
 * @param fieldDefinitions - Active field definitions for the card type.
 * @param values           - Map of fieldDefinitionId → value.
 * @returns Aggregated ValidationResult across all fields.
 */
export function validateCard(
  fieldDefinitions: FieldDefinitionShape[],
  values: Record<string, unknown>,
): ValidationResult {
  const allErrors: ValidationError[] = [];

  for (const fd of fieldDefinitions) {
    const value = values[fd.id] ?? null;
    const context: FieldValidationContext = {
      fieldDefinition: fd,
      value,
      allValues: values,
    };

    const result = validateField(context);
    allErrors.push(...result.errors);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * Get the configurable rule definitions for a field type.
 *
 * Frontend helper: use this to render the rule builder UI when
 * a user is configuring a FieldDefinition.
 *
 * @param fieldType - The field type to query.
 * @returns Array of RuleDefinition objects describing the available rules.
 */
export function getApplicableRules(fieldType: FieldType): RuleDefinition[] {
  return getRulesForFieldType(fieldType);
}

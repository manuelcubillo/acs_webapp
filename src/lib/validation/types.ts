/**
 * Validation System - Types
 *
 * Pure TypeScript types for the shared validation engine.
 * No external dependencies — safe to import in any environment
 * (browser, server, edge runtime, tests).
 */

// ─── Field type ──────────────────────────────────────────────────────────────

/** Union of all supported field types. Must match the DB enum. */
export type FieldType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "photo"
  | "select";

// ─── Validation rules (stored in JSONB) ─────────────────────────────────────

/**
 * A single validation rule stored inside field_definitions.validation_rules.
 *
 * @example
 * { rule: "minLength", value: 3 }
 * { rule: "pattern",   value: "email" }
 * { rule: "max",       value: 100, message: "El número no puede superar 100" }
 */
export interface ValidationRule {
  /** Rule identifier — must match a key in VALIDATOR_REGISTRY. */
  rule: string;
  /** Parameter for the rule (e.g. 5 for minLength, "email" for pattern). */
  value: unknown;
  /** Optional client-defined message that overrides the default. */
  message?: string;
}

/**
 * The full JSONB payload stored in field_definitions.validation_rules.
 * Wraps an array of rules so the shape is extensible.
 */
export interface ValidationRules {
  rules: ValidationRule[];
}

// ─── Validation context ──────────────────────────────────────────────────────

/** Minimal field definition shape needed by the engine. */
export interface FieldDefinitionShape {
  id: string;
  name: string;
  label: string;
  fieldType: FieldType;
  isRequired: boolean;
  /** Null means no rules configured beyond isRequired. */
  validationRules: ValidationRules | null;
}

/**
 * All information the engine needs to validate a single field value.
 */
export interface FieldValidationContext {
  fieldDefinition: FieldDefinitionShape;
  /** The runtime value to validate. */
  value: unknown;
  /**
   * All form values — provided for potential cross-field rules in the future.
   * Optional: pass when validating inside a form.
   */
  allValues?: Record<string, unknown>;
}

// ─── Validation results ──────────────────────────────────────────────────────

/** A single validation failure for a field. */
export interface ValidationError {
  /** The field definition ID. */
  fieldId: string;
  /** The human-readable field label. */
  fieldLabel: string;
  /** The rule that failed (e.g. "minLength"). */
  rule: string;
  /** The resolved error message (default or custom). */
  message: string;
}

/** The outcome of validating one or more fields. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ─── Validator function signature ────────────────────────────────────────────

/**
 * Signature all validator functions must implement.
 *
 * @param value      - The field value to test.
 * @param ruleValue  - The rule parameter (e.g. 5 for minLength).
 * @param context    - Full validation context for advanced validators.
 * @returns true if the value passes the rule, false otherwise.
 */
export type ValidatorFn = (
  value: unknown,
  ruleValue: unknown,
  context: FieldValidationContext,
) => boolean;

// ─── Rules registry / definition ─────────────────────────────────────────────

/** Parameter type for a rule definition — used in the frontend configurator. */
export type RuleParamType =
  | "number"
  | "string"
  | "boolean"
  | "string[]"
  | "iso-date";

/** Describes a single configurable rule (used to render rule configurators). */
export interface RuleDefinition {
  /** Rule identifier — matches the key in VALIDATOR_REGISTRY. */
  rule: string;
  /** Human-readable description for the rule configurator UI. */
  description: string;
  /** Type of the rule's value parameter. */
  paramType: RuleParamType;
  /** Example value shown in the configurator. */
  example?: unknown;
}

/**
 * Validation System - Validators
 *
 * One pure function per validation rule, all sharing the same signature:
 *   (value, ruleValue, context) => boolean
 *
 * Functions return true if the value PASSES the rule, false if it fails.
 *
 * To add a new rule:
 *   1. Implement the function here.
 *   2. Register it in VALIDATOR_REGISTRY at the bottom.
 *   3. Add it to RULES_BY_FIELD_TYPE in rules.ts.
 *   4. Add its default message to DEFAULT_MESSAGES in messages.ts.
 */

import { PATTERN_PRESETS } from "./rules";
import type { FieldValidationContext, ValidatorFn } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return true if a value is considered empty (null, undefined, "", []). */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/** Parse a value into a Date, returning null if invalid. */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Return today at midnight (start of day) for relative date comparisons. */
function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── Validators ───────────────────────────────────────────────────────────────

/**
 * Check that a value is not empty.
 * Handles strings, arrays, null, and undefined.
 */
export const validateRequired: ValidatorFn = (
  value,
  _ruleValue,
  _context,
): boolean => {
  return !isEmpty(value);
};

/**
 * Check that a string meets a minimum character length.
 * @param ruleValue - Minimum length (number).
 */
export const validateMinLength: ValidatorFn = (
  value,
  ruleValue,
  _context,
): boolean => {
  if (typeof value !== "string") return false;
  return value.length >= Number(ruleValue);
};

/**
 * Check that a string does not exceed a maximum character length.
 * @param ruleValue - Maximum length (number).
 */
export const validateMaxLength: ValidatorFn = (
  value,
  ruleValue,
  _context,
): boolean => {
  if (typeof value !== "string") return false;
  return value.length <= Number(ruleValue);
};

/**
 * Check that a string matches a regex pattern or a named preset.
 *
 * @param ruleValue - A regex string or a preset key from PATTERN_PRESETS
 *                   ("email", "phone", "url", "alphanumeric", "no_special_chars").
 */
export const validatePattern: ValidatorFn = (
  value,
  ruleValue,
  _context,
): boolean => {
  if (typeof value !== "string") return false;
  const patternStr = String(ruleValue);

  // Resolve named preset first.
  const preset = PATTERN_PRESETS[patternStr];
  if (preset) return preset.test(value);

  // Otherwise treat as a raw regex string.
  try {
    return new RegExp(patternStr).test(value);
  } catch {
    // Invalid regex — fail open (don't block the user).
    return true;
  }
};

/**
 * Check that a number meets a minimum value.
 * @param ruleValue - Minimum value (number).
 */
export const validateMin: ValidatorFn = (
  value,
  ruleValue,
  _context,
): boolean => {
  if (typeof value !== "number" || isNaN(value)) return false;
  return value >= Number(ruleValue);
};

/**
 * Check that a number does not exceed a maximum value.
 * @param ruleValue - Maximum value (number).
 */
export const validateMax: ValidatorFn = (
  value,
  ruleValue,
  _context,
): boolean => {
  if (typeof value !== "number" || isNaN(value)) return false;
  return value <= Number(ruleValue);
};

/**
 * Check that a number is an integer (no decimal component).
 * Only enforced when ruleValue is true.
 */
export const validateInteger: ValidatorFn = (
  value,
  ruleValue,
  _context,
): boolean => {
  if (!ruleValue) return true; // rule disabled
  if (typeof value !== "number" || isNaN(value)) return false;
  return Number.isInteger(value);
};

/**
 * Check that a boolean value is exactly true.
 * Useful for "accept terms" checkboxes.
 * Only enforced when ruleValue is true.
 */
export const validateMustBeTrue: ValidatorFn = (
  value,
  ruleValue,
  _context,
): boolean => {
  if (!ruleValue) return true; // rule disabled
  return value === true;
};

/**
 * Check that a date is on or after a minimum date.
 * @param ruleValue - ISO 8601 date string (e.g. "2020-01-01").
 */
export const validateMinDate: ValidatorFn = (
  value,
  ruleValue,
  _context,
): boolean => {
  const date = toDate(value);
  const min = toDate(ruleValue);
  if (!date || !min) return false;
  return date >= min;
};

/**
 * Check that a date is on or before a maximum date.
 * @param ruleValue - ISO 8601 date string (e.g. "2030-12-31").
 */
export const validateMaxDate: ValidatorFn = (
  value,
  ruleValue,
  _context,
): boolean => {
  const date = toDate(value);
  const max = toDate(ruleValue);
  if (!date || !max) return false;
  return date <= max;
};

/**
 * Check that a date is strictly in the past (before today's midnight).
 * Only enforced when ruleValue is true.
 */
export const validatePastOnly: ValidatorFn = (
  value,
  ruleValue,
  _context,
): boolean => {
  if (!ruleValue) return true;
  const date = toDate(value);
  if (!date) return false;
  return date < today();
};

/**
 * Check that a date is strictly in the future (after today's midnight).
 * Only enforced when ruleValue is true.
 */
export const validateFutureOnly: ValidatorFn = (
  value,
  ruleValue,
  _context,
): boolean => {
  if (!ruleValue) return true;
  const date = toDate(value);
  if (!date) return false;
  return date > today();
};

/**
 * Check that a photo URL's metadata indicates a file smaller than maxSizeKb.
 *
 * In the browser, pass the File object's size as metadata via a separate
 * mechanism (the engine validates URL strings; file size validation is
 * typically done by the upload handler). This validator is a no-op on
 * plain string URLs — it only activates if value is an object with a
 * `sizeKb` property (e.g. { url: "...", sizeKb: 512 }).
 *
 * @param ruleValue - Maximum size in kilobytes (number).
 */
export const validateMaxSizeKb: ValidatorFn = (
  value,
  ruleValue,
  _context,
): boolean => {
  if (typeof value === "object" && value !== null && "sizeKb" in value) {
    return (value as { sizeKb: number }).sizeKb <= Number(ruleValue);
  }
  // Plain string URL — cannot validate size here.
  return true;
};

/**
 * Check that a photo URL or metadata object has an allowed file extension.
 *
 * Accepts:
 *  - string URL (inspects the path for extension)
 *  - { url: string, ext?: string } metadata object
 *
 * @param ruleValue - Array of allowed extensions (e.g. ["jpg", "png"]).
 */
export const validateAllowedFormats: ValidatorFn = (
  value,
  ruleValue,
  _context,
): boolean => {
  const allowed = Array.isArray(ruleValue)
    ? (ruleValue as string[]).map((e) => e.toLowerCase())
    : [];

  if (allowed.length === 0) return true; // no restriction

  let ext = "";

  if (typeof value === "string") {
    const parts = value.split(".");
    ext = (parts.at(-1) ?? "").toLowerCase().split("?")[0]; // strip query params
  } else if (
    typeof value === "object" &&
    value !== null &&
    "ext" in value
  ) {
    ext = String((value as { ext: string }).ext).toLowerCase();
  }

  return allowed.includes(ext);
};

/**
 * Check that a select value is one of the allowed options.
 * @param ruleValue - Array of valid option strings.
 */
export const validateOptions: ValidatorFn = (
  value,
  ruleValue,
  _context,
): boolean => {
  const options = Array.isArray(ruleValue) ? (ruleValue as string[]) : [];
  if (options.length === 0) return true;
  return options.includes(String(value));
};

/**
 * Check that all items in a multi-select array are valid options.
 * Requires the value to be an array. If allowMultiple is false, a non-array
 * value is acceptable (handled by the `options` rule instead).
 *
 * @param ruleValue - true to enforce multi-select, false to skip.
 */
export const validateAllowMultiple: ValidatorFn = (
  value,
  ruleValue,
  context,
): boolean => {
  if (!ruleValue) return true; // rule disabled

  if (!Array.isArray(value)) return false;

  // Each selected item must appear in the `options` rule's list.
  const optionsRule = context.fieldDefinition.validationRules?.rules.find(
    (r) => r.rule === "options",
  );
  const options = Array.isArray(optionsRule?.value)
    ? (optionsRule!.value as string[])
    : [];

  if (options.length === 0) return true;
  return (value as unknown[]).every((item) => options.includes(String(item)));
};

// ─── Validator registry ───────────────────────────────────────────────────────

/**
 * Maps rule identifiers to their validator functions.
 *
 * This is the single extension point: add a new entry here to register
 * a new rule without touching the engine.
 */
export const VALIDATOR_REGISTRY: Record<string, ValidatorFn> = {
  required: validateRequired,
  minLength: validateMinLength,
  maxLength: validateMaxLength,
  pattern: validatePattern,
  min: validateMin,
  max: validateMax,
  integer: validateInteger,
  mustBeTrue: validateMustBeTrue,
  minDate: validateMinDate,
  maxDate: validateMaxDate,
  pastOnly: validatePastOnly,
  futureOnly: validateFutureOnly,
  maxSizeKb: validateMaxSizeKb,
  allowedFormats: validateAllowedFormats,
  options: validateOptions,
  allowMultiple: validateAllowMultiple,
};

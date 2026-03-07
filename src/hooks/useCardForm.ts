"use client";

import { useState, useCallback } from "react";
import { validateCard } from "@/lib/validation";
import type { FieldDefinitionShape } from "@/lib/validation/types";

export function useCardForm(
  fields: FieldDefinitionShape[],
  initialValues: Record<string, unknown> = {},
) {
  const [values, setValues] = useState<Record<string, unknown>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const setValue = useCallback((fieldId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    // Clear field error on change.
    setErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }, []);

  const validate = useCallback((): boolean => {
    const result = validateCard(fields, values);
    if (!result.valid) {
      const errs: Record<string, string> = {};
      for (const err of result.errors) {
        if (!errs[err.fieldId]) {
          errs[err.fieldId] = err.message;
        }
      }
      setErrors(errs);
      return false;
    }
    setErrors({});
    return true;
  }, [fields, values]);

  return { values, errors, setValue, validate, isLoading, setIsLoading, setValues };
}

"use client";

import { useState, useEffect, useCallback } from "react";

const DEFAULT_VISIBLE_COUNT = 5;

/**
 * Manages which card field columns are visible in the table view.
 * Persists selection to localStorage keyed by `columns_[cardTypeId]`.
 */
export function useCardColumns(cardTypeId: string, fieldIds: string[]) {
  const storageKey = `columns_${cardTypeId}`;

  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    if (typeof window === "undefined") {
      return fieldIds.slice(0, DEFAULT_VISIBLE_COUNT);
    }
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        // Only keep IDs that still exist in the current schema.
        const filtered = parsed.filter((id) => fieldIds.includes(id));
        if (filtered.length > 0) return filtered;
      }
    } catch {
      // ignore parse errors
    }
    return fieldIds.slice(0, DEFAULT_VISIBLE_COUNT);
  });

  // Persist whenever selection changes.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(visibleColumns));
    } catch {
      // ignore write errors
    }
  }, [storageKey, visibleColumns]);

  const toggleColumn = useCallback(
    (fieldId: string) => {
      setVisibleColumns((prev) => {
        if (prev.includes(fieldId)) {
          // Keep at least one column visible.
          if (prev.length === 1) return prev;
          return prev.filter((id) => id !== fieldId);
        }
        return [...prev, fieldId];
      });
    },
    [],
  );

  const resetColumns = useCallback(() => {
    setVisibleColumns(fieldIds.slice(0, DEFAULT_VISIBLE_COUNT));
  }, [fieldIds]);

  return { visibleColumns, toggleColumn, resetColumns };
}

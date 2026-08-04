"use client";

import { useState, useEffect, useCallback } from "react";

const DEFAULT_VISIBLE_COUNT = 5;

/**
 * Read the persisted selection, keeping only ids that still exist in the
 * current schema. Returns null when there is nothing usable stored.
 */
function readStoredColumns(
  storageKey: string,
  fieldIds: string[],
): string[] | null {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as string[];
    const filtered = parsed.filter((id) => fieldIds.includes(id));
    return filtered.length > 0 ? filtered : null;
  } catch {
    // Unreadable or malformed — fall back to the schema default.
    return null;
  }
}

/**
 * Manages which card field columns are visible in the table view.
 * Persists selection to localStorage keyed by `columns_[cardTypeId]`.
 *
 * The stored selection is adopted **after** mount, never during render. The
 * table is server-rendered, so a render-time `localStorage` read makes the
 * first client render disagree with the server's HTML whenever the user has
 * saved a selection other than the default — React then discards the whole
 * SSR-ed list and regenerates it on the client (a thrown hydration error, a
 * visible flash, and a re-request of every photo thumbnail).
 */
export function useCardColumns(cardTypeId: string, fieldIds: string[]) {
  const storageKey = `columns_${cardTypeId}`;
  // `fieldIds` is rebuilt on every render; depend on its content, not identity.
  const fieldIdsKey = fieldIds.join(",");

  const [visibleColumns, setVisibleColumns] = useState<string[]>(() =>
    fieldIds.slice(0, DEFAULT_VISIBLE_COUNT),
  );
  const [loaded, setLoaded] = useState(false);

  // Adopt the persisted selection once the browser is available.
  useEffect(() => {
    setVisibleColumns(
      readStoredColumns(storageKey, fieldIds) ??
        fieldIds.slice(0, DEFAULT_VISIBLE_COUNT),
    );
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, fieldIdsKey]);

  // Persist only once the stored value has been adopted — writing before that
  // would overwrite the user's selection with the render-time default.
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(visibleColumns));
    } catch {
      // ignore write errors
    }
  }, [storageKey, visibleColumns, loaded]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldIdsKey]);

  return { visibleColumns, toggleColumn, resetColumns };
}

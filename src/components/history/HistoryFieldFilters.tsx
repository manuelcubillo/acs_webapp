"use client";

/**
 * HistoryFieldFilters
 *
 * Loads common field definitions for the given card types and renders the
 * shared FieldFilterBuilder. The caller passes the *effective* types — the
 * selection, or every active type when nothing is selected — so the builder is
 * available without picking a type first, as on the card list.
 */

import { useEffect, useState } from "react";
import { getCommonFieldDefinitionsAction } from "@/lib/actions/action-history";
import type { CommonFieldDefinition, FieldFilter } from "@/lib/dal";
import FieldFilterBuilder from "@/components/shared/FieldFilterBuilder";

interface HistoryFieldFiltersProps {
  cardTypeIds: string[];
  value: FieldFilter[];
  onChange: (filters: FieldFilter[]) => void;
}

export default function HistoryFieldFilters({
  cardTypeIds,
  value,
  onChange,
}: HistoryFieldFiltersProps) {
  const [fieldDefs, setFieldDefs] = useState<CommonFieldDefinition[]>([]);
  const [loading, setLoading] = useState(false);

  // Reload field definitions whenever the card type selection changes
  useEffect(() => {
    if (cardTypeIds.length === 0) {
      setFieldDefs([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getCommonFieldDefinitionsAction(cardTypeIds).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.success) {
        setFieldDefs(res.data);
      }
    });

    return () => {
      cancelled = true;
    };
    // Use join as stable dep — avoids re-running when array ref changes but content is same
  }, [cardTypeIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="py-2 text-xs text-muted-foreground">
        Cargando campos…
      </div>
    );
  }

  if (fieldDefs.length === 0) return null;

  return (
    <FieldFilterBuilder
      fields={fieldDefs}
      filters={value}
      onFiltersChange={onChange}
    />
  );
}

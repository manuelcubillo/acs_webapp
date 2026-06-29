"use client";

import Link from "next/link";

import DynamicFieldRenderer from "./DynamicFieldRenderer";
import type { CardWithFields, FieldDefinition } from "@/lib/dal/types";

const TEXT = {
  EMPTY: "No se encontraron carnets.",
} as const;

interface CardProfileViewProps {
  cards: CardWithFields[];
  fields: FieldDefinition[];
  /**
   * Ordered field definition IDs from card_type_summary_fields.
   * When non-empty, only these fields are shown (in order).
   * Falls back to the first 3 fields when empty or not provided.
   */
  summaryFieldIds?: string[];
}

export default function CardProfileView({
  cards,
  fields,
  summaryFieldIds = [],
}: CardProfileViewProps) {
  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
        {TEXT.EMPTY}
      </div>
    );
  }

  const previewFields: FieldDefinition[] =
    summaryFieldIds.length > 0
      ? summaryFieldIds
          .map((id) => fields.find((f) => f.id === id))
          .filter((f): f is FieldDefinition => f !== undefined)
      : fields.slice(0, 3);

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
      {cards.map((card) => {
        const valueMap: Record<string, unknown> = {};
        for (const fv of card.fields) {
          valueMap[fv.fieldDefinitionId] = fv.value;
        }

        return (
          <Link
            key={card.id}
            href={`/cards/${encodeURIComponent(card.code)}?from=cards`}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-shadow hover:border-ring/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="self-start rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-bold text-muted-foreground">
              {card.code}
            </span>

            <div className="flex flex-col gap-2">
              {previewFields.map((f) => (
                <div key={f.id} className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {f.label}
                  </span>
                  <DynamicFieldRenderer
                    fieldType={f.fieldType}
                    value={valueMap[f.id]}
                    label={f.label}
                  />
                </div>
              ))}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

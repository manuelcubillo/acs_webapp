"use client";

import Link from "next/link";
import type { CardWithFields, FieldDefinition } from "@/lib/dal/types";
import DynamicFieldRenderer from "./DynamicFieldRenderer";

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

export default function CardProfileView({ cards, fields, summaryFieldIds = [] }: CardProfileViewProps) {
  if (cards.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "60px 24px",
          color: "var(--color-muted)",
          fontSize: 14,
        }}
      >
        No se encontraron carnets.
      </div>
    );
  }

  // Use configured summary fields (in order), or fall back to first 3.
  const previewFields: FieldDefinition[] =
    summaryFieldIds.length > 0
      ? summaryFieldIds
          .map((id) => fields.find((f) => f.id === id))
          .filter((f): f is FieldDefinition => f !== undefined)
      : fields.slice(0, 3);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 16,
      }}
    >
      {cards.map((card) => {
        const valueMap: Record<string, unknown> = {};
        for (const fv of card.fields) {
          valueMap[fv.fieldDefinitionId] = fv.value;
        }

        return (
          <Link
            key={card.id}
            href={`/cards/${encodeURIComponent(card.code)}?from=cards`}
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid var(--color-border)",
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              textDecoration: "none",
              color: "inherit",
              transition: "box-shadow 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 2px 12px rgba(37,99,235,0.10)";
              (e.currentTarget as HTMLElement).style.borderColor =
                "var(--color-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "none";
              (e.currentTarget as HTMLElement).style.borderColor =
                "var(--color-border)";
            }}
          >
            {/* Code badge */}
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--color-muted)",
                background: "#f3f4f6",
                padding: "2px 8px",
                borderRadius: 6,
                alignSelf: "flex-start",
              }}
            >
              {card.code}
            </span>

            {/* Fields */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              {previewFields.map((f) => (
                <div
                  key={f.id}
                  style={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--color-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
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

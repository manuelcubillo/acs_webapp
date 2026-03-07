"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { CardWithFields, FieldDefinition } from "@/lib/dal/types";
import DynamicFieldRenderer from "./DynamicFieldRenderer";

interface CardProfileViewProps {
  cards: CardWithFields[];
  fields: FieldDefinition[];
}

export default function CardProfileView({ cards, fields }: CardProfileViewProps) {
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

  // Show first 6 fields in profile cards.
  const previewFields = fields.slice(0, 6);

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
          <div
            key={card.id}
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid var(--color-border)",
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--color-muted)",
                  background: "#f3f4f6",
                  padding: "2px 8px",
                  borderRadius: 6,
                }}
              >
                {card.code}
              </span>
              <Link
                href={`/cards/${encodeURIComponent(card.code)}`}
                style={{
                  color: "var(--color-primary)",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <ExternalLink size={14} />
              </Link>
            </div>

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
          </div>
        );
      })}
    </div>
  );
}

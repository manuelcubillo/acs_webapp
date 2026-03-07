"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { CardWithFields, FieldDefinition } from "@/lib/dal/types";
import DynamicFieldRenderer from "./DynamicFieldRenderer";

interface CardTableViewProps {
  cards: CardWithFields[];
  fields: FieldDefinition[];
  visibleColumns: string[];
}

export default function CardTableView({
  cards,
  fields,
  visibleColumns,
}: CardTableViewProps) {
  const visible = fields.filter((f) => visibleColumns.includes(f.id));

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

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 12px",
    fontWeight: 700,
    color: "var(--color-muted)",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    whiteSpace: "nowrap",
    background: "#fafafa",
  };

  return (
    <div
      style={{
        overflowX: "auto",
        background: "#fff",
        borderRadius: 12,
        border: "1px solid var(--color-border)",
      }}
    >
      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
      >
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
            <th style={thStyle}>Código</th>
            {visible.map((f) => (
              <th key={f.id} style={thStyle}>
                {f.label}
              </th>
            ))}
            <th style={{ ...thStyle, width: 44 }} />
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => {
            const valueMap: Record<string, unknown> = {};
            for (const fv of card.fields) {
              valueMap[fv.fieldDefinitionId] = fv.value;
            }
            return (
              <tr
                key={card.id}
                style={{ borderBottom: "1px solid var(--color-border-soft)" }}
              >
                <td
                  style={{
                    padding: "10px 12px",
                    fontFamily: "monospace",
                    fontWeight: 600,
                    fontSize: 12,
                    color: "var(--color-dark)",
                  }}
                >
                  {card.code}
                </td>
                {visible.map((f) => (
                  <td key={f.id} style={{ padding: "10px 12px" }}>
                    <DynamicFieldRenderer
                      fieldType={f.fieldType}
                      value={valueMap[f.id]}
                      label={f.label}
                    />
                  </td>
                ))}
                <td style={{ padding: "10px 12px" }}>
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

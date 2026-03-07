"use client";

/**
 * CardTypeCard
 *
 * A card that displays a single card type in the list view.
 * Shows name, description, field count, action count, and active status.
 * Clicking navigates to the detail page.
 */

import { useRouter } from "next/navigation";
import {
  CreditCard,
  Pencil,
  ChevronRight,
  CircleDot,
  CircleOff,
} from "lucide-react";
import type { CardTypeWithFullSchema } from "@/lib/dal";

interface CardTypeCardProps {
  cardType: CardTypeWithFullSchema;
  showEditButton?: boolean;
}

export default function CardTypeCard({
  cardType,
  showEditButton = false,
}: CardTypeCardProps) {
  const router = useRouter();

  const activeFields = cardType.fieldDefinitions.filter((f) => f.isActive);
  const requiredFields = activeFields.filter((f) => f.isRequired);
  const activeActions = cardType.actionDefinitions.filter((a) => a.isActive);

  return (
    <div
      className="card animate-fadein"
      style={{
        padding: "20px 24px",
        cursor: "pointer",
        transition: "box-shadow 0.15s ease, transform 0.1s ease",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
      onClick={() => router.push(`/card-types/${cardType.id}`)}
      onMouseOver={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 20px rgba(79,91,255,0.12)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-card)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      }}
    >
      {/* Top row: icon + name + status + edit */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        {/* Icon */}
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 13,
            background: cardType.isActive
              ? "linear-gradient(135deg, #eef0ff, #dde1ff)"
              : "#f3f4f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: cardType.isActive ? "var(--color-primary)" : "var(--color-muted)",
            flexShrink: 0,
            border: `1.5px solid ${cardType.isActive ? "#c7d2fe" : "var(--color-border)"}`,
          }}
        >
          <CreditCard size={22} strokeWidth={1.6} />
        </div>

        {/* Name + description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h3
              style={{
                fontSize: 15,
                fontWeight: 700,
                fontFamily: "var(--font-heading)",
                color: "var(--color-dark)",
                margin: 0,
              }}
            >
              {cardType.name}
            </h3>
            {/* Active badge */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10.5,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 6,
                background: cardType.isActive ? "#ecfdf5" : "#f3f4f6",
                color: cardType.isActive ? "#059669" : "#6b7094",
                border: `1px solid ${cardType.isActive ? "#a7f3d0" : "#e5e7eb"}`,
              }}
            >
              {cardType.isActive ? (
                <CircleDot size={10} strokeWidth={2} />
              ) : (
                <CircleOff size={10} strokeWidth={2} />
              )}
              {cardType.isActive ? "Activo" : "Inactivo"}
            </span>
          </div>
          {cardType.description && (
            <p
              style={{
                fontSize: 12.5,
                color: "var(--color-secondary)",
                marginTop: 4,
                lineHeight: 1.5,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {cardType.description}
            </p>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {showEditButton && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/card-types/${cardType.id}/edit`);
              }}
              title="Editar tipo de tarjeta"
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                border: "1.5px solid var(--color-border)",
                background: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-secondary)",
                transition: "all 0.15s",
              }}
              onMouseOver={(e) => {
                e.stopPropagation();
                (e.currentTarget as HTMLButtonElement).style.background = "#eef0ff";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-primary)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-primary)";
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "#fff";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-secondary)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border)";
              }}
            >
              <Pencil size={14} strokeWidth={1.8} />
            </button>
          )}
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-muted)",
            }}
          >
            <ChevronRight size={16} strokeWidth={1.8} />
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "flex",
          gap: 16,
          paddingTop: 14,
          borderTop: "1px solid var(--color-border-soft)",
        }}
      >
        <StatPill label="Campos" value={activeFields.length} />
        <StatPill label="Obligatorios" value={requiredFields.length} />
        <StatPill label="Acciones" value={activeActions.length} />
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          fontFamily: "var(--font-heading)",
          color: "var(--color-dark)",
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{label}</span>
    </div>
  );
}

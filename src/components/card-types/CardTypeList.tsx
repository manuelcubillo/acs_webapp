"use client";

/**
 * CardTypeList
 *
 * Renders the grid/list of card types with an empty state.
 */

import Link from "next/link";
import { Plus } from "lucide-react";
import CardTypeCard from "./CardTypeCard";
import type { CardTypeWithFullSchema } from "@/lib/dal";

interface CardTypeListProps {
  cardTypes: CardTypeWithFullSchema[];
  /** If true, shows Edit buttons on each card. */
  canEdit?: boolean;
}

export default function CardTypeList({
  cardTypes,
  canEdit = false,
}: CardTypeListProps) {
  if (cardTypes.length === 0) {
    return (
      <div
        className="card animate-fadein"
        style={{
          padding: "60px 24px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: "var(--color-primary-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
          }}
        >
          🗂️
        </div>
        <div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              fontFamily: "var(--font-heading)",
              color: "var(--color-dark)",
              marginBottom: 6,
            }}
          >
            Sin tipos de tarjeta
          </div>
          <div style={{ fontSize: 13.5, color: "var(--color-secondary)", maxWidth: 360 }}>
            Todavía no hay tipos de tarjeta definidos para este tenant. Crea el
            primero para empezar a gestionar tarjetas.
          </div>
        </div>
        {canEdit && (
          <Link
            href="/card-types/new"
            className="btn btn-primary"
            style={{ marginTop: 8 }}
          >
            <Plus size={16} strokeWidth={2} />
            Crear tipo de tarjeta
          </Link>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
        gap: 16,
      }}
    >
      {cardTypes.map((ct) => (
        <CardTypeCard key={ct.id} cardType={ct} showEditButton={canEdit} />
      ))}
    </div>
  );
}

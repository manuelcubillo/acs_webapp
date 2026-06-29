"use client";

/**
 * CardTypeList
 *
 * Renders the grid/list of card types with an empty state.
 */

import Link from "next/link";
import { Plus } from "lucide-react";
import CardTypeCard from "./CardTypeCard";
import { Button } from "@/components/ui/button";
import type { CardTypeWithFullSchema } from "@/lib/dal";

const TEXT = {
  EMPTY_TITLE: "Sin tipos de tarjeta",
  EMPTY_BODY:
    "Todavía no hay tipos de tarjeta definidos para este tenant. Crea el primero para empezar a gestionar tarjetas.",
  BTN_CREATE: "Crear tipo de tarjeta",
} as const;

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
      <div className="animate-fadein flex flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-16 text-center shadow-sm">
        <div className="flex size-18 items-center justify-center rounded-[20px] bg-accent text-3xl">
          🗂️
        </div>
        <div>
          <div className="mb-1.5 font-heading text-lg font-bold text-foreground">
            {TEXT.EMPTY_TITLE}
          </div>
          <div className="max-w-[360px] text-sm text-muted-foreground">
            {TEXT.EMPTY_BODY}
          </div>
        </div>
        {canEdit && (
          <Button asChild className="mt-2">
            <Link href="/card-types/new">
              <Plus className="size-4" strokeWidth={2} />
              {TEXT.BTN_CREATE}
            </Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
      {cardTypes.map((ct) => (
        <CardTypeCard key={ct.id} cardType={ct} showEditButton={canEdit} />
      ))}
    </div>
  );
}

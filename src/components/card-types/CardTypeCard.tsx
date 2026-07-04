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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CardTypeWithFullSchema } from "@/lib/dal";

const TEXT = {
  ACTIVE:        "Activo",
  INACTIVE:      "Inactivo",
  EDIT_TITLE:    "Editar tipo de tarjeta",
  STAT_FIELDS:   "Campos",
  STAT_REQUIRED: "Obligatorios",
  STAT_ACTIONS:  "Acciones",
} as const;

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
      className="animate-fadein flex cursor-pointer flex-col gap-3.5 rounded-xl border border-border bg-card px-6 py-5 shadow-sm transition-shadow hover:shadow-md"
      onClick={() => router.push(`/card-types/${cardType.id}`)}
    >
      {/* Top row: icon + name + status + edit */}
      <div className="flex items-start gap-3.5">
        {/* Icon */}
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl border",
            cardType.isActive
              ? "bg-accent border-accent text-primary"
              : "bg-muted border-border text-muted-foreground",
          )}
        >
          <CreditCard className="size-5.5" strokeWidth={1.6} />
        </div>

        {/* Name + description */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="font-heading text-[15px] font-bold text-foreground">
              {cardType.name}
            </h3>
            {/* Active status badge — entity status, neutral (not a state token) */}
            <Badge variant={cardType.isActive ? "outline" : "secondary"}>
              {cardType.isActive ? (
                <CircleDot strokeWidth={2} />
              ) : (
                <CircleOff strokeWidth={2} />
              )}
              {cardType.isActive ? TEXT.ACTIVE : TEXT.INACTIVE}
            </Badge>
          </div>
          {cardType.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {cardType.description}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 gap-1.5">
          {showEditButton && (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/card-types/${cardType.id}/edit`);
              }}
              title={TEXT.EDIT_TITLE}
            >
              <Pencil strokeWidth={1.8} />
            </Button>
          )}
          <div className="flex size-8 items-center justify-center text-muted-foreground">
            <ChevronRight className="size-4" strokeWidth={1.8} />
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-4 border-t border-border pt-3.5">
        <StatPill label={TEXT.STAT_FIELDS} value={activeFields.length} />
        <StatPill label={TEXT.STAT_REQUIRED} value={requiredFields.length} />
        <StatPill label={TEXT.STAT_ACTIONS} value={activeActions.length} />
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-heading text-sm font-bold text-foreground">
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

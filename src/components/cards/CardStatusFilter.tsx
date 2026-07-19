"use client";

/**
 * CardStatusFilter
 *
 * Segmented lifecycle-status filter for the card search: Todos / Activos /
 * Inactivos. `Inactivos` groups `inactive` + `expired` (they behave the same);
 * archived cards never appear in search, so there is no `archived` option.
 *
 * Follows the established segmented-control pattern of `CardViewToggle` (plain
 * buttons + `cn`, `role="group"` + `aria-pressed`) rather than introducing a new
 * UI primitive — same libraries as the rest of the components.
 */

import { CircleCheck, CircleSlash, LayoutGrid } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CardSearchStatus } from "@/lib/dal/types";

const TEXT = {
  ARIA_GROUP: "Filtrar por estado",
  ALL: "Todos",
  ACTIVE: "Activos",
  INACTIVE: "Inactivos",
} as const;

const OPTIONS = [
  { value: "all" as const, Icon: LayoutGrid, label: TEXT.ALL },
  { value: "active" as const, Icon: CircleCheck, label: TEXT.ACTIVE },
  { value: "inactive" as const, Icon: CircleSlash, label: TEXT.INACTIVE },
];

interface CardStatusFilterProps {
  value: CardSearchStatus;
  onChange: (value: CardSearchStatus) => void;
}

export default function CardStatusFilter({
  value,
  onChange,
}: CardStatusFilterProps) {
  return (
    <div
      role="group"
      aria-label={TEXT.ARIA_GROUP}
      className="inline-flex gap-0.5 rounded-md bg-muted p-0.5"
    >
      {OPTIONS.map(({ value: optionValue, Icon, label }) => {
        const active = value === optionValue;
        return (
          <button
            key={optionValue}
            type="button"
            onClick={() => onChange(optionValue)}
            title={label}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-semibold transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" strokeWidth={1.8} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

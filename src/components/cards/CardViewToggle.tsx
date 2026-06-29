"use client";

import { LayoutList, Table2 } from "lucide-react";

import { cn } from "@/lib/utils";

const TEXT = {
  TABLE:  "Tabla",
  CARDS:  "Fichas",
} as const;

export type ViewMode = "table" | "profile";

interface CardViewToggleProps {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
}

const VIEWS = [
  { mode: "table" as const,   Icon: Table2,     label: TEXT.TABLE },
  { mode: "profile" as const, Icon: LayoutList, label: TEXT.CARDS },
];

export default function CardViewToggle({ view, onChange }: CardViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="Modo de visualización"
      className="inline-flex gap-0.5 rounded-md bg-muted p-0.5"
    >
      {VIEWS.map(({ mode, Icon, label }) => {
        const active = view === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
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

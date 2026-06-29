"use client";

import { Check, Columns3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { FieldDefinition } from "@/lib/dal/types";

const TEXT = {
  BTN_COLUMNS: "Columnas",
  RESET:       "Restaurar predeterminadas",
} as const;

interface CardColumnSelectorProps {
  fields: FieldDefinition[];
  visibleColumns: string[];
  onToggle: (fieldId: string) => void;
  onReset: () => void;
}

export default function CardColumnSelector({
  fields,
  visibleColumns,
  onToggle,
  onReset,
}: CardColumnSelectorProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="gap-1.5 text-sm font-semibold">
          <Columns3 />
          {TEXT.BTN_COLUMNS}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <div className="flex flex-col">
          {fields.map((f) => {
            const visible = visibleColumns.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onToggle(f.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-3 py-2 text-sm",
                  "text-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <span className="truncate">{f.label}</span>
                {visible && <Check className="size-3.5 text-primary" />}
              </button>
            );
          })}
        </div>
        <Separator className="my-1" />
        <button
          type="button"
          onClick={onReset}
          className="block w-full rounded-sm px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {TEXT.RESET}
        </button>
      </PopoverContent>
    </Popover>
  );
}

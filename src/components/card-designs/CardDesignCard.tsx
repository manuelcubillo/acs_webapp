"use client";

/**
 * CardDesignCard
 *
 * Tile for a single card design in the list view.
 * Shows name, kind badge, dimensions, linked card-type count, and an action menu.
 */

import { useRouter } from "next/navigation";
import {
  Palette,
  BookOpen,
  Pencil,
  Copy,
  Trash2,
  MoreHorizontal,
  Link2,
} from "lucide-react";
import type { CardDesign } from "@/lib/dal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const LABELS = {
  kindCard: "Tarjeta",
  kindPassbook: "Passbook",
  linkedCount: (n: number) => (n === 1 ? "1 tipo de tarjeta" : `${n} tipos de tarjeta`),
  linkedNone: "Sin tipos vinculados",
  menuLabel: "Más acciones",
  menuEdit: "Editar diseño",
  menuDuplicate: "Duplicar",
  menuArchive: "Archivar",
} as const;

// Decorative kind accent (NOT state) — card = brand, passbook = emerald.
const KIND_ICON_CLASS: Record<string, string> = {
  card: "bg-accent text-primary",
  passbook: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

interface Props {
  design: CardDesign;
  linkedCount: number;
  onDuplicate: (design: CardDesign) => void;
  onArchive: (design: CardDesign) => void;
}

export default function CardDesignCard({
  design,
  linkedCount,
  onDuplicate,
  onArchive,
}: Props) {
  const router = useRouter();
  const isCard = design.kind === "card";
  const dimensionLabel = `${design.widthUnits} × ${design.heightUnits} ${design.unit}`;

  return (
    <div
      className="animate-fadein flex cursor-pointer flex-col gap-3.5 rounded-xl border bg-card px-6 py-5 shadow-sm transition-shadow hover:shadow-md"
      onClick={() => router.push(`/card-designs/${design.id}/edit`)}
    >
      {/* Top row */}
      <div className="flex items-start gap-3.5">
        {/* Icon */}
        <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", KIND_ICON_CLASS[design.kind] ?? KIND_ICON_CLASS.card)}>
          {isCard ? (
            <Palette className="size-5.5" strokeWidth={1.6} />
          ) : (
            <BookOpen className="size-5.5" strokeWidth={1.6} />
          )}
        </div>

        {/* Name + kind badge */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-heading text-[15px] font-bold text-foreground">
              {design.name}
            </h3>
            <KindBadge kind={design.kind} />
          </div>
          {design.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {design.description}
            </p>
          )}
        </div>

        {/* Action menu */}
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon-sm" title={LABELS.menuLabel}>
                <MoreHorizontal strokeWidth={1.8} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[170px]">
              <DropdownMenuItem
                onClick={() => router.push(`/card-designs/${design.id}/edit`)}
              >
                <Pencil strokeWidth={1.8} />
                {LABELS.menuEdit}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(design)}>
                <Copy strokeWidth={1.8} />
                {LABELS.menuDuplicate}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => onArchive(design)}>
                <Trash2 strokeWidth={1.8} />
                {LABELS.menuArchive}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-4 border-t pt-3.5">
        <StatPill
          icon={<Link2 className="size-3" strokeWidth={2} />}
          label={linkedCount > 0 ? LABELS.linkedCount(linkedCount) : LABELS.linkedNone}
        />
        <StatPill icon={null} label={dimensionLabel} />
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KindBadge({ kind }: { kind: "card" | "passbook" }) {
  const isCard = kind === "card";
  return (
    <Badge className={KIND_ICON_CLASS[kind] ?? KIND_ICON_CLASS.card}>
      {isCard ? LABELS.kindCard : LABELS.kindPassbook}
    </Badge>
  );
}

function StatPill({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {icon}
      <span>{label}</span>
    </div>
  );
}

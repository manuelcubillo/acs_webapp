"use client";

/**
 * CardDesignListClient
 *
 * Client shell for the /card-designs list page.
 * Manages filter state, new-design modal, and archive/duplicate mutations.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Palette } from "lucide-react";
import type { CardDesign } from "@/lib/dal";
import {
  archiveCardDesignAction,
  duplicateCardDesignAction,
} from "@/lib/actions/card-designs";
import CardDesignCard from "./CardDesignCard";
import NewDesignModal from "./NewDesignModal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LABELS = {
  heading: "Diseños de Tarjeta",
  subheadingEmpty: "Aún no hay diseños. Crea el primero para personalizar la apariencia de tus tarjetas.",
  subheadingCount: (n: number) =>
    `${n} diseño${n !== 1 ? "s" : ""}`,
  newBtn: "Nuevo diseño",
  filterAll: "Todos",
  filterCard: "Tarjeta",
  filterPassbook: "Passbook",
  emptyTitle: "Sin diseños",
  emptyHint: "Crea tu primer diseño para personalizar la apariencia visual de las tarjetas.",
  emptyFilterHint: (kind: string) =>
    `No hay diseños de tipo ${kind}. Prueba otro filtro o crea uno nuevo.`,
  archiveConfirm: (name: string) =>
    `¿Archivar el diseño "${name}"? Se desvinculará de todos los tipos de tarjeta.`,
  errorArchive: "No se pudo archivar el diseño.",
  errorDuplicate: "No se pudo duplicar el diseño.",
  duplicateSuffix: " (copia)",
} as const;

type KindFilter = "all" | "card" | "passbook";

interface Props {
  designs: CardDesign[];
  linkCounts: Record<string, number>;
}

export default function CardDesignListClient({ designs, linkCounts }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState<KindFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);

  const filtered =
    filter === "all" ? designs : designs.filter((d) => d.kind === filter);

  async function handleArchive(design: CardDesign) {
    if (!window.confirm(LABELS.archiveConfirm(design.name))) return;
    const result = await archiveCardDesignAction(design.id);
    if (!result.success) {
      alert(LABELS.errorArchive);
      return;
    }
    startTransition(() => router.refresh());
  }

  async function handleDuplicate(design: CardDesign) {
    const result = await duplicateCardDesignAction(design.id, {
      newName: design.name + LABELS.duplicateSuffix,
    });
    if (!result.success) {
      alert(LABELS.errorDuplicate);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-foreground">
            {LABELS.heading}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {designs.length === 0
              ? LABELS.subheadingEmpty
              : LABELS.subheadingCount(designs.length)}
          </p>
        </div>

        <Button onClick={() => setModalOpen(true)}>
          <Plus strokeWidth={2} />
          {LABELS.newBtn}
        </Button>
      </div>

      {/* Kind filter tabs — segmented control */}
      {designs.length > 0 && (
        <div className="mb-5 inline-flex w-fit gap-1 rounded-[10px] bg-muted p-1">
          {(
            [
              { value: "all", label: LABELS.filterAll },
              { value: "card", label: LABELS.filterCard },
              { value: "passbook", label: LABELS.filterPassbook },
            ] as { value: KindFilter; label: string }[]
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm transition-colors",
                filter === value
                  ? "bg-card font-bold text-primary shadow-sm"
                  : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Grid or empty state */}
      {filtered.length === 0 ? (
        <EmptyState
          filtered={filter !== "all"}
          filterLabel={filter === "card" ? LABELS.filterCard : LABELS.filterPassbook}
          onNew={() => setModalOpen(true)}
        />
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
          {filtered.map((design) => (
            <CardDesignCard
              key={design.id}
              design={design}
              linkedCount={linkCounts[design.id] ?? 0}
              onDuplicate={handleDuplicate}
              onArchive={handleArchive}
            />
          ))}
        </div>
      )}

      {/* New design modal */}
      <NewDesignModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  filtered,
  filterLabel,
  onNew,
}: {
  filtered: boolean;
  filterLabel: string;
  onNew: () => void;
}) {
  return (
    <div className="animate-fadein flex flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-16 text-center shadow-sm">
      <div className="flex size-18 items-center justify-center rounded-[20px] bg-accent text-primary">
        <Palette className="size-8.5" strokeWidth={1.5} />
      </div>
      <div>
        <div className="mb-1.5 font-heading text-lg font-bold text-foreground">
          {LABELS.emptyTitle}
        </div>
        <div className="max-w-[380px] text-sm text-muted-foreground">
          {filtered ? LABELS.emptyFilterHint(filterLabel) : LABELS.emptyHint}
        </div>
      </div>
      {!filtered && (
        <Button onClick={onNew} className="mt-2">
          <Plus strokeWidth={2} />
          {LABELS.newBtn}
        </Button>
      )}
    </div>
  );
}

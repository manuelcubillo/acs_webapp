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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              fontFamily: "var(--font-heading)",
              color: "var(--color-dark)",
              margin: 0,
            }}
          >
            {LABELS.heading}
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--color-secondary)", marginTop: 4 }}>
            {designs.length === 0
              ? LABELS.subheadingEmpty
              : LABELS.subheadingCount(designs.length)}
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => setModalOpen(true)}
        >
          <Plus size={16} strokeWidth={2} />
          {LABELS.newBtn}
        </button>
      </div>

      {/* Kind filter tabs */}
      {designs.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 20,
            background: "var(--color-border-soft)",
            borderRadius: 10,
            padding: 4,
            alignSelf: "flex-start",
            width: "fit-content",
          }}
        >
          {(
            [
              { value: "all", label: LABELS.filterAll },
              { value: "card", label: LABELS.filterCard },
              { value: "passbook", label: LABELS.filterPassbook },
            ] as { value: KindFilter; label: string }[]
          ).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              style={{
                padding: "6px 16px",
                borderRadius: 7,
                border: "none",
                background: filter === value ? "#fff" : "transparent",
                color:
                  filter === value ? "var(--color-primary)" : "var(--color-secondary)",
                fontWeight: filter === value ? 700 : 500,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.15s",
                boxShadow: filter === value ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 16,
          }}
        >
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
          color: "var(--color-primary)",
        }}
      >
        <Palette size={34} strokeWidth={1.5} />
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
          {LABELS.emptyTitle}
        </div>
        <div style={{ fontSize: 13.5, color: "var(--color-secondary)", maxWidth: 380 }}>
          {filtered
            ? LABELS.emptyFilterHint(filterLabel)
            : LABELS.emptyHint}
        </div>
      </div>
      {!filtered && (
        <button
          className="btn btn-primary"
          onClick={onNew}
          style={{ marginTop: 8 }}
        >
          <Plus size={16} strokeWidth={2} />
          {LABELS.newBtn}
        </button>
      )}
    </div>
  );
}


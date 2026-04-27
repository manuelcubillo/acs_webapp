"use client";

/**
 * CardDesignCard
 *
 * Tile for a single card design in the list view.
 * Shows name, kind badge, dimensions, linked card-type count, and an action menu.
 */

import { useState, useRef, useEffect } from "react";
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

const LABELS = {
  kindCard: "Tarjeta",
  kindPassbook: "Passbook",
  linkedCount: (n: number) => (n === 1 ? "1 tipo de tarjeta" : `${n} tipos de tarjeta`),
  linkedNone: "Sin tipos vinculados",
  menuEdit: "Editar diseño",
  menuDuplicate: "Duplicar",
  menuArchive: "Archivar",
} as const;

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const isCard = design.kind === "card";
  const dimensionLabel = `${design.widthUnits} × ${design.heightUnits} ${design.unit}`;

  return (
    <div
      className="card animate-fadein"
      style={{
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        cursor: "pointer",
        transition: "box-shadow 0.15s ease, transform 0.1s ease",
      }}
      onClick={() => router.push(`/card-designs/${design.id}/edit`)}
      onMouseOver={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 6px 20px rgba(79,91,255,0.12)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-card)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        {/* Icon */}
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 13,
            background: isCard
              ? "linear-gradient(135deg, #eef0ff, #dde1ff)"
              : "linear-gradient(135deg, #ecfdf5, #d1fae5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: isCard ? "var(--color-primary)" : "#059669",
            flexShrink: 0,
            border: `1.5px solid ${isCard ? "#c7d2fe" : "#a7f3d0"}`,
          }}
        >
          {isCard ? (
            <Palette size={22} strokeWidth={1.6} />
          ) : (
            <BookOpen size={22} strokeWidth={1.6} />
          )}
        </div>

        {/* Name + kind badge */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h3
              style={{
                fontSize: 15,
                fontWeight: 700,
                fontFamily: "var(--font-heading)",
                color: "var(--color-dark)",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "100%",
              }}
            >
              {design.name}
            </h3>
            <KindBadge kind={design.kind} />
          </div>
          {design.description && (
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
              {design.description}
            </p>
          )}
        </div>

        {/* Action menu */}
        <div
          ref={menuRef}
          style={{ position: "relative", flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setMenuOpen((v) => !v)}
            title="Más acciones"
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
              (e.currentTarget as HTMLButtonElement).style.background = "#f5f6fa";
            }}
            onMouseOut={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "#fff";
            }}
          >
            <MoreHorizontal size={16} strokeWidth={1.8} />
          </button>

          {menuOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                background: "#fff",
                border: "1.5px solid var(--color-border)",
                borderRadius: 10,
                boxShadow: "0 8px 24px rgba(15,18,40,0.12)",
                zIndex: 50,
                minWidth: 170,
                overflow: "hidden",
              }}
            >
              <MenuItem
                icon={<Pencil size={14} strokeWidth={1.8} />}
                label={LABELS.menuEdit}
                onClick={() => {
                  setMenuOpen(false);
                  router.push(`/card-designs/${design.id}/edit`);
                }}
              />
              <MenuItem
                icon={<Copy size={14} strokeWidth={1.8} />}
                label={LABELS.menuDuplicate}
                onClick={() => {
                  setMenuOpen(false);
                  onDuplicate(design);
                }}
              />
              <div
                style={{
                  height: 1,
                  background: "var(--color-border-soft)",
                  margin: "4px 0",
                }}
              />
              <MenuItem
                icon={<Trash2 size={14} strokeWidth={1.8} />}
                label={LABELS.menuArchive}
                danger
                onClick={() => {
                  setMenuOpen(false);
                  onArchive(design);
                }}
              />
            </div>
          )}
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
        <StatPill
          icon={<Link2 size={12} strokeWidth={2} />}
          label={
            linkedCount > 0
              ? LABELS.linkedCount(linkedCount)
              : LABELS.linkedNone
          }
          muted={linkedCount === 0}
        />
        <StatPill
          icon={null}
          label={dimensionLabel}
          muted
        />
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KindBadge({ kind }: { kind: "card" | "passbook" }) {
  const isCard = kind === "card";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 10.5,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 6,
        background: isCard ? "#eef0ff" : "#ecfdf5",
        color: isCard ? "var(--color-primary)" : "#059669",
        border: `1px solid ${isCard ? "#c7d2fe" : "#a7f3d0"}`,
        whiteSpace: "nowrap",
      }}
    >
      {isCard ? LABELS.kindCard : LABELS.kindPassbook}
    </span>
  );
}

function StatPill({
  icon,
  label,
  muted = false,
}: {
  icon: React.ReactNode;
  label: string;
  muted?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {icon && (
        <span style={{ color: muted ? "var(--color-muted)" : "var(--color-secondary)" }}>
          {icon}
        </span>
      )}
      <span
        style={{
          fontSize: 12,
          color: muted ? "var(--color-muted)" : "var(--color-secondary)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  danger = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 14px",
        fontSize: 13,
        fontWeight: 500,
        color: danger
          ? hovered ? "#dc2626" : "#ef4444"
          : hovered ? "var(--color-primary)" : "var(--color-dark)",
        background: hovered
          ? danger ? "#fff1f1" : "var(--color-primary-light)"
          : "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.1s",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

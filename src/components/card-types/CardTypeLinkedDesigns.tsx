"use client";

/**
 * CardTypeLinkedDesigns — shows designs linked to a card type and allows
 * master users to link/unlink designs from the card-type detail page.
 *
 * Renders two "slots": one for kind=card and one for kind=passbook.
 * Masters can link/unlink; other roles see a read-only view.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Palette, BookOpen, Link2, Unlink, Loader2, ExternalLink } from "lucide-react";
import type { CardDesign } from "@/lib/dal";
import {
  listCardDesignsAction,
  linkDesignToCardTypeAction,
  unlinkDesignFromCardTypeAction,
} from "@/lib/actions/card-designs";

const LABELS = {
  sectionTitle: "Diseños vinculados",
  kindCard: "Tarjeta",
  kindPassbook: "Libreta",
  noDesign: "Sin diseño vinculado",
  linkBtn: "Vincular diseño",
  unlinkBtn: "Desvincular",
  editBtn: "Editar",
  pickerPlaceholder: "Selecciona un diseño…",
  pickerConfirm: "Vincular",
  pickerCancel: "Cancelar",
  loading: "Cargando…",
  conflictHint: "Ya existe un diseño de este tipo vinculado.",
} as const;

type DesignKind = "card" | "passbook";

interface Props {
  cardTypeId: string;
  linkedDesigns: CardDesign[];
  isMaster: boolean;
}

export default function CardTypeLinkedDesigns({
  cardTypeId,
  linkedDesigns,
  isMaster,
}: Props) {
  const router = useRouter();

  return (
    <div className="card animate-fadein" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "18px 22px",
          borderBottom: "1px solid var(--color-border-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "var(--font-heading)",
            color: "var(--color-dark)",
          }}
        >
          {LABELS.sectionTitle}
        </div>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--color-muted)",
            background: "var(--color-page-bg)",
            padding: "2px 8px",
            borderRadius: 5,
          }}
        >
          {linkedDesigns.length}
        </span>
      </div>

      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {(["card", "passbook"] as DesignKind[]).map((kind) => {
          const linked = linkedDesigns.find((d) => d.kind === kind) ?? null;
          return (
            <DesignSlot
              key={kind}
              kind={kind}
              linked={linked}
              cardTypeId={cardTypeId}
              isMaster={isMaster}
              onMutated={() => router.refresh()}
            />
          );
        })}
      </div>
    </div>
  );
}

function DesignSlot({
  kind,
  linked,
  cardTypeId,
  isMaster,
  onMutated,
}: {
  kind: DesignKind;
  linked: CardDesign | null;
  cardTypeId: string;
  isMaster: boolean;
  onMutated: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDesigns, setPickerDesigns] = useState<CardDesign[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [unlinkLoading, setUnlinkLoading] = useState(false);

  const Icon = kind === "card" ? Palette : BookOpen;
  const kindLabel = kind === "card" ? LABELS.kindCard : LABELS.kindPassbook;
  const kindColor = kind === "card" ? "#4f5bff" : "#059669";
  const kindBg = kind === "card" ? "#eef0ff" : "#ecfdf5";

  async function openPicker() {
    setPickerOpen(true);
    setPickerLoading(true);
    setSelectedId("");
    setActionError(null);
    const result = await listCardDesignsAction({ kind });
    if (result.success) {
      setPickerDesigns(result.data);
    }
    setPickerLoading(false);
  }

  async function confirmLink() {
    if (!selectedId) return;
    setPickerLoading(true);
    const result = await linkDesignToCardTypeAction(selectedId, cardTypeId);
    setPickerLoading(false);
    if (!result.success) {
      setActionError(result.error ?? LABELS.conflictHint);
    } else {
      setPickerOpen(false);
      onMutated();
    }
  }

  async function handleUnlink() {
    if (!linked) return;
    setUnlinkLoading(true);
    const result = await unlinkDesignFromCardTypeAction(linked.id, cardTypeId);
    setUnlinkLoading(false);
    if (!result.success) {
      setActionError(result.error ?? "Error al desvincular");
    } else {
      onMutated();
    }
  }

  return (
    <div
      style={{
        padding: "12px 14px",
        background: "#fafbfc",
        border: "1px solid var(--color-border-soft)",
        borderRadius: 10,
      }}
    >
      {/* Kind label row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: kindBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: kindColor,
            flexShrink: 0,
          }}
        >
          <Icon size={13} strokeWidth={1.8} />
        </div>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: "var(--color-dark)",
          }}
        >
          {kindLabel}
        </span>
      </div>

      {/* Linked design or empty state */}
      {linked ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Link2 size={12} strokeWidth={2} style={{ color: kindColor, flexShrink: 0 }} />
          <span
            style={{
              flex: 1,
              fontSize: 12.5,
              fontWeight: 500,
              color: "var(--color-dark)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {linked.name}
          </span>
          <a
            href={`/card-designs/${linked.id}/edit`}
            title={LABELS.editBtn}
            style={{ color: "var(--color-primary)", display: "flex", alignItems: "center" }}
          >
            <ExternalLink size={12} strokeWidth={2} />
          </a>
          {isMaster && (
            <button
              onClick={() => void handleUnlink()}
              disabled={unlinkLoading}
              title={LABELS.unlinkBtn}
              style={{
                background: "none",
                border: "none",
                cursor: unlinkLoading ? "not-allowed" : "pointer",
                color: "#dc2626",
                padding: 2,
                display: "flex",
                alignItems: "center",
              }}
            >
              {unlinkLoading ? (
                <Loader2 size={12} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <Unlink size={12} strokeWidth={2} />
              )}
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            fontSize: 12,
            color: "var(--color-muted)",
            fontStyle: "italic",
          }}
        >
          {LABELS.noDesign}
        </div>
      )}

      {/* Error message */}
      {actionError && (
        <p style={{ fontSize: 11.5, color: "#dc2626", margin: "6px 0 0" }}>{actionError}</p>
      )}

      {/* Link picker (masters only, when no design linked) */}
      {isMaster && !linked && (
        <>
          {pickerOpen ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {pickerLoading && !pickerDesigns.length ? (
                <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>{LABELS.loading}</span>
              ) : (
                <select
                  className="input"
                  style={{ fontSize: 12 }}
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  <option value="">{LABELS.pickerPlaceholder}</option>
                  {pickerDesigns.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              )}
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => void confirmLink()}
                  disabled={!selectedId || pickerLoading}
                  className="btn btn-primary"
                  style={{ flex: 1, height: 30, fontSize: 12 }}
                >
                  {pickerLoading
                    ? <Loader2 size={12} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                    : LABELS.pickerConfirm
                  }
                </button>
                <button
                  onClick={() => { setPickerOpen(false); setActionError(null); }}
                  className="btn btn-secondary"
                  style={{ flex: 1, height: 30, fontSize: 12 }}
                >
                  {LABELS.pickerCancel}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => void openPicker()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 10px",
                borderRadius: 7,
                border: "1.5px dashed var(--color-primary)",
                background: "var(--color-primary-light)",
                color: "var(--color-primary)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                width: "100%",
                justifyContent: "center",
                marginTop: 8,
              }}
            >
              {LABELS.linkBtn}
            </button>
          )}
        </>
      )}
    </div>
  );
}

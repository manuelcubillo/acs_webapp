"use client";

/**
 * NewDesignModal — modal for creating a new card design.
 * Selecting a kind auto-populates default dimensions (card: 85.6×54 mm, passbook: 340×440 px).
 * The user must pick a card type to assign the design to; the link is created
 * immediately after the design itself. On success, navigates to the editor.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import {
  createCardDesignAction,
  linkDesignToCardTypeAction,
} from "@/lib/actions/card-designs";
import { listCardTypesAction } from "@/lib/actions/card-types";
import type { CardType } from "@/lib/dal";

const LABELS = {
  title: "Nuevo diseño",
  nameLabel: "Nombre",
  namePlaceholder: "Ej. Carnet Empleado",
  descriptionLabel: "Descripción (opcional)",
  descriptionPlaceholder: "Breve descripción del diseño…",
  kindLabel: "Tipo de diseño",
  kindCard: "Tarjeta (CR80)",
  kindPassbook: "Passbook",
  dimensionsLabel: "Dimensiones",
  widthPlaceholder: "Ancho",
  heightPlaceholder: "Alto",
  cardTypeLabel: "Tipo de tarjeta",
  cardTypePlaceholder: "Selecciona un tipo de tarjeta…",
  cardTypeLoading: "Cargando tipos…",
  cardTypeNone: "No hay tipos de tarjeta. Crea uno antes de añadir un diseño.",
  cardTypeRequired: "Debes seleccionar un tipo de tarjeta.",
  submit: "Crear y editar",
  submitting: "Creando…",
  cancel: "Cancelar",
  errorGeneric: "No se pudo crear el diseño. Inténtalo de nuevo.",
  linkWarning:
    "El diseño se creó, pero no se pudo vincular automáticamente. Puedes vincularlo desde el editor.",
} as const;

const DEFAULTS = {
  card: { widthUnits: 85.6, heightUnits: 54, unit: "mm" as const },
  passbook: { widthUnits: 340, heightUnits: 440, unit: "px" as const },
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function NewDesignModal({ isOpen, onClose }: Props) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"card" | "passbook">("card");
  const [width, setWidth] = useState(String(DEFAULTS.card.widthUnits));
  const [height, setHeight] = useState(String(DEFAULTS.card.heightUnits));
  const [unit, setUnit] = useState<"mm" | "px">(DEFAULTS.card.unit);
  const [cardTypeId, setCardTypeId] = useState("");
  const [cardTypes, setCardTypes] = useState<CardType[]>([]);
  const [cardTypesLoading, setCardTypesLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load card types when the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setCardTypesLoading(true);
    listCardTypesAction()
      .then((result) => {
        if (cancelled) return;
        if (result.success) setCardTypes(result.data);
      })
      .finally(() => {
        if (!cancelled) setCardTypesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  function handleKindChange(newKind: "card" | "passbook") {
    setKind(newKind);
    const d = DEFAULTS[newKind];
    setWidth(String(d.widthUnits));
    setHeight(String(d.heightUnits));
    setUnit(d.unit);
  }

  function handleClose() {
    setName("");
    setDescription("");
    setKind("card");
    setWidth(String(DEFAULTS.card.widthUnits));
    setHeight(String(DEFAULTS.card.heightUnits));
    setUnit(DEFAULTS.card.unit);
    setCardTypeId("");
    setError("");
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!cardTypeId) {
      setError(LABELS.cardTypeRequired);
      return;
    }

    setLoading(true);

    try {
      const result = await createCardDesignAction({
        name: name.trim(),
        description: description.trim() || null,
        kind,
        widthUnits: parseFloat(width),
        heightUnits: parseFloat(height),
        unit,
      });

      if (!result.success) {
        setError(
          "fieldErrors" in result
            ? Object.values(result.fieldErrors ?? {}).flat().join(", ")
            : result.error ?? LABELS.errorGeneric,
        );
        return;
      }

      // Link the design to the chosen card type. We don't fail the whole flow
      // if linking fails (e.g. the card type already has a design of this
      // kind) — the design exists and the user can resolve the link in the editor.
      const linkResult = await linkDesignToCardTypeAction(
        result.data.id,
        cardTypeId,
      );
      if (!linkResult.success) {
        setError(linkResult.error ?? LABELS.linkWarning);
        // Continue anyway — navigate so the user can fix it in the editor.
      }

      handleClose();
      router.push(`/card-designs/${result.data.id}/edit`);
    } catch {
      setError(LABELS.errorGeneric);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15,18,40,0.45)",
        padding: 16,
      }}
      onClick={handleClose}
    >
      <div
        className="card animate-fadein"
        style={{ width: "100%", maxWidth: 480, padding: "28px 28px 24px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <h2
            style={{
              fontSize: 17,
              fontWeight: 700,
              fontFamily: "var(--font-heading)",
              color: "var(--color-dark)",
              margin: 0,
            }}
          >
            {LABELS.title}
          </h2>
          <button
            onClick={handleClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1.5px solid var(--color-border)",
              background: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-muted)",
            }}
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Name */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}>
              {LABELS.nameLabel}
            </label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={LABELS.namePlaceholder}
              required
              maxLength={200}
              autoFocus
            />
          </div>

          {/* Description */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}>
              {LABELS.descriptionLabel}
            </label>
            <textarea
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={LABELS.descriptionPlaceholder}
              maxLength={1000}
              rows={2}
              style={{ resize: "vertical" }}
            />
          </div>

          {/* Kind */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}>
              {LABELS.kindLabel}
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["card", "passbook"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleKindChange(k)}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: `2px solid ${kind === k ? "var(--color-primary)" : "var(--color-border)"}`,
                    background: kind === k ? "var(--color-primary-light)" : "#fff",
                    color: kind === k ? "var(--color-primary)" : "var(--color-secondary)",
                    fontWeight: kind === k ? 700 : 500,
                    fontSize: 13.5,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {k === "card" ? LABELS.kindCard : LABELS.kindPassbook}
                </button>
              ))}
            </div>
          </div>

          {/* Card type */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}>
              {LABELS.cardTypeLabel}
            </label>
            {cardTypesLoading ? (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--color-muted)",
                  padding: "10px 12px",
                  border: "1.5px dashed var(--color-border)",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Loader2 size={14} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                {LABELS.cardTypeLoading}
              </div>
            ) : cardTypes.length === 0 ? (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--color-muted)",
                  margin: 0,
                  padding: "10px 12px",
                  border: "1.5px dashed var(--color-border)",
                  borderRadius: 10,
                }}
              >
                {LABELS.cardTypeNone}
              </p>
            ) : (
              <select
                className="input"
                value={cardTypeId}
                onChange={(e) => setCardTypeId(e.target.value)}
                required
              >
                <option value="">{LABELS.cardTypePlaceholder}</option>
                {cardTypes.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Dimensions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}>
              {LABELS.dimensionsLabel}
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                className="input"
                type="number"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder={LABELS.widthPlaceholder}
                required
                min={1}
                step="any"
                style={{ flex: 1 }}
              />
              <span style={{ color: "var(--color-muted)", fontSize: 16, fontWeight: 500 }}>×</span>
              <input
                className="input"
                type="number"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder={LABELS.heightPlaceholder}
                required
                min={1}
                step="any"
                style={{ flex: 1 }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--color-muted)",
                  minWidth: 22,
                }}
              >
                {unit}
              </span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p style={{ fontSize: 13, color: "var(--color-danger)", margin: 0 }}>{error}</p>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              type="button"
              onClick={handleClose}
              className="btn btn-secondary"
              disabled={loading}
            >
              {LABELS.cancel}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                loading || !name.trim() || !cardTypeId || cardTypesLoading || cardTypes.length === 0
              }
            >
              {loading ? (
                <>
                  <Loader2 size={15} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                  {LABELS.submitting}
                </>
              ) : (
                LABELS.submit
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

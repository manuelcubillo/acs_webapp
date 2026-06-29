"use client";

/**
 * NewDesignModal — modal for creating a new card design.
 * Selecting a kind auto-populates default dimensions (card: 85.6×54 mm, passbook: 340×440 px).
 * The user must pick a card type to assign the design to; the link is created
 * immediately after the design itself. On success, navigates to the editor.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  createCardDesignAction,
  linkDesignToCardTypeAction,
} from "@/lib/actions/card-designs";
import { listCardTypesAction } from "@/lib/actions/card-types";
import type { CardType } from "@/lib/dal";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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

  const handleOpenChange = (open: boolean) => {
    if (!open && !loading) handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!loading} className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{LABELS.title}</DialogTitle>
        </DialogHeader>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nd-name">{LABELS.nameLabel}</Label>
            <Input
              id="nd-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={LABELS.namePlaceholder}
              required
              maxLength={200}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nd-desc">{LABELS.descriptionLabel}</Label>
            <Textarea
              id="nd-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={LABELS.descriptionPlaceholder}
              maxLength={1000}
              rows={2}
              className="resize-y"
            />
          </div>

          {/* Kind */}
          <div className="flex flex-col gap-1.5">
            <Label>{LABELS.kindLabel}</Label>
            <div className="flex gap-2">
              {(["card", "passbook"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleKindChange(k)}
                  className={cn(
                    "flex-1 rounded-[10px] border-2 px-3 py-2.5 text-sm transition-colors",
                    kind === k
                      ? "border-primary bg-accent font-bold text-primary"
                      : "border-border bg-card font-medium text-muted-foreground hover:bg-muted",
                  )}
                >
                  {k === "card" ? LABELS.kindCard : LABELS.kindPassbook}
                </button>
              ))}
            </div>
          </div>

          {/* Card type */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nd-cardtype">{LABELS.cardTypeLabel}</Label>
            {cardTypesLoading ? (
              <div className="flex items-center gap-2 rounded-[10px] border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
                {LABELS.cardTypeLoading}
              </div>
            ) : cardTypes.length === 0 ? (
              <p className="rounded-[10px] border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
                {LABELS.cardTypeNone}
              </p>
            ) : (
              <Select value={cardTypeId} onValueChange={setCardTypeId} required>
                <SelectTrigger id="nd-cardtype" className="w-full">
                  <SelectValue placeholder={LABELS.cardTypePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {cardTypes.map((ct) => (
                    <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Dimensions */}
          <div className="flex flex-col gap-1.5">
            <Label>{LABELS.dimensionsLabel}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder={LABELS.widthPlaceholder}
                required
                min={1}
                step="any"
                className="flex-1"
              />
              <span className="text-base font-medium text-muted-foreground">×</span>
              <Input
                type="number"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder={LABELS.heightPlaceholder}
                required
                min={1}
                step="any"
                className="flex-1"
              />
              <span className="min-w-[22px] text-xs font-bold text-muted-foreground">
                {unit}
              </span>
            </div>
          </div>

          {/* Error */}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Actions */}
          <DialogFooter className="mt-1">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              {LABELS.cancel}
            </Button>
            <Button
              type="submit"
              disabled={
                loading || !name.trim() || !cardTypeId || cardTypesLoading || cardTypes.length === 0
              }
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" strokeWidth={2} />
                  {LABELS.submitting}
                </>
              ) : (
                LABELS.submit
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

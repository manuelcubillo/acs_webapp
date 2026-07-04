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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
  unlinkError: "Error al desvincular",
} as const;

type DesignKind = "card" | "passbook";

/** Decorative kind accent — card = brand, passbook = emerald (not state). */
const KIND_ICON_CLASS: Record<DesignKind, string> = {
  card: "bg-accent text-primary",
  passbook: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};
const KIND_LINK_CLASS: Record<DesignKind, string> = {
  card: "text-primary",
  passbook: "text-emerald-600 dark:text-emerald-400",
};

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
    <div className="animate-fadein overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="font-heading text-sm font-bold text-foreground">
          {LABELS.sectionTitle}
        </div>
        <Badge variant="outline">{linkedDesigns.length}</Badge>
      </div>

      <div className="flex flex-col gap-2 px-3.5 py-3">
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
      setActionError(result.error ?? LABELS.unlinkError);
    } else {
      onMutated();
    }
  }

  return (
    <div className="rounded-[10px] border bg-muted/40 px-3.5 py-3">
      {/* Kind label row */}
      <div className="mb-2 flex items-center gap-1.5">
        <div className={cn("flex size-6.5 shrink-0 items-center justify-center rounded-md", KIND_ICON_CLASS[kind])}>
          <Icon className="size-3.5" strokeWidth={1.8} />
        </div>
        <span className="text-sm font-bold text-foreground">{kindLabel}</span>
      </div>

      {/* Linked design or empty state */}
      {linked ? (
        <div className="flex items-center gap-2">
          <Link2 className={cn("size-3 shrink-0", KIND_LINK_CLASS[kind])} strokeWidth={2} />
          <span className="flex-1 truncate text-sm font-medium text-foreground">
            {linked.name}
          </span>
          <a
            href={`/card-designs/${linked.id}/edit`}
            title={LABELS.editBtn}
            className="flex items-center text-primary hover:text-primary/80"
          >
            <ExternalLink className="size-3" strokeWidth={2} />
          </a>
          {isMaster && (
            <button
              onClick={() => void handleUnlink()}
              disabled={unlinkLoading}
              title={LABELS.unlinkBtn}
              className="flex items-center p-0.5 text-destructive disabled:cursor-not-allowed disabled:opacity-50"
            >
              {unlinkLoading ? (
                <Loader2 className="size-3 animate-spin" strokeWidth={2} />
              ) : (
                <Unlink className="size-3" strokeWidth={2} />
              )}
            </button>
          )}
        </div>
      ) : (
        <div className="text-xs italic text-muted-foreground">
          {LABELS.noDesign}
        </div>
      )}

      {/* Error message */}
      {actionError && (
        <p className="mt-1.5 text-xs text-destructive">{actionError}</p>
      )}

      {/* Link picker (masters only, when no design linked) */}
      {isMaster && !linked && (
        <>
          {pickerOpen ? (
            <div className="mt-2 flex flex-col gap-1.5">
              {pickerLoading && !pickerDesigns.length ? (
                <span className="text-xs text-muted-foreground">{LABELS.loading}</span>
              ) : (
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue placeholder={LABELS.pickerPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {pickerDesigns.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void confirmLink()}
                  disabled={!selectedId || pickerLoading}
                  className="flex-1"
                >
                  {pickerLoading ? (
                    <Loader2 className="animate-spin" strokeWidth={2} />
                  ) : (
                    LABELS.pickerConfirm
                  )}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => { setPickerOpen(false); setActionError(null); }}
                  className="flex-1"
                >
                  {LABELS.pickerCancel}
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => void openPicker()}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-primary bg-accent px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-accent/70"
            >
              {LABELS.linkBtn}
            </button>
          )}
        </>
      )}
    </div>
  );
}

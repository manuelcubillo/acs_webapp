"use client";

/**
 * CardLifecycleControls
 *
 * Lifecycle state controls for a single card, shown on the card edit page
 * (ADMIN+). Lets an admin switch a card on/off and archive it (move to trash).
 *
 * Roles: the whole edit page is already `requireAdmin()`-gated, and the
 * underlying Server Actions re-check the role server-side — this component is UI
 * only. It runs a single action at a time (`loadingAction`), surfaces errors
 * inline, and confirms archiving through `ConfirmDialog`.
 *
 * Scope note (phase 3): only activate / deactivate / archive. Restore lives in
 * the archived view (phase 4), so an already-archived card shows no controls
 * here — reachable only by direct URL, since archived cards are hidden from
 * every list.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2, Power, PowerOff } from "lucide-react";

import CardStatusBadge from "@/components/shared/CardStatusBadge";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  activateCardAction,
  deactivateCardAction,
  archiveCardAction,
} from "@/lib/actions/lifecycle";
import type { LifecycleStatus } from "@/lib/dal";

const TEXT = {
  HEADING: "Estado del carnet",
  DESC: "Activa, desactiva o archiva este carnet.",
  BTN_ACTIVATE: "Activar",
  BTN_DEACTIVATE: "Desactivar",
  BTN_ARCHIVE: "Archivar",
  ARCHIVED_NOTE: "Este carnet está en la papelera.",
  DIALOG_TITLE: "Archivar carnet",
  DIALOG_SUBTITLE: "Se moverá a la papelera.",
  DIALOG_BODY:
    "El carnet dejará de aparecer en los listados y no será operativo. Podrás restaurarlo desde la papelera.",
  DIALOG_CONFIRM: "Archivar",
  DIALOG_CONFIRMING: "Archivando…",
  DIALOG_CANCEL: "Cancelar",
  ERR_FALLBACK: "No se pudo completar la operación.",
} as const;

/** Flash code consumed by the /cards list page after a redirect. */
const ARCHIVE_FLASH = "card-archived";

type LoadingAction = "toggle" | "archive" | null;

interface CardLifecycleControlsProps {
  cardId: string;
  initialStatus: LifecycleStatus;
}

export default function CardLifecycleControls({
  cardId,
  initialStatus,
}: CardLifecycleControlsProps) {
  const router = useRouter();

  const [status, setStatus] = useState<LifecycleStatus>(initialStatus);
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isArchived = status === "archived";
  const isActive = status === "active";
  const isBusy = loadingAction !== null;

  // Toggle active ↔ inactive (expired is treated as inactive → activatable).
  async function handleToggle() {
    setError("");
    setLoadingAction("toggle");
    try {
      const res = isActive
        ? await deactivateCardAction(cardId)
        : await activateCardAction(cardId);
      if (!res.success) {
        setError(res.error ?? TEXT.ERR_FALLBACK);
        return;
      }
      setStatus(res.data.status);
      router.refresh();
    } catch {
      setError(TEXT.ERR_FALLBACK);
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleArchive() {
    setError("");
    setLoadingAction("archive");
    try {
      const res = await archiveCardAction(cardId);
      if (!res.success) {
        setError(res.error ?? TEXT.ERR_FALLBACK);
        setLoadingAction(null);
        return;
      }
      // Archived cards vanish from listings — leave the edit page for the list.
      setConfirmOpen(false);
      router.push(`/cards?flash=${ARCHIVE_FLASH}`);
    } catch {
      setError(TEXT.ERR_FALLBACK);
      setLoadingAction(null);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <h2 className="font-heading text-sm font-bold text-foreground">
              {TEXT.HEADING}
            </h2>
            <CardStatusBadge status={status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {isArchived ? TEXT.ARCHIVED_NOTE : TEXT.DESC}
          </p>
        </div>

        {!isArchived && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleToggle}
              disabled={isBusy}
            >
              {loadingAction === "toggle" ? (
                <Loader2 className="animate-spin" />
              ) : isActive ? (
                <PowerOff strokeWidth={2} />
              ) : (
                <Power strokeWidth={2} />
              )}
              {isActive ? TEXT.BTN_DEACTIVATE : TEXT.BTN_ACTIVATE}
            </Button>

            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={isBusy}
            >
              <Archive strokeWidth={2} />
              {TEXT.BTN_ARCHIVE}
            </Button>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ConfirmDialog
        open={confirmOpen}
        isLoading={loadingAction === "archive"}
        title={TEXT.DIALOG_TITLE}
        description={TEXT.DIALOG_SUBTITLE}
        icon={Archive}
        tone="destructive"
        confirmLabel={TEXT.DIALOG_CONFIRM}
        confirmingLabel={TEXT.DIALOG_CONFIRMING}
        cancelLabel={TEXT.DIALOG_CANCEL}
        onConfirm={handleArchive}
        onCancel={() => setConfirmOpen(false)}
      >
        {TEXT.DIALOG_BODY}
      </ConfirmDialog>
    </section>
  );
}

"use client";

/**
 * CardTypeLifecycleControls
 *
 * Lifecycle state controls for a card type, shown on the card-type detail page
 * (MASTER only). Lets a master switch a type on/off and archive it — archiving
 * cascades to every live card of the type, so the confirmation states how many
 * cards will be dragged into the trash.
 *
 * The Server Actions re-check the MASTER role server-side; this component is UI
 * only. Single action at a time (`loadingAction`), inline errors, archive
 * confirmed through `ConfirmDialog`.
 *
 * Scope note (phase 3): activate / deactivate / archive only. Restore lives in
 * the archived view (phase 4).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2, Power, PowerOff } from "lucide-react";

import CardStatusBadge from "@/components/shared/CardStatusBadge";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  activateCardTypeAction,
  deactivateCardTypeAction,
  archiveCardTypeAction,
} from "@/lib/actions/lifecycle";
import type { LifecycleStatus } from "@/lib/dal";

const TEXT = {
  HEADING: "Estado del tipo",
  DESC: "Activa, desactiva o archiva este tipo de carnet.",
  BTN_ACTIVATE: "Activar",
  BTN_DEACTIVATE: "Desactivar",
  BTN_ARCHIVE: "Archivar",
  ARCHIVED_NOTE: "Este tipo está en la papelera.",
  DIALOG_TITLE: "Archivar tipo de carnet",
  DIALOG_SUBTITLE: "Se moverá a la papelera, junto con sus carnets.",
  DIALOG_BODY_LEAD:
    "El tipo dejará de aparecer en los listados. Esta acción también archivará:",
  DIALOG_BODY_ZERO:
    "El tipo dejará de aparecer en los listados. No tiene carnets vivos que archivar.",
  DIALOG_BODY_TRAIL: "Podrás restaurarlo desde la papelera.",
  CARDS_SINGULAR: "carnet vivo de este tipo",
  CARDS_PLURAL: "carnets vivos de este tipo",
  DIALOG_CONFIRM: "Archivar tipo",
  DIALOG_CONFIRMING: "Archivando…",
  DIALOG_CANCEL: "Cancelar",
  ERR_FALLBACK: "No se pudo completar la operación.",
} as const;

/** Flash code consumed by the /card-types list page after a redirect. */
const ARCHIVE_FLASH = "type-archived";

type LoadingAction = "toggle" | "archive" | null;

interface CardTypeLifecycleControlsProps {
  cardTypeId: string;
  initialStatus: LifecycleStatus;
  /** Live (non-archived) cards of this type — the archive cascade size. */
  liveCardCount: number;
}

export default function CardTypeLifecycleControls({
  cardTypeId,
  initialStatus,
  liveCardCount,
}: CardTypeLifecycleControlsProps) {
  const router = useRouter();

  const [status, setStatus] = useState<LifecycleStatus>(initialStatus);
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isArchived = status === "archived";
  const isActive = status === "active";
  const isBusy = loadingAction !== null;

  async function handleToggle() {
    setError("");
    setLoadingAction("toggle");
    try {
      const res = isActive
        ? await deactivateCardTypeAction(cardTypeId)
        : await activateCardTypeAction(cardTypeId);
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
      const res = await archiveCardTypeAction(cardTypeId);
      if (!res.success) {
        setError(res.error ?? TEXT.ERR_FALLBACK);
        setLoadingAction(null);
        return;
      }
      // Report the real cascade size to the list page's flash banner.
      setConfirmOpen(false);
      router.push(
        `/card-types?flash=${ARCHIVE_FLASH}&n=${res.data.affectedCards}`,
      );
    } catch {
      setError(TEXT.ERR_FALLBACK);
      setLoadingAction(null);
    }
  }

  const cardsLabel =
    liveCardCount === 1 ? TEXT.CARDS_SINGULAR : TEXT.CARDS_PLURAL;

  return (
    <section className="mb-6 rounded-xl border bg-card p-5 shadow-sm">
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
        {liveCardCount > 0 ? (
          <>
            <p>{TEXT.DIALOG_BODY_LEAD}</p>
            <p className="my-2 font-semibold text-foreground">
              {liveCardCount} {cardsLabel}
            </p>
            <p>{TEXT.DIALOG_BODY_TRAIL}</p>
          </>
        ) : (
          <>
            <p>{TEXT.DIALOG_BODY_ZERO}</p>
            <p className="mt-2">{TEXT.DIALOG_BODY_TRAIL}</p>
          </>
        )}
      </ConfirmDialog>
    </section>
  );
}

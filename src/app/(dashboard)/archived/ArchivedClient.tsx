"use client";

/**
 * ArchivedClient — the trash view UI (phase 4).
 *
 * Two tabs (archived card types / archived cards) rendered as tables. Every row
 * shows what it is, when it was archived and by whom, and when it will be
 * physically deleted (the retention countdown, precomputed on the server).
 *
 * Actions:
 *   - Restore card  — admin + master (blocked with an actionable message if the
 *                     card's type is still archived; cascaded cards must be
 *                     restored via their type, so their button is disabled).
 *   - Restore type  — master only (every card type mutation is master-only).
 *   - Delete now    — master only, guarded by a typed-phrase confirmation.
 *   - Empty trash   — master only, typed-phrase confirmation.
 *
 * This is a management surface, not a scan/action outcome, so it uses neutral
 * chrome tokens only — never the reserved `--state-*` colours (constraint #18).
 * Every status/label carries an icon, and all copy lives in TEXT constants.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Archive,
  CreditCard,
  IdCard,
  RotateCcw,
  Trash2,
  Clock,
  User as UserIcon,
  X,
} from "lucide-react";

import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import ConfirmPhraseDialog from "@/components/shared/ConfirmPhraseDialog";
import { cn } from "@/lib/utils";
import {
  restoreCardAction,
  restoreCardTypeAction,
  purgeArchivedCardNowAction,
  purgeArchivedCardTypeNowAction,
  emptyTrashAction,
} from "@/lib/actions/lifecycle";
import type {
  ArchivedCardListItem,
  ArchivedCardTypeListItem,
  TenantRole,
} from "@/lib/dal/types";

// ─── Row shapes (DAL item + server-computed purge countdown) ──────────────────

export type ArchivedCardRow = ArchivedCardListItem & {
  purgeDueAt: Date;
  daysLeft: number;
};

export type ArchivedCardTypeRow = ArchivedCardTypeListItem & {
  purgeDueAt: Date;
  daysLeft: number;
};

// ─── Copy ─────────────────────────────────────────────────────────────────────

const CONFIRM_PHRASE_DELETE = "borrar definitivamente";
const CONFIRM_PHRASE_EMPTY = "vaciar papelera";

const TEXT = {
  HEADING: "Papelera",
  SUBTITLE:
    "Tipos de carnet y carnets archivados. Se eliminan definitivamente al agotar el plazo de retención.",
  RETENTION_NOTE: (days: number) =>
    `Plazo de retención: ${days} ${days === 1 ? "día" : "días"}.`,

  TAB_TYPES: "Tipos archivados",
  TAB_CARDS: "Carnets archivados",

  EMPTY_TRASH: "Vaciar papelera",
  EMPTY_TRASH_RUNNING: "Vaciando…",

  // Table headers
  COL_TYPE: "Tipo",
  COL_CODE: "Código",
  COL_CARD_TYPE: "Tipo de carnet",
  COL_CARDS: "Carnets",
  COL_ARCHIVED: "Archivado",
  COL_PURGE: "Se borra",
  COL_ACTIONS: "Acciones",

  BTN_RESTORE: "Restaurar",
  BTN_DELETE: "Borrar definitivamente",
  RESTORE_VIA_TYPE_HINT: "Se restaura al restaurar su tipo",

  UNKNOWN_USER: "—",
  PURGE_OVERDUE: "vencido",

  EMPTY_TYPES: "No hay tipos de carnet archivados.",
  EMPTY_CARDS: "No hay carnets archivados.",

  // Restore dialogs (light confirmation)
  RESTORE_CARD_TITLE: "Restaurar carnet",
  RESTORE_CARD_BODY: (code: string) =>
    `El carnet ${code} volverá a su estado anterior y reaparecerá en los listados.`,
  RESTORE_TYPE_TITLE: "Restaurar tipo de carnet",
  RESTORE_TYPE_BODY: (name: string, cardCount: number) =>
    cardCount > 0
      ? `El tipo "${name}" y los ${cardCount} carnets que arrastró a la papelera volverán a estar disponibles.`
      : `El tipo "${name}" volverá a estar disponible.`,
  RESTORE_CONFIRM: "Restaurar",
  RESTORE_RUNNING: "Restaurando…",
  CANCEL: "Cancelar",

  // Hard-delete dialogs (typed phrase)
  DELETE_CARD_TITLE: "Borrar carnet definitivamente",
  DELETE_CARD_SUBTITLE: "Esta acción no se puede deshacer.",
  DELETE_CARD_WARNING: (code: string) =>
    `Se eliminará permanentemente el carnet ${code} y todo su historial de acciones. No se puede recuperar.`,
  DELETE_TYPE_TITLE: "Borrar tipo definitivamente",
  DELETE_TYPE_SUBTITLE: "Esta acción no se puede deshacer.",
  DELETE_TYPE_WARNING: (name: string, cardCount: number) =>
    `Se eliminarán permanentemente el tipo "${name}", sus ${cardCount} ${
      cardCount === 1 ? "carnet" : "carnets"
    } y todo el historial asociado. No se puede recuperar.`,
  DELETE_PHRASE_LABEL: "Para confirmar, escribe exactamente:",
  DELETE_CONFIRM: "Borrar definitivamente",
  DELETE_RUNNING: "Borrando…",

  EMPTY_TITLE: "Vaciar toda la papelera",
  EMPTY_SUBTITLE: "Esta acción no se puede deshacer.",
  EMPTY_WARNING: (types: number, cards: number) =>
    `Se eliminarán permanentemente TODOS los elementos archivados de la organización: ${types} ${
      types === 1 ? "tipo" : "tipos"
    } y ${cards} ${cards === 1 ? "carnet" : "carnets"}, con todo su historial. No se puede recuperar.`,
  EMPTY_PHRASE_LABEL: "Para confirmar, escribe exactamente:",
  EMPTY_CONFIRM: "Vaciar papelera",

  // Feedback
  FB_CARD_RESTORED: (code: string) => `Carnet ${code} restaurado.`,
  FB_TYPE_RESTORED: (name: string, n: number) =>
    n > 0
      ? `Tipo "${name}" restaurado, junto con ${n} ${n === 1 ? "carnet" : "carnets"}.`
      : `Tipo "${name}" restaurado.`,
  FB_CARD_DELETED: (code: string) => `Carnet ${code} eliminado definitivamente.`,
  FB_TYPE_DELETED: (name: string) =>
    `Tipo "${name}" eliminado definitivamente.`,
  FB_TRASH_EMPTIED: (types: number, cards: number) =>
    `Papelera vaciada: ${types} ${types === 1 ? "tipo" : "tipos"} y ${cards} ${
      cards === 1 ? "carnet" : "carnets"
    } eliminados.`,
  FB_RESTORE_BLOCKED_TYPE:
    "No se puede restaurar: su tipo de carnet sigue archivado. Restaura antes el tipo.",
  FB_GENERIC_ERROR: "No se pudo completar la operación.",
} as const;

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** Human date for "archived on". */
function formatDate(date: Date): string {
  return format(date, "d MMM yyyy", { locale: es });
}

/** "12 ago 2026 · en 26 días" / "12 ago 2026 · vencido". */
function formatPurge(purgeDueAt: Date, daysLeft: number): string {
  const date = formatDate(purgeDueAt);
  if (daysLeft <= 0) return `${date} · ${TEXT.PURGE_OVERDUE}`;
  if (daysLeft === 1) return `${date} · en 1 día`;
  return `${date} · en ${daysLeft} días`;
}

// ─── Dialog state ─────────────────────────────────────────────────────────────

type DialogState =
  | { kind: "restore-card"; card: ArchivedCardRow }
  | { kind: "restore-type"; cardType: ArchivedCardTypeRow }
  | { kind: "delete-card"; card: ArchivedCardRow }
  | { kind: "delete-type"; cardType: ArchivedCardTypeRow }
  | { kind: "empty" }
  | null;

type DialogResult = { tone: "success" | "error"; message: string };
type Feedback = DialogResult | null;

// ─── Props ────────────────────────────────────────────────────────────────────

interface ArchivedClientProps {
  archivedCardTypes: ArchivedCardTypeRow[];
  archivedCards: ArchivedCardRow[];
  role: TenantRole;
  retentionDays: number;
}

export default function ArchivedClient({
  archivedCardTypes,
  archivedCards,
  role,
  retentionDays,
}: ArchivedClientProps) {
  const router = useRouter();
  const isMaster = role === "master";

  const [dialog, setDialog] = useState<DialogState>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const hasAny = archivedCardTypes.length > 0 || archivedCards.length > 0;
  const defaultTab =
    archivedCardTypes.length === 0 && archivedCards.length > 0
      ? "cards"
      : "types";

  const closeDialog = () => {
    if (!isRunning) setDialog(null);
  };

  /** Open a confirmation dialog, clearing any stale feedback first. */
  const openDialog = (next: NonNullable<DialogState>) => {
    setFeedback(null);
    setDialog(next);
  };

  /**
   * Run the action bound to the open dialog. On success: show a confirmation,
   * close, and refresh the server data so the purged/restored row disappears.
   */
  async function handleConfirm() {
    if (!dialog) return;
    setIsRunning(true);
    setFeedback(null);
    try {
      const result = await dispatch(dialog);
      setFeedback(result);
      setDialog(null);
      if (result.tone === "success") router.refresh();
    } finally {
      setIsRunning(false);
    }
  }

  /** Map an open dialog to its Server Action and a user-facing message. */
  async function dispatch(
    state: NonNullable<DialogState>,
  ): Promise<DialogResult> {
    switch (state.kind) {
      case "restore-card": {
        const res = await restoreCardAction(state.card.id);
        if (res.success)
          return { tone: "success", message: TEXT.FB_CARD_RESTORED(state.card.code) };
        return {
          tone: "error",
          message:
            res.code === "FORBIDDEN_OPERATION"
              ? TEXT.FB_RESTORE_BLOCKED_TYPE
              : res.error ?? TEXT.FB_GENERIC_ERROR,
        };
      }
      case "restore-type": {
        const res = await restoreCardTypeAction(state.cardType.id);
        if (res.success)
          return {
            tone: "success",
            message: TEXT.FB_TYPE_RESTORED(
              state.cardType.name,
              res.data.affectedCards,
            ),
          };
        return { tone: "error", message: res.error ?? TEXT.FB_GENERIC_ERROR };
      }
      case "delete-card": {
        const res = await purgeArchivedCardNowAction(state.card.id);
        if (res.success)
          return { tone: "success", message: TEXT.FB_CARD_DELETED(state.card.code) };
        return { tone: "error", message: res.error ?? TEXT.FB_GENERIC_ERROR };
      }
      case "delete-type": {
        const res = await purgeArchivedCardTypeNowAction(state.cardType.id);
        if (res.success)
          return { tone: "success", message: TEXT.FB_TYPE_DELETED(state.cardType.name) };
        return { tone: "error", message: res.error ?? TEXT.FB_GENERIC_ERROR };
      }
      case "empty": {
        const res = await emptyTrashAction();
        if (res.success)
          return {
            tone: "success",
            message: TEXT.FB_TRASH_EMPTIED(
              res.data.deletedCardTypes,
              res.data.deletedCards,
            ),
          };
        return { tone: "error", message: res.error ?? TEXT.FB_GENERIC_ERROR };
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
            <Archive
              aria-hidden
              className="size-5 text-muted-foreground"
              strokeWidth={1.8}
            />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-extrabold text-foreground">
              {TEXT.HEADING}
            </h1>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              {TEXT.SUBTITLE}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {TEXT.RETENTION_NOTE(retentionDays)}
            </p>
          </div>
        </div>

        {isMaster && (
          <Button
            variant="destructive"
            size="sm"
            disabled={!hasAny || isRunning}
            onClick={() => openDialog({ kind: "empty" })}
          >
            <Trash2 className="size-4" strokeWidth={1.8} />
            {TEXT.EMPTY_TRASH}
          </Button>
        )}
      </div>

      {/* Feedback banner */}
      {feedback && (
        <Alert
          variant={feedback.tone === "error" ? "destructive" : "default"}
          className="flex items-center gap-2 pr-2"
        >
          <AlertDescription
            className={cn(
              "flex-1",
              feedback.tone === "error" ? "text-destructive" : "text-foreground",
            )}
          >
            {feedback.message}
          </AlertDescription>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setFeedback(null)}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="types" className="gap-1.5">
            <CreditCard className="size-3.5" strokeWidth={1.8} />
            {TEXT.TAB_TYPES}
            <CountPill n={archivedCardTypes.length} />
          </TabsTrigger>
          <TabsTrigger value="cards" className="gap-1.5">
            <IdCard className="size-3.5" strokeWidth={1.8} />
            {TEXT.TAB_CARDS}
            <CountPill n={archivedCards.length} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="types" className="mt-4">
          <ArchivedTypesTable
            rows={archivedCardTypes}
            isMaster={isMaster}
            isRunning={isRunning}
            onRestore={(cardType) => openDialog({ kind: "restore-type", cardType })}
            onDelete={(cardType) => openDialog({ kind: "delete-type", cardType })}
          />
        </TabsContent>

        <TabsContent value="cards" className="mt-4">
          <ArchivedCardsTable
            rows={archivedCards}
            isMaster={isMaster}
            isRunning={isRunning}
            onRestore={(card) => openDialog({ kind: "restore-card", card })}
            onDelete={(card) => openDialog({ kind: "delete-card", card })}
          />
        </TabsContent>
      </Tabs>

      {/* ── Confirmation dialogs ─────────────────────────────────────────────── */}

      <ConfirmDialog
        open={dialog?.kind === "restore-card"}
        isLoading={isRunning}
        icon={RotateCcw}
        title={TEXT.RESTORE_CARD_TITLE}
        confirmLabel={TEXT.RESTORE_CONFIRM}
        confirmingLabel={TEXT.RESTORE_RUNNING}
        cancelLabel={TEXT.CANCEL}
        onConfirm={handleConfirm}
        onCancel={closeDialog}
      >
        {dialog?.kind === "restore-card" && TEXT.RESTORE_CARD_BODY(dialog.card.code)}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === "restore-type"}
        isLoading={isRunning}
        icon={RotateCcw}
        title={TEXT.RESTORE_TYPE_TITLE}
        confirmLabel={TEXT.RESTORE_CONFIRM}
        confirmingLabel={TEXT.RESTORE_RUNNING}
        cancelLabel={TEXT.CANCEL}
        onConfirm={handleConfirm}
        onCancel={closeDialog}
      >
        {dialog?.kind === "restore-type" &&
          TEXT.RESTORE_TYPE_BODY(dialog.cardType.name, dialog.cardType.cardCount)}
      </ConfirmDialog>

      <ConfirmPhraseDialog
        open={dialog?.kind === "delete-card"}
        isLoading={isRunning}
        title={TEXT.DELETE_CARD_TITLE}
        description={TEXT.DELETE_CARD_SUBTITLE}
        warning={dialog?.kind === "delete-card" && TEXT.DELETE_CARD_WARNING(dialog.card.code)}
        confirmPhrase={CONFIRM_PHRASE_DELETE}
        phraseLabel={TEXT.DELETE_PHRASE_LABEL}
        confirmLabel={TEXT.DELETE_CONFIRM}
        confirmingLabel={TEXT.DELETE_RUNNING}
        cancelLabel={TEXT.CANCEL}
        onConfirm={handleConfirm}
        onCancel={closeDialog}
      />

      <ConfirmPhraseDialog
        open={dialog?.kind === "delete-type"}
        isLoading={isRunning}
        title={TEXT.DELETE_TYPE_TITLE}
        description={TEXT.DELETE_TYPE_SUBTITLE}
        warning={
          dialog?.kind === "delete-type" &&
          TEXT.DELETE_TYPE_WARNING(dialog.cardType.name, dialog.cardType.cardCount)
        }
        confirmPhrase={CONFIRM_PHRASE_DELETE}
        phraseLabel={TEXT.DELETE_PHRASE_LABEL}
        confirmLabel={TEXT.DELETE_CONFIRM}
        confirmingLabel={TEXT.DELETE_RUNNING}
        cancelLabel={TEXT.CANCEL}
        onConfirm={handleConfirm}
        onCancel={closeDialog}
      />

      <ConfirmPhraseDialog
        open={dialog?.kind === "empty"}
        isLoading={isRunning}
        title={TEXT.EMPTY_TITLE}
        description={TEXT.EMPTY_SUBTITLE}
        warning={TEXT.EMPTY_WARNING(archivedCardTypes.length, archivedCards.length)}
        confirmPhrase={CONFIRM_PHRASE_EMPTY}
        phraseLabel={TEXT.EMPTY_PHRASE_LABEL}
        confirmLabel={TEXT.EMPTY_CONFIRM}
        confirmingLabel={TEXT.EMPTY_TRASH_RUNNING}
        cancelLabel={TEXT.CANCEL}
        onConfirm={handleConfirm}
        onCancel={closeDialog}
      />
    </div>
  );
}

// ─── Small presentational pieces ──────────────────────────────────────────────

/** Neutral count chip next to a tab label. */
function CountPill({ n }: { n: number }) {
  return (
    <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[11px]">
      {n}
    </Badge>
  );
}

/** "Archived on … by …" cell, stacked. */
function ArchivedCell({
  archivedAt,
  archivedByName,
}: {
  archivedAt: Date;
  archivedByName: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-foreground">{formatDate(archivedAt)}</span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <UserIcon aria-hidden className="size-3" strokeWidth={1.8} />
        {archivedByName ?? TEXT.UNKNOWN_USER}
      </span>
    </div>
  );
}

/** "Deleted on … (in N days)" cell. */
function PurgeCell({ purgeDueAt, daysLeft }: { purgeDueAt: Date; daysLeft: number }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <Clock aria-hidden className="size-3.5 shrink-0" strokeWidth={1.8} />
      {formatPurge(purgeDueAt, daysLeft)}
    </span>
  );
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className="py-10 text-center text-sm text-muted-foreground"
      >
        {message}
      </TableCell>
    </TableRow>
  );
}

// ─── Types table ──────────────────────────────────────────────────────────────

interface TypesTableProps {
  rows: ArchivedCardTypeRow[];
  isMaster: boolean;
  isRunning: boolean;
  onRestore: (cardType: ArchivedCardTypeRow) => void;
  onDelete: (cardType: ArchivedCardTypeRow) => void;
}

function ArchivedTypesTable({
  rows,
  isMaster,
  isRunning,
  onRestore,
  onDelete,
}: TypesTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{TEXT.COL_TYPE}</TableHead>
            <TableHead>{TEXT.COL_CARDS}</TableHead>
            <TableHead>{TEXT.COL_ARCHIVED}</TableHead>
            <TableHead>{TEXT.COL_PURGE}</TableHead>
            {isMaster && <TableHead className="text-right">{TEXT.COL_ACTIONS}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={isMaster ? 5 : 4} message={TEXT.EMPTY_TYPES} />
          ) : (
            rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium text-foreground">{t.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="gap-1">
                    <IdCard aria-hidden className="size-3" strokeWidth={1.8} />
                    {t.cardCount}
                  </Badge>
                </TableCell>
                <TableCell>
                  <ArchivedCell archivedAt={t.archivedAt} archivedByName={t.archivedByName} />
                </TableCell>
                <TableCell>
                  <PurgeCell purgeDueAt={t.purgeDueAt} daysLeft={t.daysLeft} />
                </TableCell>
                {isMaster && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isRunning}
                        onClick={() => onRestore(t)}
                      >
                        <RotateCcw className="size-3.5" strokeWidth={1.8} />
                        {TEXT.BTN_RESTORE}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isRunning}
                        onClick={() => onDelete(t)}
                      >
                        <Trash2 className="size-3.5" strokeWidth={1.8} />
                        {TEXT.BTN_DELETE}
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Cards table ──────────────────────────────────────────────────────────────

interface CardsTableProps {
  rows: ArchivedCardRow[];
  isMaster: boolean;
  isRunning: boolean;
  onRestore: (card: ArchivedCardRow) => void;
  onDelete: (card: ArchivedCardRow) => void;
}

function ArchivedCardsTable({
  rows,
  isMaster,
  isRunning,
  onRestore,
  onDelete,
}: CardsTableProps) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{TEXT.COL_CODE}</TableHead>
            <TableHead>{TEXT.COL_CARD_TYPE}</TableHead>
            <TableHead>{TEXT.COL_ARCHIVED}</TableHead>
            <TableHead>{TEXT.COL_PURGE}</TableHead>
            <TableHead className="text-right">{TEXT.COL_ACTIONS}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={5} message={TEXT.EMPTY_CARDS} />
          ) : (
            rows.map((c) => (
              <TableRow
                key={c.id}
                onClick={() =>
                  router.push(`/cards/${encodeURIComponent(c.code)}?from=archived`)
                }
                className="cursor-pointer hover:bg-accent/40"
              >
                <TableCell className="font-mono font-medium text-foreground">
                  {c.code}
                </TableCell>
                <TableCell className="text-muted-foreground">{c.cardTypeName}</TableCell>
                <TableCell>
                  <ArchivedCell archivedAt={c.archivedAt} archivedByName={c.archivedByName} />
                </TableCell>
                <TableCell>
                  <PurgeCell purgeDueAt={c.purgeDueAt} daysLeft={c.daysLeft} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {/* Restore: admin + master. A card dragged in by its type
                        must be restored via the type, so disable it here. */}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isRunning || c.archivedViaType}
                      title={c.archivedViaType ? TEXT.RESTORE_VIA_TYPE_HINT : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRestore(c);
                      }}
                    >
                      <RotateCcw className="size-3.5" strokeWidth={1.8} />
                      {TEXT.BTN_RESTORE}
                    </Button>
                    {isMaster && (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isRunning}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(c);
                        }}
                      >
                        <Trash2 className="size-3.5" strokeWidth={1.8} />
                        {TEXT.BTN_DELETE}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

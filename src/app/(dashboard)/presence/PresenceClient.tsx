"use client";

/**
 * PresenceClient — the "Recinto" occupancy view.
 *
 * Shows who is inside right now, grouped by card type, with a per-row switch to
 * force an exit.
 *
 * ## No polling
 *
 * Same trade as the dashboard feed (ADR 2026-07-17-dashboard-feed-no-polling):
 * an idle page costs nothing, and "Actualizado HH:MM" is what keeps that honest
 * — it names the last time the SERVER was asked, not the last time the clock
 * ticked. A scan from another post appears on the next Refrescar.
 *
 * ## Search is client-side
 *
 * The list is bounded by the domain (the people inside a facility at one
 * moment), so filtering it is a substring match over data already in memory —
 * no round trip, no server-side pagination.
 *
 * ## Forcing an exit
 *
 * The switch executes the card type's system toggle through the normal
 * `executeActionAction` path, so it is lifecycle-gated, written to
 * `action_logs`, and attributed to the operator exactly like any other action.
 * No optimistic update: the row disappears only after the server confirms.
 */

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { AlertCircle, Clock, DoorOpen, RefreshCw, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PresenceControl from "@/components/presence/PresenceControl";
import { cn } from "@/lib/utils";
import { executeActionAction } from "@/lib/actions/actions";
import { getPresenceOccupantsAction } from "@/lib/actions/presence";
import type { PresenceOccupant } from "@/lib/dal";

// ─── Text ───────────────────────────────────────────────────────────────────

const TEXT = {
  TOTAL_LABEL_ONE: "persona dentro del recinto",
  TOTAL_LABEL_MANY: "personas dentro del recinto",
  REFRESH: "Refrescar",
  REFRESHING: "Actualizando…",
  UPDATED_AT: "Actualizado",
  SEARCH_PLACEHOLDER: "Buscar por código o dato…",
  SEARCH_LABEL: "Buscar entre las personas dentro",
  EMPTY: "No hay nadie dentro del recinto.",
  EMPTY_SEARCH: "Ningún resultado para esta búsqueda.",
  INSIDE_SINCE: "Dentro desde",
  EXIT_LABEL: "Marcar salida",
  ERR_EXIT: "No se pudo registrar la salida.",
  ERR_REFRESH: "No se pudo actualizar la lista.",
  ERR_NO_ACTION: "Este tipo de carnet no tiene una acción de presencia activa.",
  GROUP_ONE: "persona",
  GROUP_MANY: "personas",
  DASH: "—",
  YES: "Sí",
  NO: "No",
} as const;

// ─── Formatting ─────────────────────────────────────────────────────────────

/** Mirrors `ActivityFeedEntryRow.formatFieldValue` so a card reads the same on both surfaces. */
function formatFieldValue(value: unknown, fieldType: string): string {
  if (value === null || value === undefined) return TEXT.DASH;
  if (fieldType === "boolean") return value ? TEXT.YES : TEXT.NO;
  if (fieldType === "date" && value instanceof Date) {
    return value.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  }
  if (typeof value === "number") return value.toLocaleString("es-ES");
  return String(value);
}

/** "14:32" — the wall-clock time they came in. */
function formatClock(value: Date | string): string {
  return new Date(value).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "hace 2 horas" — cheap, and the useful half of the answer at a glance. */
function formatElapsed(value: Date | string): string {
  return formatDistanceToNow(new Date(value), { addSuffix: true, locale: es });
}

/** Everything a row's search should match: its code and its summary values. */
function searchHaystack(occupant: PresenceOccupant): string {
  return [
    occupant.code,
    occupant.cardTypeName,
    ...occupant.summaryFields.map((f) => formatFieldValue(f.value, f.fieldType)),
  ]
    .join(" ")
    .toLowerCase();
}

// ─── Component ──────────────────────────────────────────────────────────────

interface PresenceClientProps {
  initialOccupants: PresenceOccupant[];
  /** ISO string — a Date crossing the RSC boundary arrives as one anyway. */
  initialRefreshedAt: string;
}

export default function PresenceClient({
  initialOccupants,
  initialRefreshedAt,
}: PresenceClientProps) {
  const [occupants, setOccupants] = useState(initialOccupants);
  const [refreshedAt, setRefreshedAt] = useState(initialRefreshedAt);
  const [search, setSearch] = useState("");
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();

  const refresh = useCallback(() => {
    startRefresh(async () => {
      setError(null);
      const res = await getPresenceOccupantsAction();
      if (!res.success) {
        setError(res.error ?? TEXT.ERR_REFRESH);
        return;
      }
      setOccupants(res.data);
      setRefreshedAt(new Date().toISOString());
    });
  }, []);

  const handleExit = useCallback(async (occupant: PresenceOccupant) => {
    if (pendingCardId) return;
    if (!occupant.presenceActionDefinitionId) {
      setError(TEXT.ERR_NO_ACTION);
      return;
    }

    setPendingCardId(occupant.cardId);
    setError(null);
    try {
      const res = await executeActionAction({
        cardId: occupant.cardId,
        actionDefinitionId: occupant.presenceActionDefinitionId,
      });
      if (!res.success) {
        setError(res.error ?? TEXT.ERR_EXIT);
        return;
      }
      // The server confirmed the flip, so the row is no longer inside. Drop it
      // locally rather than re-querying — the answer is already known, and the
      // "Actualizado" timestamp stays honest about the last full read.
      setOccupants((prev) => prev.filter((o) => o.cardId !== occupant.cardId));
    } finally {
      setPendingCardId(null);
    }
  }, [pendingCardId]);

  // ── Derived view ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return occupants;
    return occupants.filter((o) => searchHaystack(o).includes(needle));
  }, [occupants, search]);

  const groups = useMemo(() => {
    const byType = new Map<string, { name: string; rows: PresenceOccupant[] }>();
    for (const o of filtered) {
      const group = byType.get(o.cardTypeId) ?? { name: o.cardTypeName, rows: [] };
      group.rows.push(o);
      byType.set(o.cardTypeId, group);
    }
    return [...byType.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, "es"));
  }, [filtered]);

  const total = occupants.length;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header: total + refresh honesty ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
            <Users className="size-7" strokeWidth={1.6} />
          </div>
          <div>
            <div className="font-heading text-4xl font-extrabold leading-none text-foreground">
              {total}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {total === 1 ? TEXT.TOTAL_LABEL_ONE : TEXT.TOTAL_LABEL_MANY}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {TEXT.UPDATED_AT} {formatClock(refreshedAt)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} strokeWidth={2} />
            {isRefreshing ? TEXT.REFRESHING : TEXT.REFRESH}
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className={cn(
            "flex items-start gap-2 rounded-lg border px-4 py-3 text-sm",
            "bg-state-denied border-state-denied-border text-state-denied-foreground",
          )}
        >
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-state-denied-icon" />
          {error}
        </div>
      )}

      {/* ── Search ── */}
      {total > 0 && (
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.8}
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={TEXT.SEARCH_PLACEHOLDER}
            aria-label={TEXT.SEARCH_LABEL}
            className="pl-9"
          />
        </div>
      )}

      {/* ── Occupants ── */}
      {total === 0 ? (
        <EmptyState message={TEXT.EMPTY} />
      ) : filtered.length === 0 ? (
        <EmptyState message={TEXT.EMPTY_SEARCH} />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(([cardTypeId, group]) => (
            <section key={cardTypeId} className="flex flex-col gap-2.5">
              <div className="flex items-baseline gap-2">
                <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  {group.name}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {group.rows.length}{" "}
                  {group.rows.length === 1 ? TEXT.GROUP_ONE : TEXT.GROUP_MANY}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {group.rows.map((occupant) => (
                  <OccupantRow
                    key={occupant.cardId}
                    occupant={occupant}
                    isPending={pendingCardId === occupant.cardId}
                    isDisabled={pendingCardId !== null}
                    onExit={handleExit}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────────

interface OccupantRowProps {
  occupant: PresenceOccupant;
  isPending: boolean;
  isDisabled: boolean;
  onExit: (occupant: PresenceOccupant) => void;
}

function OccupantRow({ occupant, isPending, isDisabled, onExit }: OccupantRowProps) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border bg-card px-4 py-3">
      {/* Photo — addressed by the stable route, never an embedded signed URL:
          this page stays open, and a signature would expire in place. */}
      {occupant.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={occupant.photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-11 shrink-0 rounded-full border border-border object-cover"
        />
      ) : (
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
          <DoorOpen className="size-5" strokeWidth={1.7} />
        </div>
      )}

      {/* Identity + summary */}
      <div className="min-w-0 flex-1">
        <Link
          href={`/cards/${encodeURIComponent(occupant.code)}`}
          className="inline-block rounded-md bg-muted px-2 py-0.5 font-mono text-sm font-bold text-foreground hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {occupant.code}
        </Link>

        {occupant.summaryFields.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {occupant.summaryFields.map((sf) => (
              <span key={sf.fieldDefinitionId} className="text-xs text-muted-foreground">
                {sf.label}:{" "}
                <span className="font-semibold text-foreground/80">
                  {formatFieldValue(sf.value, sf.fieldType)}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Inside since */}
      <div className="hidden shrink-0 flex-col items-end text-xs text-muted-foreground sm:flex">
        <span className="flex items-center gap-1 whitespace-nowrap">
          <Clock className="size-3" strokeWidth={1.8} />
          {TEXT.INSIDE_SINCE} {formatClock(occupant.insideSince)}
        </span>
        <span className="whitespace-nowrap opacity-80">
          {formatElapsed(occupant.insideSince)}
        </span>
      </div>

      {/* Force exit. Everyone listed here is inside, so Entrada is always the
          active segment and Salida is the only move — but showing both names
          the states rather than making the operator infer them. */}
      <div className="flex shrink-0 items-center">
        <PresenceControl
          isInside
          size="compact"
          onChange={() => onExit(occupant)}
          isPending={isPending}
          disabled={isDisabled}
          ariaLabel={`${TEXT.EXIT_LABEL} — ${occupant.code}`}
        />
      </div>
    </div>
  );
}

// ─── Empty ──────────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-6 py-16 text-center">
      <DoorOpen
        aria-hidden
        className="mx-auto mb-3 size-8 text-muted-foreground"
        strokeWidth={1.5}
      />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

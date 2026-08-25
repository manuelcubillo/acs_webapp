"use client";

/**
 * HistoryTableRow
 *
 * Single row in the action history table. Renders with the shared shadcn
 * `TableRow`/`TableCell` parts so borders match the card surface style.
 *
 * Left-border color:
 *   - neutral for scans
 *   - action color (or type default) for actions
 *
 * Columns: Date/Time | Card Code | Card Type | Action | Executed By | Summary Fields | Details
 *
 * A `photo` summary field renders as a thumbnail served by the stable photo
 * route, exactly like the dashboard feed — its stored value is an object key,
 * which printed as text would be a file path. The DAL ships presence only, so
 * the address is derived here from the card code + field id.
 *
 * The whole row navigates to the card detail (as in `CardTableView`), carrying
 * the current history query in `hq` so the detail page's back link can return
 * to this exact view, and storing the scroll offsets so it returns to this
 * exact row.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { cardPhotoRoute } from "@/lib/storage/photo-routes";
import { cardDetailHref } from "@/lib/cards/return-origin";
import { rememberHistoryScroll } from "@/lib/history/scroll-restore";
import { readPageScroll } from "@/lib/navigation/return-scroll";
import { readBooleanAfterValue } from "@/lib/dal/metadata-keys";
import { presenceDirectionLabel } from "@/lib/presence/labels";
import type { ActionHistoryEntry } from "@/lib/dal";

const TEXT = {
  SCAN:     "Escaneo",
  ACTION:   "Acción",
  OVERRIDE: "Override",
  OVERRIDE_TITLE: "Intervención del operador — ejecutado con errores de validación",
  EMPTY:    "—",
} as const;

// ─── Color helpers ────────────────────────────────────────────────────────────
//
// The action accent color is DATA: it comes from the action definition's
// configured `color`. This is a data-driven value (like card-designs), so it is
// resolved at runtime and applied via an inline border color. Named colors map
// to design-system OKLCH variables (no hex literals); a raw value passes through.

const COLOR_VAR_MAP: Record<string, string> = {
  green:  "var(--green-600)",
  red:    "var(--red-600)",
  blue:   "var(--indigo-600)",
  orange: "var(--orange-600)",
  purple: "var(--violet-600)",
  gray:   "var(--muted-foreground)",
};

const NEUTRAL_ACCENT = "var(--muted-foreground)";

function resolveColor(color: string | null | undefined): string {
  if (!color) return NEUTRAL_ACCENT;
  return COLOR_VAR_MAP[color] ?? color;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDateTime(date: Date): { relative: string; absolute: string } {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let relative: string;
  if (seconds < 60) relative = "Ahora";
  else if (minutes < 60) relative = `Hace ${minutes}m`;
  else if (hours < 24) relative = `Hace ${hours}h`;
  else if (days < 7) relative = `Hace ${days}d`;
  else relative = date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });

  const absolute = date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return { relative, absolute };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (value instanceof Date) return value.toLocaleDateString("es-ES");
  return String(value);
}

function formatDetails(entry: ActionHistoryEntry): string {
  if (entry.logType !== "action" || !entry.metadata) return "—";
  const m = entry.metadata;
  const field = m.target_field;
  const before = m.before_value;
  const after = m.after_value;
  if (field === undefined) return "—";
  return `${field}: ${formatValue(before)} → ${formatValue(after)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface HistoryTableRowProps {
  entry: ActionHistoryEntry;
  isOdd: boolean;
  /** Current history query string — travels to the card detail as `hq`. */
  viewQuery: string;
}

// Card-style body cell. Row dividers come from TableRow's border-b; cells allow
// wrapping (whitespace-normal) and align to the top for multi-line summaries.
const CELL =
  "whitespace-normal px-3 py-2.5 align-top text-xs leading-relaxed text-foreground";

export default function HistoryTableRow({
  entry,
  isOdd,
  viewQuery,
}: HistoryTableRowProps) {
  const router = useRouter();
  const presenceAfter = entry.isPresence
    ? readBooleanAfterValue(entry.metadata)
    : null;
  const isScan = entry.logType === "scan";
  // A presence row reads by DIRECTION, not by the action's name — "Presencia"
  // tells the operator nothing about which way the person went. Falls back to
  // the name when the after-value is unreadable, or when the tenant later
  // disabled presence on this card type and the flag no longer derives.
  const actionLabel =
    entry.isPresence && presenceAfter !== null
      ? presenceDirectionLabel(presenceAfter)
      : (entry.actionName ?? TEXT.ACTION);
  const accentColor = isScan ? NEUTRAL_ACCENT : resolveColor(entry.actionColor);
  const { relative, absolute } = formatDateTime(entry.executedAt);
  const details = formatDetails(entry);
  const cardHref = cardDetailHref(entry.cardCode, "history", viewQuery);

  /** The rows scroll inside the table container, not the page — store both. */
  const rememberScroll = (origin: HTMLElement) => {
    const container = origin.closest<HTMLElement>('[data-slot="table-container"]');
    rememberHistoryScroll(viewQuery, {
      page: readPageScroll(),
      container: container?.scrollTop ?? 0,
    });
  };

  /**
   * Store where we are, then navigate. Clicks inside the code cell are left to
   * its `<Link>`: it points at the same href and handles ⌘-click / middle-click
   * natively, which a `router.push` here would swallow.
   */
  const handleRowClick = (event: React.MouseEvent<HTMLTableRowElement>) => {
    if ((event.target as HTMLElement).closest("a")) return;
    rememberScroll(event.currentTarget);
    router.push(cardHref);
  };

  return (
    <TableRow
      onClick={handleRowClick}
      // borderLeftColor is data-driven (action's configured color) — preserved inline.
      style={{ borderLeftColor: accentColor }}
      className={cn(
        "cursor-pointer border-l-[3px] hover:bg-accent/50",
        isOdd ? "bg-muted/30" : "bg-card",
      )}
    >
      {/* Date/Time */}
      <TableCell className={CELL}>
        <div className="font-semibold text-foreground">{relative}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{absolute}</div>
      </TableCell>

      {/* Card Code */}
      <TableCell className={CELL}>
        <Link
          href={cardHref}
          onClick={(e) => rememberScroll(e.currentTarget)}
          className="font-mono text-xs font-bold text-primary hover:underline"
        >
          {entry.cardCode}
        </Link>
      </TableCell>

      {/* Card Type */}
      <TableCell className={CELL}>
        <Badge variant="outline" className="bg-card text-muted-foreground">
          {entry.cardTypeName}
        </Badge>
      </TableCell>

      {/* Action */}
      <TableCell className={CELL}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            // Dot uses the same data-driven action color.
            style={{ backgroundColor: accentColor }}
            className="size-2 shrink-0 rounded-full"
          />
          <span className="font-semibold">
            {isScan ? TEXT.SCAN : actionLabel}
          </span>
          {entry.operatorOverride && (
            <Badge
              title={TEXT.OVERRIDE_TITLE}
              className="bg-state-override border-state-override-border text-state-override-foreground"
            >
              <ShieldAlert strokeWidth={2} />
              {TEXT.OVERRIDE}
            </Badge>
          )}
        </div>
      </TableCell>

      {/* Executed By */}
      <TableCell className={CELL}>
        <span className={entry.executedByName ? "text-foreground" : "text-muted-foreground"}>
          {entry.executedByName ?? TEXT.EMPTY}
        </span>
      </TableCell>

      {/* Summary Fields */}
      <TableCell className={CELL}>
        {entry.summaryFields.length > 0 ? (
          <div className="flex flex-col gap-1">
            {entry.summaryFields.slice(0, 3).map((sf) => (
              <div
                key={sf.fieldDefinitionId}
                className="flex items-center gap-1 text-[11px]"
              >
                <span className="text-muted-foreground">{sf.label}:</span>
                {sf.fieldType === "photo" ? (
                  sf.value ? (
                    /* Same addressing as the dashboard feed: the stable route
                       signs per request, so the thumbnail survives every
                       client-side refetch and never expires in place. Lazy for
                       the reason `PhotoRenderer` is — each thumbnail costs a
                       session check plus a `getCardByCode` on the photo route,
                       and a page here holds 50 rows. */
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={cardPhotoRoute(entry.cardCode, {
                        fieldDefinitionId: sf.fieldDefinitionId,
                      })}
                      alt={sf.label}
                      loading="lazy"
                      decoding="async"
                      className="size-9 shrink-0 rounded-lg border border-border object-cover"
                    />
                  ) : (
                    <span className="text-muted-foreground">{TEXT.EMPTY}</span>
                  )
                ) : (
                  <span className="font-semibold">{formatValue(sf.value)}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">{TEXT.EMPTY}</span>
        )}
      </TableCell>

      {/* Details */}
      <TableCell className={cn(CELL, "text-[11px] text-muted-foreground", !isScan && "font-mono")}>
        {details}
      </TableCell>
    </TableRow>
  );
}

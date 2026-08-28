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
 * Every value on this row is the value AS OF the event, resolved from the
 * frozen snapshot by the DAL — including the card code and the card type name,
 * which is why `cardCodeAtEvent` is what the cell PRINTS while `cardCode` (the
 * live one) is what every link and photo route is BUILT from. A card renamed
 * after this row was written therefore still navigates.
 *
 * The Details column has three modes, and they are not interchangeable:
 *   - the event changed the card  → the field-level diff, up to three inline
 *     and the rest behind a "+N"
 *   - the event only observed it  → nothing to say
 *   - the row predates migration 0022 → the legacy `metadata.before_value` /
 *     `after_value` pair, which is all those rows will ever have
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { cardPhotoRoute } from "@/lib/storage/photo-routes";
import { cardDetailHref } from "@/lib/cards/return-origin";
import { rememberHistoryScroll } from "@/lib/history/scroll-restore";
import { readPageScroll } from "@/lib/navigation/return-scroll";
import { excludeSystemFields } from "@/lib/fields/system";
import { historyRowLabel, lifecycleTransitionLabel } from "@/lib/history/log-types";
import { formatChange, MAX_INLINE_CHANGES } from "@/lib/history/detail-format";
import type { ActionHistoryEntry } from "@/lib/dal";

const TEXT = {
  OVERRIDE: "Override",
  OVERRIDE_TITLE: "Intervención del operador — ejecutado con errores de validación",
  EMPTY:    "—",
  MORE_CHANGES: (n: number) => `+${n}`,
  ALL_CHANGES: "Cambios de este evento",
  /** Shown on the code cell when the card has since been renamed. */
  RENAMED_TITLE: (current: string) => `Código actual: ${current}`,
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

/**
 * The Detail text for a row written BEFORE migration 0022.
 *
 * Those rows have no snapshot and there is no backfill, so this metadata pair
 * is the only record they will ever have of what changed. Do not delete it.
 */
function formatLegacyDetails(entry: ActionHistoryEntry): string {
  if (entry.logType !== "action" || !entry.metadata) return TEXT.EMPTY;
  const m = entry.metadata;
  const field = m.target_field;
  const before = m.before_value;
  const after = m.after_value;
  if (field === undefined) return TEXT.EMPTY;
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
  const isAction = entry.logType === "action";
  // ONE derivation, shared with the CSV export — see `historyRowLabel`. A
  // `card_edit` or `lifecycle` row has no action definition, so without it the
  // cell would fall through to a name it does not have.
  const rowLabel = historyRowLabel(entry);
  // Only a real action carries a configured colour; everything else is neutral.
  const accentColor = isAction ? resolveColor(entry.actionColor) : NEUTRAL_ACCENT;
  const { relative, absolute } = formatDateTime(entry.executedAt);
  const cardHref = cardDetailHref(entry.cardCode, "history", viewQuery);

  // The code and type this row REPORTS. The live ones stay behind the link.
  const displayCode = entry.cardCodeAtEvent ?? entry.cardCode;
  const displayCardType = entry.cardTypeNameAtEvent ?? entry.cardTypeName;
  const wasRenamed = displayCode !== entry.cardCode;

  // A system field's value is machine state, not a card attribute, so it is
  // dropped HERE rather than in `diffSnapshots` — each surface declares that
  // intent itself (`src/lib/fields/system.ts`). A presence toggle therefore
  // shows an empty Detail, which is correct: its Entrada / Salida label in the
  // Acción column already carries the fact.
  const changes = excludeSystemFields(entry.snapshotChanges);
  const inlineChanges = changes.slice(0, MAX_INLINE_CHANGES);
  const hiddenCount = changes.length - inlineChanges.length;
  // A lifecycle row carries no snapshot — a status change is not a field
  // change — so its Detail is the transition it recorded.
  const lifecycleTransition =
    entry.logType === "lifecycle" ? lifecycleTransitionLabel(entry.metadata) : null;
  const legacyDetails = entry.hasSnapshot ? null : formatLegacyDetails(entry);

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
          // The href carries the CURRENT code so a renamed card still resolves;
          // the text is the code as of the event.
          title={wasRenamed ? TEXT.RENAMED_TITLE(entry.cardCode) : undefined}
          className="font-mono text-xs font-bold text-primary hover:underline"
        >
          {displayCode}
        </Link>
      </TableCell>

      {/* Card Type */}
      <TableCell className={CELL}>
        <Badge variant="outline" className="bg-card text-muted-foreground">
          {displayCardType}
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
          <span className="font-semibold">{rowLabel}</span>
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
      <TableCell className={cn(CELL, "text-[11px] text-muted-foreground")}>
        {lifecycleTransition ? (
          <span className="font-mono">{lifecycleTransition}</span>
        ) : legacyDetails !== null ? (
          <span className={cn(isAction && "font-mono")}>{legacyDetails}</span>
        ) : changes.length === 0 ? (
          /* The event observed the card without changing it — or changed only
             system fields, whose value is machine state. */
          <span>{TEXT.EMPTY}</span>
        ) : (
          <div className="flex flex-col items-start gap-0.5 font-mono">
            {inlineChanges.map((c) => (
              <span key={c.fieldDefinitionId}>{formatChange(c)}</span>
            ))}
            {hiddenCount > 0 && (
              <Popover>
                <PopoverTrigger
                  // The whole row navigates on click; this button must not.
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5 rounded-full border border-border bg-card px-2 py-0.5 font-sans text-[11px] font-semibold text-foreground hover:bg-muted"
                >
                  {TEXT.MORE_CHANGES(hiddenCount)}
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  onClick={(e) => e.stopPropagation()}
                  className="max-h-64 w-80 overflow-y-auto"
                >
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {TEXT.ALL_CHANGES}
                  </div>
                  <div className="flex flex-col gap-1 font-mono text-[11px] text-foreground">
                    {changes.map((c) => (
                      <span key={c.fieldDefinitionId}>{formatChange(c)}</span>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

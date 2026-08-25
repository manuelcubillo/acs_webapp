"use client";

/**
 * PresenceControl — a two-segment button group for "inside / outside".
 *
 * Replaces the plain `Switch` phase 1 shipped. It is logically the same
 * two-state control — only the presentation changes — but it names both states,
 * which a switch cannot: an operator glancing at a switch has to remember which
 * way is "in".
 *
 * ## Colour
 *
 * **Entrada active is green (`--state-granted`). Salida active is NEUTRAL
 * (`--state-info`), deliberately NOT red.** This control sits directly beneath
 * the "Acceso correcto" banner in `ActiveCardZone`, which is green, and the
 * denial banner on that same surface is red. A red pill there reads as a failed
 * access at a glance — and reusing `--state-denied` for a legitimate exit would
 * load a reserved token with a meaning it does not have (constraint #18). The
 * emphasis is carried by WHICH segment is active, not by alarm colour.
 *
 * ## Accessibility
 *
 * The active segment is inert but NOT `disabled`: it keeps `aria-pressed` and
 * stays in the tab order, so keyboard traversal is not broken and a screen
 * reader announces the current state rather than skipping it. Both segments do
 * go `disabled` while a call is in flight.
 *
 * ## Execution
 *
 * Clicking the inactive segment runs the card type's presence action through
 * the ordinary `executeActionAction` path — no new route, no bypassing the
 * lifecycle gate or the audit log. There is no optimistic update: the caller
 * awaits the server and re-renders from what it returns.
 */

import { LogIn, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  PRESENCE_ENTRY_LABEL,
  PRESENCE_EXIT_LABEL,
} from "@/lib/presence/labels";

const TEXT = {
  GROUP_LABEL: "Control de presencia",
  ENTRY_HINT: "Marcar entrada — el carnet queda dentro del recinto",
  EXIT_HINT: "Marcar salida — el carnet queda fuera del recinto",
} as const;

export interface PresenceControlProps {
  /** Current state: true = the card is inside. */
  isInside: boolean;
  /**
   * Fires with the state the operator asked for. Only ever called for the
   * INACTIVE segment — clicking the active one is a no-op.
   */
  onChange: (nextIsInside: boolean) => void;
  /** True while an execution is in flight. Disables both segments. */
  isPending?: boolean;
  /**
   * Disables both segments for a reason other than a pending call — an
   * archived card, or another action already running.
   */
  disabled?: boolean;
  /** `compact` is for dense lists (one per row on /presence). */
  size?: "default" | "compact";
  /** Distinguishes this group when several render on one page. */
  ariaLabel?: string;
  className?: string;
}

export default function PresenceControl({
  isInside,
  onChange,
  isPending = false,
  disabled = false,
  size = "default",
  ariaLabel,
  className,
}: PresenceControlProps) {
  const locked = isPending || disabled;
  const compact = size === "compact";

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? TEXT.GROUP_LABEL}
      className={cn(
        "inline-flex shrink-0 items-center rounded-lg border border-border bg-muted/60 p-0.5",
        compact ? "gap-0.5" : "gap-1",
        locked && "opacity-60",
        className,
      )}
    >
      <Segment
        label={PRESENCE_ENTRY_LABEL}
        title={TEXT.ENTRY_HINT}
        Icon={LogIn}
        active={isInside}
        compact={compact}
        locked={locked}
        activeClasses="bg-state-granted text-state-granted-foreground border-state-granted-border"
        onSelect={() => onChange(true)}
      />
      <Segment
        label={PRESENCE_EXIT_LABEL}
        title={TEXT.EXIT_HINT}
        Icon={LogOut}
        active={!isInside}
        compact={compact}
        locked={locked}
        // Neutral, not red — see the header note.
        activeClasses="bg-state-info text-state-info-foreground border-state-info-border"
        onSelect={() => onChange(false)}
      />
    </div>
  );
}

interface SegmentProps {
  label: string;
  title: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  active: boolean;
  compact: boolean;
  locked: boolean;
  activeClasses: string;
  onSelect: () => void;
}

function Segment({
  label,
  title,
  Icon,
  active,
  compact,
  locked,
  activeClasses,
  onSelect,
}: SegmentProps) {
  return (
    <button
      type="button"
      // Not `disabled` when active: the segment is inert but must stay
      // focusable so keyboard traversal reaches the current state.
      aria-pressed={active}
      disabled={locked}
      title={title}
      onClick={() => {
        if (locked || active) return;
        onSelect();
      }}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md border font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
        active
          ? activeClasses
          : "border-transparent text-muted-foreground hover:bg-card hover:text-foreground",
        !locked && !active && "cursor-pointer",
        locked && "cursor-not-allowed",
      )}
    >
      <Icon aria-hidden className={cn("shrink-0", compact ? "size-3.5" : "size-4")} strokeWidth={2} />
      {label}
    </button>
  );
}

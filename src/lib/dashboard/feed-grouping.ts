/**
 * Activity feed grouping — applied at RENDER, not in either builder.
 *
 * ## Why here
 *
 * The feed is built twice: server-side by `getActivityFeed`, client-side by
 * `feed-entries.ts`. ADR 2026-07-17-dashboard-feed-no-polling already names
 * that mirror as duplicated knowledge that can drift. Implementing grouping in
 * both would guarantee two divergent algorithms, and the symptom would be
 * subtle — a feed that regroups itself the moment you press Refrescar.
 *
 * So neither builder groups. `DashboardView` keeps holding raw rows and
 * `prependEntries` is untouched; `ActivityFeed` calls this once on whatever it
 * was handed. One implementation, at the presentation boundary, fed by both
 * producers.
 *
 * ## The limit lives here too
 *
 * The tenant's setting reads "Número de entradas a mostrar", so it counts
 * GROUPS — what the operator sees — not raw rows. Once grouping exists the
 * limit's meaning depends on it, so it is applied at the same boundary, by the
 * same component, for the same reason: neither builder knows what a group is.
 *
 * Producers therefore fetch a raw BUDGET (`feedRawBudget`) and `ActivityFeed`
 * cuts to `displayLimit` groups. See
 * ADR 2026-08-25-feed-limit-counts-groups.md.
 *
 * Pure: no imports beyond types, no side effects, no clock of its own.
 */

import type { ActivityFeedEntry } from "@/lib/dal";

// ─── Feed sizing ─────────────────────────────────────────────────────────────

/** Mirrors the DAL default, applied when a tenant has no settings row yet. */
export const DEFAULT_FEED_LIMIT = 20;

/**
 * Raw rows fetched per group we want to be able to render.
 *
 * Three is the realistic worst case for a single passage: a scan plus presence
 * plus a visit counter is three rows that render as one line.
 */
const RAW_BUDGET_FACTOR = 3;

/**
 * Hard ceiling on raw rows per feed query.
 *
 * The feed is a glanceable surface, not a report — `getActivityFeed` runs four
 * queries off this row set, so the budget stays bounded regardless of what a
 * tenant configures. Matches the max of `ActivityFeedOptionsSchema.limit`.
 */
const MAX_RAW_ROWS = 100;

/**
 * How many RAW rows a producer must fetch to render `displayLimit` groups.
 *
 * Grouping compresses rows, so fetching exactly `displayLimit` rows under-fills
 * the feed — that was the bug this replaced. Over-fetching also hides the
 * boundary artefact: auto-actions execute AFTER their scan and so sort above
 * it, which means the row that anchors a group sits at the BOTTOM of it. A cut
 * through a group orphans its auto-actions (they render standalone, never
 * dropped — see `groupFeedRows`), and the spare rows push that artefact below
 * the display cut where it is never seen.
 *
 * At the maximum configurable display limit the budget is the cap, so a tenant
 * asking for 100 entries gets no headroom and may still see fewer. That is the
 * pre-existing degradation, never worse — and it is bounded, unlike re-querying
 * until the groups fill.
 *
 * @param displayLimit - Groups the tenant asked to see (`feedLimit`).
 * @returns Raw row count to fetch, never above `MAX_RAW_ROWS`.
 */
export function feedRawBudget(displayLimit: number): number {
  return Math.min(displayLimit * RAW_BUDGET_FACTOR, MAX_RAW_ROWS);
}

/**
 * Maximum gap between two manual-action rows for them to merge.
 *
 * Applied as a CHAIN — each row is measured against the row it is absorbed
 * next to, not against the first row of the group — so a steady stream of
 * clicks keeps merging while a genuine pause splits the group.
 */
export const MANUAL_GROUP_WINDOW_MS = 10_000;

/** One rendered feed item: a lone row, a scan and its auto-actions, or a repeat. */
export type GroupedFeedEntry =
  | {
      kind: "single";
      /** Stable React key. */
      key: string;
      entry: ActivityFeedEntry;
    }
  | {
      kind: "scan";
      key: string;
      /** The scan row itself — supplies card, photo, summary fields, time. */
      entry: ActivityFeedEntry;
      /**
       * The auto-actions this scan caused, in execution order (oldest first),
       * which is the order an operator expects to read them in.
       */
      actions: ActivityFeedEntry[];
    }
  | {
      kind: "repeat";
      key: string;
      /** The NEWEST row of the run — its timestamp is the one shown. */
      entry: ActivityFeedEntry;
      /** How many rows merged. Always >= 2; a group of one is never a group. */
      count: number;
      /**
       * The OLDEST row absorbed so far.
       *
       * The window is a chain, not a fixed span from the first row: the next
       * candidate is measured against this, so a steady stream of clicks keeps
       * merging while a real pause splits the run. Not rendered.
       */
      oldest: ActivityFeedEntry;
    };

/** Rows that can merge as repeats: same card, same action, same person, same direction. */
function repeatKey(entry: ActivityFeedEntry): string {
  // The user is part of the identity on purpose. Two operators firing the same
  // action on the same card are two facts; merging them would erase who did
  // what, which is the one thing an audit surface must not do.
  //
  // The presence direction is part of it for the same reason: an entry and an
  // exit are two facts, and the group renders the NEWEST row's label, so
  // merging them would show "Salida ×2" for one entry and one exit. In practice
  // this stops presence rows from merging at all — consecutive toggles always
  // alternate, since PresenceControl's active segment does not fire.
  return [
    entry.cardId,
    entry.actionDefinitionId ?? "",
    entry.executedBy ?? "",
    entry.presenceAfterValue === null ? "" : String(entry.presenceAfterValue),
  ].join("|");
}

/**
 * Collapse a newest-first feed into rendered entries.
 *
 * Rule 1 — a `scan` row absorbs every `action` row carrying its id in
 * `scanLogId`. An action whose scan is NOT in the window (it fell past the
 * feed limit) renders standalone; it is never dropped.
 *
 * Rule 2 — consecutive uncorrelated `action` rows merge when they share card +
 * action + user + presence direction and each is within
 * `MANUAL_GROUP_WINDOW_MS` of its neighbour.
 *
 * Rule 3 — everything else passes through untouched.
 *
 * @param entries - Feed rows, newest first (the order the feed already uses).
 * @returns Rendered entries, newest first.
 */
export function groupFeedRows(entries: ActivityFeedEntry[]): GroupedFeedEntry[] {
  if (entries.length === 0) return [];

  // ── Pass 1: which scans are present, and what belongs to each ──────────────
  const scanIds = new Set(
    entries.filter((e) => e.logType === "scan").map((e) => e.id),
  );

  const actionsByScan = new Map<string, ActivityFeedEntry[]>();
  const absorbed = new Set<ActivityFeedEntry>();

  for (const entry of entries) {
    if (entry.logType !== "action") continue;
    const parent = entry.scanLogId;
    // Only absorb when the anchor is actually on screen — otherwise the row
    // would vanish rather than render on its own.
    if (!parent || !scanIds.has(parent)) continue;
    const list = actionsByScan.get(parent) ?? [];
    list.push(entry);
    actionsByScan.set(parent, list);
    absorbed.add(entry);
  }

  // ── Pass 2: emit, merging consecutive repeats as we go ────────────────────
  const out: GroupedFeedEntry[] = [];

  for (const entry of entries) {
    if (absorbed.has(entry)) continue;

    if (entry.logType === "scan") {
      const actions = actionsByScan.get(entry.id) ?? [];
      out.push({
        kind: "scan",
        key: entry.id,
        entry,
        // Input is newest-first, so reversing gives execution order.
        actions: [...actions].reverse(),
      });
      continue;
    }

    // A manual action may extend the run directly above it. `previous` is the
    // newer row, so the gap is measured from it downwards.
    const previous = out[out.length - 1];
    if (
      entry.logType === "action" &&
      entry.scanLogId === null &&
      previous &&
      (previous.kind === "single" || previous.kind === "repeat") &&
      previous.entry.logType === "action" &&
      previous.entry.scanLogId === null &&
      repeatKey(previous.entry) === repeatKey(entry)
    ) {
      // Chained, not anchored: measure against the row last absorbed, which for
      // a growing group is the oldest one so far.
      const neighbour =
        previous.kind === "repeat" ? previous.oldest : previous.entry;
      const gap =
        new Date(neighbour.executedAt).getTime() -
        new Date(entry.executedAt).getTime();

      if (gap >= 0 && gap <= MANUAL_GROUP_WINDOW_MS) {
        out[out.length - 1] =
          previous.kind === "repeat"
            ? { ...previous, count: previous.count + 1, oldest: entry }
            : {
                kind: "repeat",
                key: previous.entry.id,
                entry: previous.entry,
                count: 2,
                oldest: entry,
              };
        continue;
      }
    }

    out.push({ kind: "single", key: entry.id, entry });
  }

  return out;
}

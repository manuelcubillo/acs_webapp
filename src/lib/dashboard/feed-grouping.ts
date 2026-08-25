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
 * ## Accepted consequence
 *
 * The tenant's configured feed limit counts RAW rows, so a grouped feed can
 * show fewer entries than the limit — a scan with three auto-actions consumes
 * four of the budget and renders as one. That is the better behaviour (the
 * limit bounds work, not visual density) and is documented in
 * `modules/dashboard.md`.
 *
 * Pure: no imports beyond types, no side effects, no clock of its own.
 */

import type { ActivityFeedEntry } from "@/lib/dal";

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

/** Rows that can merge as repeats: same card, same action, same person. */
function repeatKey(entry: ActivityFeedEntry): string {
  // The user is part of the identity on purpose. Two operators firing the same
  // action on the same card are two facts; merging them would erase who did
  // what, which is the one thing an audit surface must not do.
  return [entry.cardId, entry.actionDefinitionId ?? "", entry.executedBy ?? ""].join("|");
}

/**
 * Collapse a newest-first feed into rendered entries.
 *
 * Rule 1 — a `scan` row absorbs every `action` row carrying its id in
 * `scanLogId`. An action whose scan is NOT in the window (it fell past the
 * feed limit) renders standalone; it is never dropped.
 *
 * Rule 2 — consecutive uncorrelated `action` rows merge when they share card +
 * action + user and each is within `MANUAL_GROUP_WINDOW_MS` of its neighbour.
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

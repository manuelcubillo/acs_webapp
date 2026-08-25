/**
 * Grouping rules for the activity feed.
 *
 * Pure function, so these are the real contract — there is no DB and no clock
 * involved. Input is newest-first, as the feed is already ordered.
 */

import { describe, it, expect } from "vitest";
import { groupFeedRows, MANUAL_GROUP_WINDOW_MS } from "../feed-grouping";
import type { ActivityFeedEntry } from "@/lib/dal";

const T0 = new Date("2026-08-25T10:00:00.000Z").getTime();

/** Minimal row; only the fields grouping reads are meaningful. */
function row(over: Partial<ActivityFeedEntry> & { id: string }): ActivityFeedEntry {
  return {
    logType: "action",
    cardId: "card-1",
    cardCode: "C1",
    cardTypeId: "ct-1",
    cardTypeName: "Residente",
    actionDefinitionId: "act-1",
    actionName: "Acción",
    cardPhotoUrl: null,
    executedAt: new Date(T0),
    executedBy: "user-1",
    metadata: null,
    operatorOverride: false,
    scanLogId: null,
    isPresence: false,
    presenceAfterValue: null,
    summaryFields: [],
    ...over,
  } as ActivityFeedEntry;
}

/** Newest-first, `secondsAgo` counting back from T0. */
function at(secondsAgo: number): Date {
  return new Date(T0 - secondsAgo * 1000);
}

describe("groupFeedRows — rule 1: scan groups", () => {
  it("absorbs the auto-actions correlated to a scan", () => {
    const out = groupFeedRows([
      row({ id: "a2", scanLogId: "s1", actionName: "Presencia", isPresence: true, presenceAfterValue: true }),
      row({ id: "a1", scanLogId: "s1", actionName: "Contar visita" }),
      row({ id: "s1", logType: "scan", actionDefinitionId: null, actionName: null }),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("scan");
    if (out[0].kind !== "scan") throw new Error("unreachable");
    expect(out[0].entry.id).toBe("s1");
    // Reversed into execution order: the counter ran before presence.
    expect(out[0].actions.map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("renders an auto-action standalone when its scan is past the feed limit", () => {
    const out = groupFeedRows([
      row({ id: "a1", scanLogId: "s-not-loaded" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("single");
  });

  it("keeps two different scans in two groups", () => {
    const out = groupFeedRows([
      row({ id: "a2", scanLogId: "s2", executedAt: at(0) }),
      row({ id: "s2", logType: "scan", executedAt: at(1) }),
      row({ id: "a1", scanLogId: "s1", executedAt: at(50) }),
      row({ id: "s1", logType: "scan", executedAt: at(51) }),
    ]);
    expect(out.map((g) => g.kind)).toEqual(["scan", "scan"]);
  });

  it("a scan with no auto-actions is still a scan group with zero badges", () => {
    const out = groupFeedRows([row({ id: "s1", logType: "scan" })]);
    expect(out[0].kind).toBe("scan");
    if (out[0].kind !== "scan") throw new Error("unreachable");
    expect(out[0].actions).toEqual([]);
  });
});

describe("groupFeedRows — rule 2: repeated manual actions", () => {
  it("merges three clicks within the window into one ×3", () => {
    const out = groupFeedRows([
      row({ id: "c3", executedAt: at(0) }),
      row({ id: "c2", executedAt: at(2) }),
      row({ id: "c1", executedAt: at(4) }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("repeat");
    if (out[0].kind !== "repeat") throw new Error("unreachable");
    expect(out[0].count).toBe(3);
    // The newest row supplies the timestamp shown.
    expect(out[0].entry.id).toBe("c3");
  });

  it("chains: a steady stream keeps merging past the window from the first row", () => {
    // 0s, 8s, 16s, 24s — each 8s from its neighbour, 24s from the first.
    const out = groupFeedRows([
      row({ id: "c4", executedAt: at(0) }),
      row({ id: "c3", executedAt: at(8) }),
      row({ id: "c2", executedAt: at(16) }),
      row({ id: "c1", executedAt: at(24) }),
    ]);
    expect(out).toHaveLength(1);
    if (out[0].kind !== "repeat") throw new Error("expected repeat");
    expect(out[0].count).toBe(4);
  });

  it("splits when the gap exceeds the window", () => {
    const out = groupFeedRows([
      row({ id: "c2", executedAt: at(0) }),
      row({ id: "c1", executedAt: at(15) }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((g) => g.kind === "single")).toBe(true);
  });

  it("never merges across users — two operators are two facts", () => {
    const out = groupFeedRows([
      row({ id: "c2", executedAt: at(0), executedBy: "user-A" }),
      row({ id: "c1", executedAt: at(1), executedBy: "user-B" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("never merges different actions or different cards", () => {
    expect(
      groupFeedRows([
        row({ id: "c2", executedAt: at(0), actionDefinitionId: "act-1" }),
        row({ id: "c1", executedAt: at(1), actionDefinitionId: "act-2" }),
      ]),
    ).toHaveLength(2);

    expect(
      groupFeedRows([
        row({ id: "c2", executedAt: at(0), cardId: "card-1" }),
        row({ id: "c1", executedAt: at(1), cardId: "card-2" }),
      ]),
    ).toHaveLength(2);
  });

  it("a lone row is a single, never a ×1", () => {
    const out = groupFeedRows([row({ id: "c1" })]);
    expect(out[0].kind).toBe("single");
  });

  it("does not merge scan-correlated actions as repeats", () => {
    // Same card/action/user, but each belongs to its own (absent) scan.
    const out = groupFeedRows([
      row({ id: "a2", executedAt: at(0), scanLogId: "sA" }),
      row({ id: "a1", executedAt: at(1), scanLogId: "sB" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((g) => g.kind === "single")).toBe(true);
  });

  it("boundary: exactly at the window still merges", () => {
    const out = groupFeedRows([
      row({ id: "c2", executedAt: new Date(T0) }),
      row({ id: "c1", executedAt: new Date(T0 - MANUAL_GROUP_WINDOW_MS) }),
    ]);
    expect(out).toHaveLength(1);
  });
});

describe("groupFeedRows — rule 3: pass-through", () => {
  it("returns [] for an empty feed", () => {
    expect(groupFeedRows([])).toEqual([]);
  });

  it("preserves newest-first order across mixed kinds", () => {
    const out = groupFeedRows([
      row({ id: "m1", executedAt: at(0) }),
      row({ id: "a1", scanLogId: "s1", executedAt: at(30) }),
      row({ id: "s1", logType: "scan", executedAt: at(31) }),
    ]);
    expect(out.map((g) => g.key)).toEqual(["m1", "s1"]);
  });

  it("loses no rows: every input row appears exactly once", () => {
    const input = [
      row({ id: "m2", executedAt: at(0) }),
      row({ id: "m1", executedAt: at(1) }),
      row({ id: "a1", scanLogId: "s1", executedAt: at(40) }),
      row({ id: "orphan", scanLogId: "gone", executedAt: at(41) }),
      row({ id: "s1", logType: "scan", executedAt: at(42) }),
    ];
    const out = groupFeedRows(input);

    const seen: string[] = [];
    for (const g of out) {
      if (g.kind === "scan") {
        seen.push(g.entry.id, ...g.actions.map((a) => a.id));
      } else if (g.kind === "repeat") {
        seen.push(g.entry.id, g.oldest.id);
      } else {
        seen.push(g.entry.id);
      }
    }
    expect(seen.sort()).toEqual(input.map((r) => r.id).sort());
  });
});

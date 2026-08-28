/**
 * History filter-params tests
 *
 * Pure unit tests — no DB, no DOM.
 * Covers:
 *  1. Round trip: build → parse returns the state that went in.
 *  2. Defensive parsing of hostile / malformed query strings.
 *  3. `sanitizeHistoryQuery` as the whitelist for the `hq` return blob.
 *  4. `toEffectiveFilters` scan-toggle merge.
 */

import { describe, it, expect } from "vitest";
import {
  parseHistoryParams,
  buildHistoryQuery,
  sanitizeHistoryQuery,
  toEffectiveFilters,
  type HistoryViewState,
} from "../filter-params";
import type { ActionHistoryFilters } from "@/lib/dal/types";

const CARD_TYPE_ID = "11111111-1111-4111-8111-111111111111";
const ACTION_ID = "22222222-2222-4222-8222-222222222222";
const FIELD_ID = "33333333-3333-4333-8333-333333333333";

/** parse(build(state)) — the round trip both directions of the feature rely on. */
function roundTrip(state: HistoryViewState): HistoryViewState {
  const query = buildHistoryQuery(state);
  return parseHistoryParams(new URLSearchParams(query.replace(/^\?/, "")));
}

describe("buildHistoryQuery / parseHistoryParams", () => {
  it("always serializes the scan toggle, even at its default", () => {
    // The ONLY key not omitted at its default. With a tenant-dependent default
    // (scans start hidden when presence control is on), absence stopped having
    // a single meaning — so the value is always explicit.
    expect(buildHistoryQuery({ filters: {}, showScans: true, page: 1 })).toBe("?scans=1");
    expect(buildHistoryQuery({ filters: {}, showScans: false, page: 1 })).toBe("?scans=0");
  });

  it("parses an empty query as the default view", () => {
    expect(parseHistoryParams({})).toEqual({
      filters: {},
      showScans: true,
      page: 1,
    });
  });

  it("round-trips every filter dimension", () => {
    const state: HistoryViewState = {
      filters: {
        dateFrom: new Date("2026-08-01T10:00:00.000Z"),
        dateTo: new Date("2026-08-02T22:30:00.000Z"),
        cardTypeIds: [CARD_TYPE_ID],
        actionDefinitionIds: [ACTION_ID],
        executedBy: "user_abc123",
        cardCode: "444089",
        fieldFilters: [
          {
            fieldDefinitionIds: [FIELD_ID],
            operator: "contains",
            value: "MARIO",
          },
        ],
      },
      showScans: false,
      page: 3,
    };

    expect(roundTrip(state)).toEqual(state);
  });

  it("round-trips a range-valued field filter", () => {
    const state: HistoryViewState = {
      filters: {
        fieldFilters: [
          {
            fieldDefinitionIds: [FIELD_ID],
            operator: "between",
            value: { min: "1", max: "10" },
          },
        ],
      },
      showScans: true,
      page: 1,
    };

    expect(roundTrip(state)).toEqual(state);
  });

  it("omits every other default, so an untouched view stays minimal", () => {
    const query = buildHistoryQuery({
      filters: { cardCode: "A1" },
      showScans: true,
      page: 1,
    });
    // page=1 and the empty filters drop out; only `scans` is always present.
    expect(query).toBe("?code=A1&scans=1");
  });

  it("keeps the scan toggle only when it is off", () => {
    expect(buildHistoryQuery({ filters: {}, showScans: false, page: 1 })).toBe(
      "?scans=0",
    );
  });
});

describe("parseHistoryParams — defensive", () => {
  it("drops ids that are not UUIDs", () => {
    const { filters } = parseHistoryParams({
      ct: `${CARD_TYPE_ID},not-a-uuid`,
      act: "also-not-a-uuid",
    });
    expect(filters.cardTypeIds).toEqual([CARD_TYPE_ID]);
    expect(filters.actionDefinitionIds).toBeUndefined();
  });

  it("drops unparseable dates", () => {
    const { filters } = parseHistoryParams({ df: "yesterday", dt: "" });
    expect(filters.dateFrom).toBeUndefined();
    expect(filters.dateTo).toBeUndefined();
  });

  it("drops field filters that are not valid JSON", () => {
    expect(parseHistoryParams({ ff: "{oops" }).filters.fieldFilters).toBeUndefined();
  });

  it("drops field filters with an unknown operator or no field ids", () => {
    const ff = JSON.stringify([
      { fieldDefinitionIds: [FIELD_ID], operator: "drop table", value: "x" },
      { fieldDefinitionIds: [], operator: "contains", value: "x" },
      { fieldDefinitionIds: [FIELD_ID], operator: "contains", value: "keep" },
    ]);
    expect(parseHistoryParams({ ff }).filters.fieldFilters).toEqual([
      { fieldDefinitionIds: [FIELD_ID], operator: "contains", value: "keep" },
    ]);
  });

  it("clamps the page to 1 for junk, zero and negatives", () => {
    expect(parseHistoryParams({ page: "abc" }).page).toBe(1);
    expect(parseHistoryParams({ page: "0" }).page).toBe(1);
    expect(parseHistoryParams({ page: "-4" }).page).toBe(1);
    expect(parseHistoryParams({ page: "2.9" }).page).toBe(2);
  });

  it("treats a repeated param as its first value", () => {
    expect(parseHistoryParams({ code: ["A1", "B2"] }).filters.cardCode).toBe("A1");
  });

  it("shows scans unless the toggle is explicitly off", () => {
    expect(parseHistoryParams({}).showScans).toBe(true);
    expect(parseHistoryParams({ scans: "1" }).showScans).toBe(true);
    expect(parseHistoryParams({ scans: "0" }).showScans).toBe(false);
  });
});

describe("sanitizeHistoryQuery", () => {
  it("returns an empty string for missing input", () => {
    expect(sanitizeHistoryQuery(undefined)).toBe("");
    expect(sanitizeHistoryQuery(null)).toBe("");
    expect(sanitizeHistoryQuery("")).toBe("");
  });

  it("keeps known keys and drops everything else", () => {
    expect(sanitizeHistoryQuery("?code=A1&evil=1&redirect=http://x.test")).toBe(
      "?code=A1&scans=1",
    );
  });

  it("accepts input with or without the leading question mark", () => {
    expect(sanitizeHistoryQuery("code=A1")).toBe("?code=A1&scans=1");
  });

  it("cannot produce anything but a query string", () => {
    // Whatever arrives, the result is rebuilt from validated values only — so a
    // back link can never be turned into an off-site or path-changing href.
    // Everything unrecognised is dropped; `scans` is re-emitted because build
    // always emits it, which is still a pure history query.
    expect(sanitizeHistoryQuery("//evil.test")).toBe("?scans=1");
    expect(sanitizeHistoryQuery("?ct=../../admin")).toBe("?scans=1");
    // The safety property itself: no path, no host, no foreign key survives.
    for (const hostile of ["//evil.test", "?ct=../../admin", "?foo=bar"]) {
      const out = sanitizeHistoryQuery(hostile);
      expect(out.startsWith("?")).toBe(true);
      expect(out).not.toContain("evil");
      expect(out).not.toContain("..");
      expect(out).not.toContain("foo");
    }
  });
});

describe("parseHistoryParams — injected scan default", () => {
  it("falls back to the caller's default when `scans` is absent", () => {
    // Presence disabled → scans shown, the historical behaviour.
    expect(parseHistoryParams({}, true).showScans).toBe(true);
    // Presence enabled → the history page passes false, so scans start hidden
    // (every operational scan writes a scan row AND a presence action row).
    expect(parseHistoryParams({}, false).showScans).toBe(false);
  });

  it("defaults to true when no default is supplied, as before", () => {
    expect(parseHistoryParams({}).showScans).toBe(true);
  });

  it("an explicit value always beats the default, in both directions", () => {
    expect(parseHistoryParams({ scans: "1" }, false).showScans).toBe(true);
    expect(parseHistoryParams({ scans: "0" }, true).showScans).toBe(false);
  });

  it("round trips a flipped toggle through the hq blob", () => {
    // The operator turns scans ON in a presence tenant, opens a card, comes
    // back: the blob carries scans=1 explicitly, so the default never reasserts.
    const flipped = buildHistoryQuery({ filters: {}, showScans: true, page: 1 });
    expect(flipped).toContain("scans=1");
    expect(parseHistoryParams(new URLSearchParams(flipped.slice(1)), false).showScans).toBe(true);
    expect(sanitizeHistoryQuery(flipped, false)).toBe(flipped);
  });
});

describe("toEffectiveFilters", () => {
  const base: ActionHistoryFilters = { cardCode: "A1" };

  it("sends an EXPLICIT list even when nothing is selected", () => {
    // Never `undefined`. Before A2 the toggle-on path deleted the key, so no
    // log-type predicate was applied at all — which is how `lifecycle` rows had
    // been reaching /history for a month while the docs said they could not.
    expect(toEffectiveFilters(base, true)).toEqual({
      cardCode: "A1",
      logTypes: ["scan", "action", "card_edit", "lifecycle"],
    });
  });

  it("removes only `scan` when scans are hidden", () => {
    expect(toEffectiveFilters(base, false)).toEqual({
      cardCode: "A1",
      logTypes: ["action", "card_edit", "lifecycle"],
    });
  });

  it("honours the panel's selection when there is one", () => {
    expect(toEffectiveFilters({ ...base, logTypes: ["card_edit"] }, true)).toEqual({
      cardCode: "A1",
      logTypes: ["card_edit"],
    });
  });

  it("intersects the two controls — the toggle can only ever remove `scan`", () => {
    expect(
      toEffectiveFilters({ ...base, logTypes: ["scan", "card_edit"] }, false),
    ).toEqual({ cardCode: "A1", logTypes: ["card_edit"] });
  });

  it("yields an EMPTY list when the two controls contradict each other", () => {
    // Only scans selected, then scans hidden. Empty means "match nothing" —
    // `buildWhere` honours it as such rather than falling back to "match
    // everything", which is what would show the whole table to an operator who
    // asked for none of it.
    expect(toEffectiveFilters({ ...base, logTypes: ["scan"] }, false)).toEqual({
      cardCode: "A1",
      logTypes: [],
    });
  });
});

describe("log types in the query string", () => {
  it("round trips a selection", () => {
    const q = buildHistoryQuery({
      filters: { logTypes: ["card_edit", "lifecycle"] },
      showScans: true,
      page: 1,
    });
    expect(q).toContain("lt=card_edit%2Clifecycle");
    expect(parseHistoryParams(new URLSearchParams(q.slice(1))).filters.logTypes).toEqual([
      "card_edit",
      "lifecycle",
    ]);
  });

  it("drops anything that is not a real log type", () => {
    // A hand-typed URL must filter nothing rather than reach Zod, where it
    // would surface as a silently empty table.
    const parsed = parseHistoryParams({ lt: "card_edit,nonsense,,scan" });
    expect(parsed.filters.logTypes).toEqual(["card_edit", "scan"]);
  });

  it("omits the key entirely when nothing is selected", () => {
    const q = buildHistoryQuery({ filters: {}, showScans: true, page: 1 });
    expect(q).not.toContain("lt=");
  });
});

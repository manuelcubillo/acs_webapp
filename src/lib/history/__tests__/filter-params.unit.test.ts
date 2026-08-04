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
  it("returns an empty query for the default view", () => {
    expect(buildHistoryQuery({ filters: {}, showScans: true, page: 1 })).toBe("");
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

  it("omits defaults so an untouched view stays at a bare path", () => {
    const query = buildHistoryQuery({
      filters: { cardCode: "A1" },
      showScans: true,
      page: 1,
    });
    expect(query).toBe("?code=A1");
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
      "?code=A1",
    );
  });

  it("accepts input with or without the leading question mark", () => {
    expect(sanitizeHistoryQuery("code=A1")).toBe("?code=A1");
  });

  it("cannot produce anything but a query string", () => {
    // Whatever arrives, the result is rebuilt from validated values only — so a
    // back link can never be turned into an off-site or path-changing href.
    expect(sanitizeHistoryQuery("//evil.test")).toBe("");
    expect(sanitizeHistoryQuery("?ct=../../admin")).toBe("");
  });
});

describe("toEffectiveFilters", () => {
  const base: ActionHistoryFilters = { cardCode: "A1" };

  it("restricts to action rows when scans are hidden", () => {
    expect(toEffectiveFilters(base, false)).toEqual({
      cardCode: "A1",
      logTypes: ["action"],
    });
  });

  it("applies no log-type constraint when scans are shown", () => {
    expect(toEffectiveFilters({ ...base, logTypes: ["action"] }, true)).toEqual(base);
  });
});

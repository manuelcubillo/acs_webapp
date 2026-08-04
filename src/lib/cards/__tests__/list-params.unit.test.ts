/**
 * Card list-params tests
 *
 * Pure unit tests — no DB, no DOM.
 * Covers:
 *  1. Round trip: build → parse returns the state that went in.
 *  2. Defensive parsing of hostile / malformed query strings.
 *  3. `sanitizeCardListQuery` as the whitelist for the `cq` return blob.
 *  4. `toPagination` — the window the server page and CardList must agree on.
 */

import { describe, it, expect } from "vitest";
import {
  parseCardListParams,
  buildCardListQuery,
  sanitizeCardListQuery,
  toPagination,
  CARD_LIST_PAGE_SIZE,
  DEFAULT_CARD_LIST_STATE,
  type CardListViewState,
} from "../list-params";

const TYPE_A = "11111111-1111-4111-8111-111111111111";
const TYPE_B = "22222222-2222-4222-8222-222222222222";
const FIELD_ID = "33333333-3333-4333-8333-333333333333";

/** parse(build(state)) — the round trip both directions of the feature rely on. */
function roundTrip(state: CardListViewState): CardListViewState {
  const query = buildCardListQuery(state);
  return parseCardListParams(new URLSearchParams(query.replace(/^\?/, "")));
}

describe("buildCardListQuery / parseCardListParams", () => {
  it("returns an empty query for the default view", () => {
    expect(buildCardListQuery(DEFAULT_CARD_LIST_STATE)).toBe("");
  });

  it("parses an empty query as the default view", () => {
    expect(parseCardListParams({})).toEqual(DEFAULT_CARD_LIST_STATE);
  });

  it("round-trips every dimension", () => {
    const state: CardListViewState = {
      cardTypeIds: [TYPE_A, TYPE_B],
      search: "4408",
      status: "inactive",
      fieldFilters: [
        { fieldDefinitionIds: [FIELD_ID], operator: "contains", value: "MARIO" },
      ],
      view: "profile",
      page: 3,
    };
    expect(roundTrip(state)).toEqual(state);
  });

  it("round-trips a range field filter", () => {
    const state: CardListViewState = {
      ...DEFAULT_CARD_LIST_STATE,
      fieldFilters: [
        {
          fieldDefinitionIds: [FIELD_ID],
          operator: "between",
          value: { min: 1, max: 10 },
        },
      ],
    };
    expect(roundTrip(state)).toEqual(state);
  });

  it("omits defaults so an untouched list stays at a bare /cards", () => {
    const query = buildCardListQuery({
      ...DEFAULT_CARD_LIST_STATE,
      search: "A1",
    });
    expect(query).toBe("?q=A1");
  });

  it("reads a repeated param as its first value", () => {
    const state = parseCardListParams(new URLSearchParams(`ct=${TYPE_A}&ct=${TYPE_B}`));
    expect(state.cardTypeIds).toEqual([TYPE_A]);
  });

  it("honours the legacy single-type deep link when ct is absent", () => {
    expect(parseCardListParams({ cardTypeId: TYPE_A }).cardTypeIds).toEqual([TYPE_A]);
  });

  it("prefers ct over the legacy param when both are present", () => {
    expect(
      parseCardListParams({ ct: TYPE_B, cardTypeId: TYPE_A }).cardTypeIds,
    ).toEqual([TYPE_B]);
  });
});

describe("parseCardListParams — defensive", () => {
  it("drops card type ids that are not UUIDs", () => {
    const state = parseCardListParams({ ct: `${TYPE_A},not-a-uuid,,${TYPE_B}` });
    expect(state.cardTypeIds).toEqual([TYPE_A, TYPE_B]);
  });

  it("falls back to 'all' for an unknown status", () => {
    expect(parseCardListParams({ status: "archived" }).status).toBe("all");
    expect(parseCardListParams({ status: "'; DROP TABLE" }).status).toBe("all");
  });

  it("falls back to the table for an unknown view", () => {
    expect(parseCardListParams({ view: "kanban" }).view).toBe("table");
  });

  it("clamps the page to 1 or more", () => {
    expect(parseCardListParams({ page: "0" }).page).toBe(1);
    expect(parseCardListParams({ page: "-4" }).page).toBe(1);
    expect(parseCardListParams({ page: "abc" }).page).toBe(1);
    expect(parseCardListParams({ page: "2.7" }).page).toBe(2);
  });

  it("drops field filters that are not usable JSON", () => {
    expect(parseCardListParams({ ff: "{not json" }).fieldFilters).toEqual([]);
    expect(parseCardListParams({ ff: '{"a":1}' }).fieldFilters).toEqual([]);
    expect(parseCardListParams({ ff: "[1,2,3]" }).fieldFilters).toEqual([]);
  });

  it("drops a field filter with an unknown operator or no valid field id", () => {
    const hostile = JSON.stringify([
      { fieldDefinitionIds: [FIELD_ID], operator: "DROP", value: 1 },
      { fieldDefinitionIds: ["nope"], operator: "contains", value: 1 },
      { fieldDefinitionIds: [FIELD_ID], operator: "contains", value: "keep" },
    ]);
    expect(parseCardListParams({ ff: hostile }).fieldFilters).toEqual([
      { fieldDefinitionIds: [FIELD_ID], operator: "contains", value: "keep" },
    ]);
  });

  it("trims and caps the search term", () => {
    expect(parseCardListParams({ q: "  A1  " }).search).toBe("A1");
    expect(parseCardListParams({ q: "x".repeat(500) }).search).toHaveLength(100);
  });
});

describe("sanitizeCardListQuery", () => {
  it("returns an empty string for nothing to restore", () => {
    expect(sanitizeCardListQuery(undefined)).toBe("");
    expect(sanitizeCardListQuery("")).toBe("");
    expect(sanitizeCardListQuery("?")).toBe("");
  });

  it("accepts the query with or without its leading ?", () => {
    expect(sanitizeCardListQuery("?q=A1")).toBe("?q=A1");
    expect(sanitizeCardListQuery("q=A1")).toBe("?q=A1");
  });

  it("strips parameters that are not card list state", () => {
    expect(sanitizeCardListQuery("?q=A1&flash=card-archived&redirect=/admin")).toBe(
      "?q=A1",
    );
  });

  it("cannot be turned into a path or an absolute URL", () => {
    // Whatever arrives, the caller appends the result to "/cards".
    expect(sanitizeCardListQuery("https://evil.example/steal")).toBe("");
    expect(sanitizeCardListQuery("../../etc/passwd")).toBe("");
    expect(sanitizeCardListQuery("?q=A1#/../admin")).toBe("?q=A1%23%2F..%2Fadmin");
  });
});

describe("toPagination", () => {
  it("pages the table 50 at a time", () => {
    expect(toPagination({ ...DEFAULT_CARD_LIST_STATE, page: 3 })).toEqual({
      limit: 50,
      offset: 100,
    });
  });

  it("pages the gallery sooner, its cards being taller", () => {
    expect(CARD_LIST_PAGE_SIZE.profile).toBeLessThan(CARD_LIST_PAGE_SIZE.table);
    expect(
      toPagination({ ...DEFAULT_CARD_LIST_STATE, view: "profile", page: 2 }),
    ).toEqual({ limit: 25, offset: 25 });
  });

  it("starts at offset 0", () => {
    expect(toPagination(DEFAULT_CARD_LIST_STATE).offset).toBe(0);
  });
});

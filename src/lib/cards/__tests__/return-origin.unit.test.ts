/**
 * Card return-origin tests
 *
 * Pure unit tests — no DB, no DOM.
 *
 * The loop this closes: a list builds `cardDetailHref`, the detail page reads
 * it back with `resolveCardOrigin`, and the edit page carries `forwardQuery`
 * one step further. All three have to agree on the param names, so they are
 * exercised together rather than against hardcoded strings.
 */

import { describe, it, expect } from "vitest";
import { cardDetailHref, resolveCardOrigin } from "../return-origin";

const TYPE_A = "11111111-1111-4111-8111-111111111111";

/** Read the origin params back out of a href the same way a page would. */
function originParamsOf(href: string) {
  const query = new URLSearchParams(href.slice(href.indexOf("?") + 1));
  return {
    from: query.get("from") ?? undefined,
    cq: query.get("cq") ?? undefined,
    hq: query.get("hq") ?? undefined,
  };
}

describe("cardDetailHref", () => {
  it("addresses the card by code, never by id", () => {
    expect(cardDetailHref("444089", "cards", "")).toBe("/cards/444089?from=cards");
  });

  it("encodes a code with URL-significant characters", () => {
    expect(cardDetailHref("A/B 1", "cards", "")).toBe("/cards/A%2FB%201?from=cards");
  });

  it("carries the list query under the key its origin reads", () => {
    expect(originParamsOf(cardDetailHref("A1", "cards", "?q=A1"))).toEqual({
      from: "cards",
      cq: "?q=A1",
      hq: undefined,
    });
    expect(originParamsOf(cardDetailHref("A1", "history", "?code=A1"))).toEqual({
      from: "history",
      cq: undefined,
      hq: "?code=A1",
    });
  });
});

describe("resolveCardOrigin", () => {
  it("returns to the exact list a row came from", () => {
    const href = cardDetailHref("A1", "cards", `?ct=${TYPE_A}&status=active&page=2`);
    const resolved = resolveCardOrigin(originParamsOf(href));
    expect(resolved.origin).toBe("cards");
    expect(resolved.backHref).toBe(`/cards?ct=${TYPE_A}&status=active&page=2`);
  });

  it("returns to the exact history view a row came from", () => {
    const href = cardDetailHref("A1", "history", "?code=A1&scans=0");
    const resolved = resolveCardOrigin(originParamsOf(href));
    expect(resolved.origin).toBe("history");
    expect(resolved.backHref).toBe("/history?code=A1&scans=0");
  });

  it("falls back to the dashboard for a card opened directly", () => {
    expect(resolveCardOrigin({})).toEqual({
      origin: "dashboard",
      backHref: "/dashboard",
      forwardQuery: "",
      cardListQuery: "",
    });
  });

  it("falls back to the dashboard for an unknown origin", () => {
    expect(resolveCardOrigin({ from: "elsewhere", cq: "?q=A1" }).backHref).toBe(
      "/dashboard",
    );
  });

  it("sends the trash origin back to the trash, which has no view state", () => {
    const resolved = resolveCardOrigin({ from: "archived" });
    expect(resolved.backHref).toBe("/archived");
    expect(resolved.cardListQuery).toBe("");
  });

  it("survives an edit page in the middle: forwardQuery resolves identically", () => {
    const first = resolveCardOrigin(
      originParamsOf(cardDetailHref("A1", "cards", "?q=A1&view=profile")),
    );
    // What the edit page appends to the detail href, parsed back as if the
    // operator had cancelled out of the editor.
    const second = resolveCardOrigin(
      originParamsOf(`/cards/A1${first.forwardQuery}`),
    );
    expect(second).toEqual(first);
  });

  it("does not carry a query the origin cannot use", () => {
    // An `hq` arriving with `from=cards` belongs to no back link here.
    const resolved = resolveCardOrigin({ from: "cards", cq: "?q=A1", hq: "?code=X" });
    expect(resolved.backHref).toBe("/cards?q=A1");
    expect(resolved.forwardQuery).toBe(`?from=cards&cq=${encodeURIComponent("?q=A1")}`);
  });

  it("re-validates the blob, so a foreign one cannot reach the href", () => {
    expect(
      resolveCardOrigin({ from: "cards", cq: "https://evil.example/steal" }).backHref,
    ).toBe("/cards");
    expect(
      resolveCardOrigin({ from: "cards", cq: "?q=A1&redirect=/admin" }).backHref,
    ).toBe("/cards?q=A1");
  });

  it("exposes the list query alone, for a redirect that is not a back link", () => {
    // Archiving from the edit page lands on the list rather than returning.
    expect(resolveCardOrigin({ from: "cards", cq: "?status=active" }).cardListQuery)
      .toBe("?status=active");
  });
});

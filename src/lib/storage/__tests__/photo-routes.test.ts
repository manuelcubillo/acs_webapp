import { describe, expect, it } from "vitest";
import { cardPhotoRoute } from "../photo-routes";

const FIELD = "33333333-3333-3333-3333-333333333333";
/** 2026-09-05T22:00:00.000Z → 1788645600s. */
const UPDATED_AT = new Date("2026-09-05T22:00:00.000Z");
const UPDATED_AT_SECONDS = "1788645600";

describe("cardPhotoRoute", () => {
  it("builds a bare route with no options", () => {
    expect(cardPhotoRoute("A-1042")).toBe("/api/photos/cards/A-1042");
  });

  it("encodes the code, which is tenant-authored and may contain anything", () => {
    expect(cardPhotoRoute("A/1042 #2")).toBe("/api/photos/cards/A%2F1042%20%232");
  });

  it("carries the field selector and the download flag", () => {
    expect(
      cardPhotoRoute("A-1042", { fieldDefinitionId: FIELD, download: true }),
    ).toBe(`/api/photos/cards/A-1042?field=${FIELD}&download=`);
  });
});

describe("cardPhotoRoute version token", () => {
  it("serialises updatedAt as epoch seconds", () => {
    expect(cardPhotoRoute("A-1042", { updatedAt: UPDATED_AT })).toBe(
      `/api/photos/cards/A-1042?v=${UPDATED_AT_SECONDS}`,
    );
  });

  it("accepts the ISO string and epoch millis a serialisation boundary yields", () => {
    // The same card rendered from a server component (Date), from a Server
    // Action result (ISO string) and after JSON round-tripping (number) must
    // address one URL — otherwise the same image is cached three times.
    const fromDate = cardPhotoRoute("A-1042", { updatedAt: UPDATED_AT });
    expect(cardPhotoRoute("A-1042", { updatedAt: UPDATED_AT.toISOString() })).toBe(
      fromDate,
    );
    expect(cardPhotoRoute("A-1042", { updatedAt: UPDATED_AT.getTime() })).toBe(
      fromDate,
    );
  });

  it("changes when the card is touched — the whole point of the token", () => {
    const before = cardPhotoRoute("A-1042", { updatedAt: UPDATED_AT });
    const after = cardPhotoRoute("A-1042", {
      updatedAt: new Date(UPDATED_AT.getTime() + 60_000),
    });
    expect(after).not.toBe(before);
  });

  it("degrades to no token rather than throwing on an unusable date", () => {
    // A render must never die because a timestamp arrived malformed; the worst
    // acceptable outcome is the pre-token caching behaviour.
    expect(cardPhotoRoute("A-1042", { updatedAt: "not-a-date" })).toBe(
      "/api/photos/cards/A-1042",
    );
    expect(cardPhotoRoute("A-1042", { updatedAt: Number.NaN })).toBe(
      "/api/photos/cards/A-1042",
    );
  });

  it("combines with the field selector, so multi-photo cards stay addressable", () => {
    expect(
      cardPhotoRoute("A-1042", {
        fieldDefinitionId: FIELD,
        updatedAt: UPDATED_AT,
      }),
    ).toBe(`/api/photos/cards/A-1042?field=${FIELD}&v=${UPDATED_AT_SECONDS}`);
  });

  it("never leaks an object key — the token is a timestamp and nothing else", () => {
    const url = cardPhotoRoute("A-1042", {
      fieldDefinitionId: FIELD,
      updatedAt: UPDATED_AT,
    });
    expect(new URLSearchParams(url.split("?")[1]).get("v")).toMatch(/^\d+$/);
  });
});

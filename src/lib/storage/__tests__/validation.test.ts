import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/dal/errors";
import { assertHeadOk, assertObjectMatchesKind } from "../validation";

const TENANT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OWNER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("assertObjectMatchesKind", () => {
  it("passes for a key under the caller's tenant + kind", () => {
    expect(() =>
      assertObjectMatchesKind({
        key: `${TENANT}/cards/${OWNER}/x.webp`,
        expectedTenantId: TENANT,
        expectedKind: "card-photo",
      }),
    ).not.toThrow();
  });

  it("refuses cross-tenant keys", () => {
    expect(() =>
      assertObjectMatchesKind({
        key: `cccccccc-cccc-cccc-cccc-cccccccccccc/cards/${OWNER}/x.webp`,
        expectedTenantId: TENANT,
        expectedKind: "card-photo",
      }),
    ).toThrow(ValidationError);
  });

  it("refuses kind path mismatches", () => {
    expect(() =>
      assertObjectMatchesKind({
        key: `${TENANT}/branding/${TENANT}/x.webp`,
        expectedTenantId: TENANT,
        expectedKind: "card-photo",
      }),
    ).toThrow(ValidationError);
  });
});

describe("assertHeadOk", () => {
  it("accepts a small webp", () => {
    expect(() =>
      assertHeadOk({
        head: {
          contentLength: 50_000,
          contentType: "image/webp",
          etag: "abc",
        },
        maxBytes: 200_000,
      }),
    ).not.toThrow();
  });

  it("refuses empty objects", () => {
    expect(() =>
      assertHeadOk({
        head: { contentLength: 0, contentType: "image/webp", etag: "" },
        maxBytes: 200_000,
      }),
    ).toThrow(ValidationError);
  });

  it("refuses oversized objects", () => {
    expect(() =>
      assertHeadOk({
        head: {
          contentLength: 500_000,
          contentType: "image/webp",
          etag: "x",
        },
        maxBytes: 200_000,
      }),
    ).toThrow(ValidationError);
  });

  it("refuses unsupported content types", () => {
    expect(() =>
      assertHeadOk({
        head: {
          contentLength: 50_000,
          contentType: "image/svg+xml",
          etag: "x",
        },
        maxBytes: 200_000,
      }),
    ).toThrow(ValidationError);
  });
});

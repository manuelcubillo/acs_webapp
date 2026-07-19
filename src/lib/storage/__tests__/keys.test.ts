import { describe, expect, it } from "vitest";
import {
  buildCardPhotoDownloadFilename,
  buildObjectKey,
  keyMatches,
  tenantPrefix,
} from "../keys";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OWNER = "22222222-2222-2222-2222-222222222222";

describe("buildObjectKey", () => {
  it("produces the expected layout for each kind", () => {
    expect(
      buildObjectKey({
        kind: "card-photo",
        tenantId: TENANT,
        ownerId: OWNER,
        mime: "image/webp",
      }),
    ).toMatch(new RegExp(`^${TENANT}/cards/${OWNER}/[0-9a-f-]{36}\\.webp$`));

    expect(
      buildObjectKey({
        kind: "card-design-image",
        tenantId: TENANT,
        ownerId: OWNER,
        mime: "image/jpeg",
      }),
    ).toMatch(
      new RegExp(`^${TENANT}/card-designs/${OWNER}/[0-9a-f-]{36}\\.jpg$`),
    );

    expect(
      buildObjectKey({
        kind: "member-avatar",
        tenantId: TENANT,
        ownerId: OWNER,
        mime: "image/png",
      }),
    ).toMatch(new RegExp(`^${TENANT}/members/${OWNER}/[0-9a-f-]{36}\\.png$`));

    expect(
      buildObjectKey({
        kind: "tenant-logo",
        tenantId: TENANT,
        ownerId: TENANT,
        mime: "image/webp",
      }),
    ).toMatch(new RegExp(`^${TENANT}/branding/${TENANT}/[0-9a-f-]{36}\\.webp$`));
  });
});

describe("keyMatches", () => {
  const key = `${TENANT}/cards/${OWNER}/abcd.webp`;

  it("accepts a key inside the tenant + kind prefix", () => {
    expect(keyMatches(key, { tenantId: TENANT, kind: "card-photo" })).toBe(true);
  });

  it("rejects another tenant's key", () => {
    expect(
      keyMatches(key, {
        tenantId: "33333333-3333-3333-3333-333333333333",
        kind: "card-photo",
      }),
    ).toBe(false);
  });

  it("rejects a wrong kind", () => {
    expect(keyMatches(key, { tenantId: TENANT, kind: "member-avatar" })).toBe(false);
  });

  it("rejects malformed keys", () => {
    expect(keyMatches("not-a-key", { tenantId: TENANT, kind: "card-photo" })).toBe(false);
    expect(keyMatches("", { tenantId: TENANT, kind: "card-photo" })).toBe(false);
  });
});

describe("tenantPrefix", () => {
  it("appends a trailing slash", () => {
    expect(tenantPrefix(TENANT)).toBe(`${TENANT}/`);
  });
});

describe("buildCardPhotoDownloadFilename", () => {
  const key = `${TENANT}/cards/${OWNER}/9f8e7d6c-1234-5678-9abc-def012345678.webp`;

  it("names the file <code>_<fieldName>_<random>.<ext>", () => {
    expect(
      buildCardPhotoDownloadFilename({
        code: "AB-0001",
        fieldName: "Foto frontal",
        key,
      }),
    ).toBe("ab-0001_foto-frontal_9f8e7d6c-1234-5678-9abc-def012345678.webp");
  });

  it("keeps the random segment so the file is traceable to storage", () => {
    const name = buildCardPhotoDownloadFilename({
      code: "X",
      fieldName: "y",
      key,
    });
    expect(name).toContain("9f8e7d6c-1234-5678-9abc-def012345678");
    expect(name.endsWith(".webp")).toBe(true);
  });

  it("folds accents and strips unsafe characters", () => {
    expect(
      buildCardPhotoDownloadFilename({
        code: "Añó/2026",
        fieldName: "Fotografía #1",
        key: `${TENANT}/cards/${OWNER}/abc.jpg`,
      }),
    ).toBe("ano-2026_fotografia-1_abc.jpg");
  });

  it("falls back to 'foto' when a token slugs to empty", () => {
    expect(
      buildCardPhotoDownloadFilename({
        code: "///",
        fieldName: "***",
        key: `${TENANT}/cards/${OWNER}/r.png`,
      }),
    ).toBe("foto_foto_r.png");
  });
});

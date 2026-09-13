import { describe, expect, it, vi } from "vitest";

// `photo-urls` is server-only; the marker module has no meaning outside Next.
vi.mock("server-only", () => ({}));

const { stripCardPhotoKeys, stripCardListPhotoKeys } = await import(
  "../photo-urls"
);
type CardWithFields = Parameters<typeof stripCardPhotoKeys>[0];

/** What a real key looks like: `<tenantId>/cards/<cardId>/<uuid>.<ext>`. */
const KEY = "11111111-1111-1111-1111-111111111111/cards/2222/abcd.webp";
const KEY_PATTERN = /[0-9a-f-]{4,}\/cards\//;

/** Overrides are loosely typed on purpose: a fixture may set `raw` partially. */
function card(fields: Array<Record<string, unknown>>) {
  return {
    id: "card-1",
    code: "A-1042",
    updatedAt: new Date(),
    fields: fields.map((f) => ({
      fieldDefinitionId: "fd-1",
      name: "foto",
      label: "Foto",
      fieldType: "photo",
      isRequired: false,
      isSystem: false,
      value: KEY,
      raw: { valueText: KEY, valueNumber: null },
      ...f,
    })),
  } as unknown as CardWithFields;
}

describe("stripCardPhotoKeys", () => {
  it("replaces a photo key with a presence flag", () => {
    const [photo] = stripCardPhotoKeys(card([{}])).fields;
    expect(photo.value).toBe(true);
  });

  it("redacts raw.valueText too — the key rides there a second time", () => {
    const [photo] = stripCardPhotoKeys(card([{}])).fields;
    expect(photo.raw.valueText).toBeNull();
  });

  it("reports false for a photo field holding no object", () => {
    const [photo] = stripCardPhotoKeys(
      card([{ value: null, raw: { valueText: null } }]),
    ).fields;
    expect(photo.value).toBe(false);
  });

  it("leaves non-photo fields untouched", () => {
    const [text] = stripCardPhotoKeys(
      card([{ fieldType: "text", value: "Ana", raw: { valueText: "Ana" } }]),
    ).fields;
    expect(text.value).toBe("Ana");
    expect(text.raw.valueText).toBe("Ana");
  });

  it("leaves no object key anywhere in the serialised payload", () => {
    // The guarantee the ADRs actually make, asserted the way a leak would show
    // up: over the whole JSON the client receives, not field by field.
    const before = JSON.stringify(card([{}]));
    const after = JSON.stringify(stripCardPhotoKeys(card([{}])));
    expect(before).toMatch(KEY_PATTERN);
    expect(after).not.toMatch(KEY_PATTERN);
  });

  it("redacts every photo field on a multi-photo card", () => {
    const stripped = stripCardPhotoKeys(
      card([
        { fieldDefinitionId: "fd-1" },
        { fieldDefinitionId: "fd-2" },
        {
          fieldDefinitionId: "fd-3",
          fieldType: "text",
          value: "Ana",
          raw: { valueText: "Ana" },
        },
      ]),
    );
    expect(JSON.stringify(stripped)).not.toMatch(KEY_PATTERN);
  });
});

describe("stripCardListPhotoKeys", () => {
  it("applies the same redaction across a list", () => {
    const stripped = stripCardListPhotoKeys([card([{}]), card([{}])]);
    expect(JSON.stringify(stripped)).not.toMatch(KEY_PATTERN);
    expect(stripped.every((c) => c.fields[0].value === true)).toBe(true);
  });
});

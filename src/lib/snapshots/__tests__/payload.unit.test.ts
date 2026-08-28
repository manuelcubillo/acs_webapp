/**
 * Card snapshot payload shape and canonical hash.
 *
 * Pure module, so these are the real contract — no DB, no clock. The hash is
 * what deduplicates snapshots, so every case here is really asking one
 * question: does this difference count as a different card state?
 */

import { describe, it, expect } from "vitest";
import {
  buildCardSnapshotPayload,
  buildCardSnapshot,
  hashCardSnapshotPayload,
  canonicalPayloadJson,
  CARD_SNAPSHOT_PAYLOAD_VERSION,
  type CardSnapshotFieldInput,
  type CardSnapshotSource,
} from "../payload";

// UUID-ish ids chosen so that sorted order (a < b < c) differs from the order
// they are supplied in below — otherwise "input order does not matter" would
// pass without the sort doing anything.
const FD_A = "11111111-1111-1111-1111-111111111111";
const FD_B = "55555555-5555-5555-5555-555555555555";
const FD_C = "99999999-9999-9999-9999-999999999999";

function field(
  over: Partial<CardSnapshotFieldInput> & { fieldDefinitionId: string },
): CardSnapshotFieldInput {
  return {
    name: "nombre",
    label: "Nombre",
    type: "text",
    isSystem: false,
    value: "Ada",
    ...over,
  };
}

function source(over: Partial<CardSnapshotSource> = {}): CardSnapshotSource {
  return {
    code: "C001",
    cardTypeId: "ct-1",
    cardTypeName: "Residente",
    fields: [
      field({ fieldDefinitionId: FD_B, name: "saldo", label: "Saldo", type: "number", value: 3 }),
      field({ fieldDefinitionId: FD_A }),
      field({ fieldDefinitionId: FD_C, name: "dentro", label: "Dentro", type: "boolean", value: true }),
    ],
    ...over,
  };
}

describe("buildCardSnapshotPayload", () => {
  it("stamps the schema version", () => {
    expect(buildCardSnapshotPayload(source()).v).toBe(CARD_SNAPSHOT_PAYLOAD_VERSION);
  });

  it("sorts fields ascending by fieldDefinitionId", () => {
    const payload = buildCardSnapshotPayload(source());
    expect(payload.fields.map((f) => f.fieldDefinitionId)).toEqual([FD_A, FD_B, FD_C]);
  });

  it("carries the card identity and the card type name", () => {
    const payload = buildCardSnapshotPayload(source());
    expect(payload.code).toBe("C001");
    expect(payload.cardTypeId).toBe("ct-1");
    expect(payload.cardTypeName).toBe("Residente");
  });
});

describe("hashCardSnapshotPayload", () => {
  it("is identical across two independent constructions of the same state", () => {
    const a = buildCardSnapshotPayload(source());
    const b = buildCardSnapshotPayload(source());
    expect(a).not.toBe(b); // genuinely two objects
    expect(hashCardSnapshotPayload(a)).toBe(hashCardSnapshotPayload(b));
  });

  it("is a 64-character lowercase hex sha256", () => {
    expect(hashCardSnapshotPayload(buildCardSnapshotPayload(source()))).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("does not depend on the order the fields were supplied in", () => {
    const forwards = source();
    const backwards = source({ fields: [...forwards.fields].reverse() });

    expect(hashCardSnapshotPayload(buildCardSnapshotPayload(forwards))).toBe(
      hashCardSnapshotPayload(buildCardSnapshotPayload(backwards)),
    );
  });

  it("changes when one value changes", () => {
    const before = buildCardSnapshotPayload(source());
    const after = buildCardSnapshotPayload(
      source({
        fields: [
          field({ fieldDefinitionId: FD_B, name: "saldo", label: "Saldo", type: "number", value: 4 }),
          field({ fieldDefinitionId: FD_A }),
          field({ fieldDefinitionId: FD_C, name: "dentro", label: "Dentro", type: "boolean", value: true }),
        ],
      }),
    );

    expect(hashCardSnapshotPayload(after)).not.toBe(hashCardSnapshotPayload(before));
  });

  it("changes when only a field's label changes — labels are part of the frozen state", () => {
    const before = buildCardSnapshotPayload(source());
    const renamed = buildCardSnapshotPayload(
      source({
        fields: source().fields.map((f) =>
          f.fieldDefinitionId === FD_A ? { ...f, label: "Nombre completo" } : f,
        ),
      }),
    );

    expect(hashCardSnapshotPayload(renamed)).not.toBe(hashCardSnapshotPayload(before));
  });

  it("changes when only a field's internal name changes", () => {
    const before = buildCardSnapshotPayload(source());
    const renamed = buildCardSnapshotPayload(
      source({
        fields: source().fields.map((f) =>
          f.fieldDefinitionId === FD_A ? { ...f, name: "nombre_completo" } : f,
        ),
      }),
    );

    expect(hashCardSnapshotPayload(renamed)).not.toBe(hashCardSnapshotPayload(before));
  });

  it("changes when the card type is renamed", () => {
    expect(
      hashCardSnapshotPayload(buildCardSnapshotPayload(source({ cardTypeName: "Invitado" }))),
    ).not.toBe(hashCardSnapshotPayload(buildCardSnapshotPayload(source())));
  });

  it("does not depend on the key order of the payload object it is given", () => {
    const payload = buildCardSnapshotPayload(source());
    // Same data, keys shuffled — as a payload read back out of jsonb might be.
    const shuffled = {
      fields: payload.fields.map((f) => ({
        value: f.value,
        isSystem: f.isSystem,
        type: f.type,
        label: f.label,
        name: f.name,
        fieldDefinitionId: f.fieldDefinitionId,
      })),
      cardTypeName: payload.cardTypeName,
      cardTypeId: payload.cardTypeId,
      code: payload.code,
      v: payload.v,
    } as typeof payload;

    expect(hashCardSnapshotPayload(shuffled)).toBe(hashCardSnapshotPayload(payload));
  });
});

describe("absent vs empty", () => {
  it("a field present with null and a field absent produce the same payload", () => {
    const withNull = buildCardSnapshotPayload(
      source({ fields: [field({ fieldDefinitionId: FD_A, value: null })] }),
    );
    const withUndefined = buildCardSnapshotPayload(
      source({ fields: [field({ fieldDefinitionId: FD_A, value: undefined })] }),
    );

    expect(withNull).toEqual(withUndefined);
    expect(withNull.fields[0].value).toBeNull();
    expect(hashCardSnapshotPayload(withNull)).toBe(hashCardSnapshotPayload(withUndefined));
  });

  it("a null value and an empty string are different states", () => {
    const empty = buildCardSnapshotPayload(
      source({ fields: [field({ fieldDefinitionId: FD_A, value: "" })] }),
    );
    const missing = buildCardSnapshotPayload(
      source({ fields: [field({ fieldDefinitionId: FD_A, value: null })] }),
    );

    expect(hashCardSnapshotPayload(empty)).not.toBe(hashCardSnapshotPayload(missing));
  });
});

describe("value serialisation", () => {
  it("stores a photo's object key verbatim", () => {
    const key = "tenant-1/cards/card-1/9f3a2b.webp";
    const payload = buildCardSnapshotPayload(
      source({
        fields: [field({ fieldDefinitionId: FD_A, name: "foto", label: "Foto", type: "photo", value: key })],
      }),
    );

    expect(payload.fields[0].value).toBe(key);
    // Nothing resembling a URL or a signature may appear in a payload.
    expect(canonicalPayloadJson(payload)).not.toMatch(/https?:\/\//);
  });

  it("serialises a date as ISO 8601", () => {
    const payload = buildCardSnapshotPayload(
      source({
        fields: [
          field({
            fieldDefinitionId: FD_A,
            name: "alta",
            label: "Alta",
            type: "date",
            value: new Date("2026-08-28T09:30:00.000Z"),
          }),
        ],
      }),
    );

    expect(payload.fields[0].value).toBe("2026-08-28T09:30:00.000Z");
  });

  it("hashes a Date and its ISO string identically", () => {
    const asDate = buildCardSnapshotPayload(
      source({
        fields: [field({ fieldDefinitionId: FD_A, type: "date", value: new Date("2026-08-28T09:30:00.000Z") })],
      }),
    );
    const asString = buildCardSnapshotPayload(
      source({
        fields: [field({ fieldDefinitionId: FD_A, type: "date", value: "2026-08-28T09:30:00.000Z" })],
      }),
    );

    expect(hashCardSnapshotPayload(asDate)).toBe(hashCardSnapshotPayload(asString));
  });

  it("keeps a non-finite number out of the payload rather than emitting invalid JSON", () => {
    const payload = buildCardSnapshotPayload(
      source({ fields: [field({ fieldDefinitionId: FD_A, type: "number", value: Number.NaN })] }),
    );

    expect(payload.fields[0].value).toBeNull();
    expect(() => JSON.parse(canonicalPayloadJson(payload))).not.toThrow();
  });

  it("preserves boolean false rather than collapsing it to null", () => {
    const payload = buildCardSnapshotPayload(
      source({ fields: [field({ fieldDefinitionId: FD_A, type: "boolean", value: false })] }),
    );

    expect(payload.fields[0].value).toBe(false);
    expect(hashCardSnapshotPayload(payload)).not.toBe(
      hashCardSnapshotPayload(
        buildCardSnapshotPayload(
          source({ fields: [field({ fieldDefinitionId: FD_A, type: "boolean", value: null })] }),
        ),
      ),
    );
  });

  it("keeps system fields in the payload", () => {
    const payload = buildCardSnapshotPayload(
      source({
        fields: [
          field({ fieldDefinitionId: FD_A, name: "__presence", label: "Presencia", type: "boolean", isSystem: true, value: true }),
        ],
      }),
    );

    expect(payload.fields).toHaveLength(1);
    expect(payload.fields[0].isSystem).toBe(true);
  });
});

describe("buildCardSnapshot", () => {
  it("returns the payload alongside its own hash", () => {
    const { payload, contentHash } = buildCardSnapshot(source());
    expect(contentHash).toBe(hashCardSnapshotPayload(payload));
  });
});

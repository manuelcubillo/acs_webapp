/**
 * `diffSnapshots` — pure, so every case is exercised with hand-made payloads.
 *
 * The first test is the one that matters: a V0 snapshot has no predecessor, and
 * every card in the current database gets its V0 lazily on first touch. If that
 * returned a diff, the first scan of every card would render as "N fields
 * changed" the day this ships.
 */

import { describe, it, expect } from "vitest";

import {
  diffSnapshots,
  SNAPSHOT_CODE_FIELD_ID,
  SNAPSHOT_CARD_TYPE_FIELD_ID,
} from "@/lib/snapshots/diff";
import {
  CARD_SNAPSHOT_PAYLOAD_VERSION,
  type CardSnapshotField,
  type CardSnapshotPayload,
  type CardSnapshotValue,
} from "@/lib/snapshots/payload";
import type { FieldType } from "@/lib/dal/types";

const FIELD_A = "11111111-1111-1111-1111-111111111111";
const FIELD_B = "22222222-2222-2222-2222-222222222222";
const FIELD_C = "33333333-3333-3333-3333-333333333333";
const CARD_TYPE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function field(
  id: string,
  value: CardSnapshotValue,
  overrides: Partial<CardSnapshotField> = {},
): CardSnapshotField {
  return {
    fieldDefinitionId: id,
    name: `f_${id.slice(0, 4)}`,
    label: `Campo ${id.slice(0, 4)}`,
    type: "text" as FieldType,
    isSystem: false,
    value,
    ...overrides,
  };
}

function payload(
  fields: CardSnapshotField[],
  overrides: Partial<CardSnapshotPayload> = {},
): CardSnapshotPayload {
  return {
    v: CARD_SNAPSHOT_PAYLOAD_VERSION,
    code: "C001",
    cardTypeId: CARD_TYPE,
    cardTypeName: "Socio",
    fields,
    ...overrides,
  };
}

describe("diffSnapshots", () => {
  it("returns nothing when there is no predecessor (a V0 bootstrap)", () => {
    const current = payload([field(FIELD_A, "Ana"), field(FIELD_B, "600")]);
    expect(diffSnapshots(null, current)).toEqual([]);
  });

  it("returns nothing for identical payloads", () => {
    const a = payload([field(FIELD_A, "Ana"), field(FIELD_B, "600")]);
    const b = payload([field(FIELD_A, "Ana"), field(FIELD_B, "600")]);
    expect(diffSnapshots(a, b)).toEqual([]);
  });

  it("reports exactly one entry when one value changed", () => {
    const before = payload([field(FIELD_A, "Ana"), field(FIELD_B, "600")]);
    const after = payload([field(FIELD_A, "Ana María"), field(FIELD_B, "600")]);

    const changes = diffSnapshots(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      fieldDefinitionId: FIELD_A,
      before: "Ana",
      after: "Ana María",
    });
  });

  it("reports every changed value, in the order of `current.fields`", () => {
    const before = payload([
      field(FIELD_A, "Ana"),
      field(FIELD_B, "600"),
      field(FIELD_C, "x"),
    ]);
    const after = payload([
      field(FIELD_C, "y"),
      field(FIELD_A, "Beatriz"),
      field(FIELD_B, "601"),
    ]);

    const changes = diffSnapshots(before, after);
    expect(changes.map((c) => c.fieldDefinitionId)).toEqual([
      FIELD_C,
      FIELD_A,
      FIELD_B,
    ]);
  });

  it("ignores a label rename when the value is unchanged", () => {
    const before = payload([field(FIELD_A, "Ana", { label: "Nombre" })]);
    const after = payload([field(FIELD_A, "Ana", { label: "Nombre completo" })]);
    expect(diffSnapshots(before, after)).toEqual([]);
  });

  it("carries the NEWER label when the field was renamed AND changed", () => {
    const before = payload([field(FIELD_A, "Ana", { label: "Nombre" })]);
    const after = payload([
      field(FIELD_A, "Beatriz", { label: "Nombre completo" }),
    ]);

    const changes = diffSnapshots(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].label).toBe("Nombre completo");
  });

  it("reports a field absent from `previous` as a change from null", () => {
    const before = payload([field(FIELD_A, "Ana")]);
    const after = payload([field(FIELD_A, "Ana"), field(FIELD_B, "nuevo")]);

    const changes = diffSnapshots(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      fieldDefinitionId: FIELD_B,
      before: null,
      after: "nuevo",
    });
  });

  it("reports a field absent from `current` as a change to null", () => {
    const before = payload([field(FIELD_A, "Ana"), field(FIELD_B, "viejo")]);
    const after = payload([field(FIELD_A, "Ana")]);

    const changes = diffSnapshots(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      fieldDefinitionId: FIELD_B,
      before: "viejo",
      after: null,
    });
  });

  it("treats null and the empty string as distinct", () => {
    const before = payload([field(FIELD_A, null)]);
    const after = payload([field(FIELD_A, "")]);

    const changes = diffSnapshots(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ before: null, after: "" });
  });

  it("treats `false` and `0` as real values, never as absent", () => {
    const before = payload([
      field(FIELD_A, true, { type: "boolean" }),
      field(FIELD_B, 5, { type: "number" }),
    ]);
    const after = payload([
      field(FIELD_A, false, { type: "boolean" }),
      field(FIELD_B, 0, { type: "number" }),
    ]);

    const changes = diffSnapshots(before, after);
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({ before: true, after: false });
    expect(changes[1]).toMatchObject({ before: 5, after: 0 });

    // And the reverse direction: 0 → 0 and false → false are NOT changes.
    expect(diffSnapshots(after, after)).toEqual([]);
  });

  it("reports a code change under the synthetic id, before the fields", () => {
    const before = payload([field(FIELD_A, "Ana")], { code: "C001" });
    const after = payload([field(FIELD_A, "Beatriz")], { code: "C999" });

    const changes = diffSnapshots(before, after);
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({
      fieldDefinitionId: SNAPSHOT_CODE_FIELD_ID,
      before: "C001",
      after: "C999",
      // Never filtered by excludeSystemFields — a rename must stay visible.
      isSystem: false,
    });
    expect(changes[1].fieldDefinitionId).toBe(FIELD_A);
  });

  it("reports a card type RENAME under the synthetic id", () => {
    const before = payload([], { cardTypeName: "Socio" });
    const after = payload([], { cardTypeName: "Socio anual" });

    const changes = diffSnapshots(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      fieldDefinitionId: SNAPSHOT_CARD_TYPE_FIELD_ID,
      before: "Socio",
      after: "Socio anual",
    });
  });

  it("includes system fields — filtering is the caller's decision", () => {
    const before = payload([
      field(FIELD_A, false, { type: "boolean", isSystem: true }),
    ]);
    const after = payload([
      field(FIELD_A, true, { type: "boolean", isSystem: true }),
    ]);

    const changes = diffSnapshots(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].isSystem).toBe(true);
  });
});

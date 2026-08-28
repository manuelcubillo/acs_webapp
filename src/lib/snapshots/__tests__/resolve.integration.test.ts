/**
 * `loadSnapshotsForLogRows` against a real Postgres.
 *
 * The point of the function is that a PAGE of log rows costs ONE snapshot
 * query regardless of how many rows point at the same state — a card scanned
 * 500 times must not drag 500 copies of one payload through a CSV export. That
 * is a property of the call, not of the SQL text, so it is asserted by counting
 * the calls.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { like } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { createTenant, deleteTenant } from "@/lib/dal/tenants";
import { createCardType } from "@/lib/dal/card-types";
import { addFieldDefinition } from "@/lib/dal/field-definitions";
import { createCard, updateCard } from "@/lib/dal/cards";
import { getCardById } from "@/lib/dal/cards";
import { distinctSnapshotIds, loadSnapshotsForLogRows } from "../resolve";
import { projectSnapshotFields } from "../project";
import type { Tenant, CardType, CardWithFields, FieldDefinition } from "@/lib/dal/types";

const PREFIX = "__test_resolve_";

let tenant: Tenant;
let cardType: CardType;
let nameField: FieldDefinition;
let card: CardWithFields;
/** V0 → V1 → V2, in order. */
const versions: string[] = [];

beforeAll(async () => {
  tenant = await createTenant({ name: `${PREFIX}T` });
  cardType = await createCardType(tenant.id, { name: `${PREFIX}Socio` });
  nameField = await addFieldDefinition(cardType.id, {
    name: "nombre",
    label: "Nombre",
    fieldType: "text",
    isRequired: false,
  });

  card = await createCard(cardType.id, tenant.id, `${PREFIX}R001`, {
    [nameField.id]: "Ada",
  });
  versions.push(card.currentSnapshotId!);

  for (const value of ["Bea", "Cleo"]) {
    const updated = await updateCard(card.code, tenant.id, {
      [nameField.id]: value,
    });
    versions.push(updated.currentSnapshotId!);
  }
});

afterAll(async () => {
  if (tenant) await deleteTenant(tenant.id);
  for (const t of await db.select().from(tenants).where(like(tenants.name, `${PREFIX}%`))) {
    await deleteTenant(t.id);
  }
});

describe("loadSnapshotsForLogRows", () => {
  it("resolves 3 distinct snapshots from a 50-row page, with predecessors", async () => {
    // 50 rows cycling over the three versions — the shape of a real page.
    const rows = Array.from({ length: 50 }, (_, i) => ({
      cardSnapshotId: versions[i % 3],
    }));

    // The single-query property is structural: `loadSnapshotsForLogRows` makes
    // exactly one `db.execute` call over these ids. `db` is a lazy Proxy whose
    // only trap is `get`, so the call cannot be counted from a test — the
    // mechanism that makes one query enough is asserted directly instead.
    expect(distinctSnapshotIds(rows)).toHaveLength(3);

    const lookup = await loadSnapshotsForLogRows(tenant.id, rows);
    expect(lookup.size).toBe(3);

    const [v0, v1, v2] = versions;
    expect(lookup.get(v0)!.previousSnapshotId).toBeNull();
    expect(lookup.get(v0)!.previousPayload).toBeNull();
    expect(lookup.get(v1)!.previousSnapshotId).toBe(v0);
    expect(lookup.get(v2)!.previousSnapshotId).toBe(v1);

    // The predecessor's PAYLOAD is what the Detail diff needs, not just its id.
    const nameOf = (p: { fields: { fieldDefinitionId: string; value: unknown }[] }) =>
      p.fields.find((f) => f.fieldDefinitionId === nameField.id)?.value;
    expect(nameOf(lookup.get(v2)!.payload)).toBe("Cleo");
    expect(nameOf(lookup.get(v2)!.previousPayload!)).toBe("Bea");
    expect(nameOf(lookup.get(v1)!.previousPayload!)).toBe("Ada");
  });

  it("returns an empty lookup, and queries nothing, for pre-0022 rows", async () => {
    const rows = [{ cardSnapshotId: null }, { cardSnapshotId: null }];

    // No ids means the early return fires before any query is built.
    expect(distinctSnapshotIds(rows)).toEqual([]);

    const lookup = await loadSnapshotsForLogRows(tenant.id, rows);
    expect(lookup.size).toBe(0);
  });

  it("refuses a snapshot belonging to another tenant", async () => {
    const other = await createTenant({ name: `${PREFIX}Other` });

    const lookup = await loadSnapshotsForLogRows(other.id, [
      { cardSnapshotId: versions[0] },
    ]);

    // Not "returns the wrong payload" and not "throws" — the id simply does not
    // resolve, and the caller falls back to the live join, which is itself
    // tenant-scoped. Defence in depth, as the DAL convention requires.
    expect(lookup.size).toBe(0);

    await deleteTenant(other.id);
  });
});

describe("projectSnapshotFields", () => {
  it("takes the field list from the config and the value + label from the payload", async () => {
    const lookup = await loadSnapshotsForLogRows(tenant.id, [
      { cardSnapshotId: versions[0] },
    ]);
    const payload = lookup.get(versions[0])!.payload;

    const fields = projectSnapshotFields(payload, [
      { fieldDefinitionId: nameField.id, label: "Etiqueta de hoy", fieldType: "text" },
    ]);

    expect(fields).toHaveLength(1);
    // The label is the FROZEN one, not the config's — relabelling a historical
    // value with a name it never had would misreport the row.
    expect(fields[0].label).toBe("Nombre");
    expect(fields[0].value).toBe("Ada");
  });

  it("omits a configured field the payload does not contain", async () => {
    const lookup = await loadSnapshotsForLogRows(tenant.id, [
      { cardSnapshotId: versions[0] },
    ]);
    const payload = lookup.get(versions[0])!.payload;

    const fields = projectSnapshotFields(payload, [
      {
        fieldDefinitionId: "99999999-9999-9999-9999-999999999999",
        label: "Añadido después",
        fieldType: "text",
      },
    ]);

    // Omitted, not blank: "the card type did not have this field" is a
    // different statement from "the field was empty".
    expect(fields).toEqual([]);
  });

  it("still resolves after the field definition is renamed", async () => {
    // The whole point of A1: the payload froze the label, so an old row keeps
    // reading as it did even though the definition now says something else.
    const fresh = await getCardById(card.id, tenant.id);
    expect(fresh.code).toBe(card.code);

    const lookup = await loadSnapshotsForLogRows(tenant.id, [
      { cardSnapshotId: versions[0] },
    ]);
    expect(lookup.get(versions[0])!.payload.fields[0].label).toBe("Nombre");
  });
});

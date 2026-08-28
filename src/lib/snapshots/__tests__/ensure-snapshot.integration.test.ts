/**
 * `ensureCardSnapshot` against a real Postgres.
 *
 * The deduplication rule and the chain it maintains are properties of one SQL
 * statement, so they can only be verified here — a mocked DB would just be
 * restating the query back to itself.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { asc, eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, cards, cardSnapshots } from "@/lib/db/schema";
import { createTenant, deleteTenant } from "@/lib/dal/tenants";
import { createCardType } from "@/lib/dal/card-types";
import { addFieldDefinition } from "@/lib/dal/field-definitions";
import { createCard } from "@/lib/dal/cards";
import { NotFoundError } from "@/lib/dal/errors";
import { ensureCardSnapshot } from "../ensure-snapshot";
import { buildCardSnapshotPayload, type CardSnapshotPayload } from "../payload";
import { loadCardSnapshotSource } from "../source";
import type { Tenant, CardType, CardWithFields, FieldDefinition } from "@/lib/dal/types";

// Disjoint from every other test file's prefix — the integration project shares
// one database and each file cleans up by prefix.
const PREFIX = "__test_snapshot_";

let tenant: Tenant;
let cardType: CardType;
let nameField: FieldDefinition;
let card: CardWithFields;

beforeAll(async () => {
  tenant = await createTenant({ name: `${PREFIX}T` });
  cardType = await createCardType(tenant.id, { name: `${PREFIX}Residente` });
  nameField = await addFieldDefinition(cardType.id, {
    name: "nombre",
    label: "Nombre",
    fieldType: "text",
    isRequired: false,
  });
  card = await createCard(cardType.id, tenant.id, `${PREFIX}S001`, {
    [nameField.id]: "Ada",
  });

  // `createCard` now takes a V0 of its own. Strip it, so this file exercises
  // the case that has no other coverage: a card that PREDATES migration 0022
  // and must bootstrap lazily on its first scan or edit. That is what every
  // existing card in every existing tenant looks like on the day this ships.
  await db.update(cards).set({ currentSnapshotId: null }).where(eq(cards.id, card.id));
  await db.delete(cardSnapshots).where(eq(cardSnapshots.cardId, card.id));
});

afterAll(async () => {
  if (tenant) await deleteTenant(tenant.id);
  for (const t of await db.select().from(tenants).where(like(tenants.name, `${PREFIX}%`))) {
    await deleteTenant(t.id);
  }
});

/** Snapshots of a card, oldest first. */
async function snapshotsOf(cardId: string) {
  return db
    .select()
    .from(cardSnapshots)
    .where(eq(cardSnapshots.cardId, cardId))
    .orderBy(asc(cardSnapshots.createdAt));
}

async function currentSnapshotId(cardId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: cards.currentSnapshotId })
    .from(cards)
    .where(eq(cards.id, cardId));
  return row?.id ?? null;
}

/** The payload the card's current state produces. */
async function payloadFor(cardId: string): Promise<CardSnapshotPayload> {
  const source = await loadCardSnapshotSource(tenant.id, cardId);
  if (!source) throw new Error("card not found");
  return buildCardSnapshotPayload(source);
}

describe("ensureCardSnapshot", () => {
  it("bootstraps V0 for a pre-0022 card that has never been snapshotted", async () => {
    expect(await currentSnapshotId(card.id)).toBeNull();

    const payload = await payloadFor(card.id);
    const first = await ensureCardSnapshot({
      tenantId: tenant.id,
      cardId: card.id,
      payload,
    });

    expect(first.created).toBe(true);
    expect(await currentSnapshotId(card.id)).toBe(first.snapshotId);

    const rows = await snapshotsOf(card.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].previousSnapshotId).toBeNull();
    expect(rows[0].tenantId).toBe(tenant.id);
  });

  it("inserts nothing and returns the same id when the payload is unchanged", async () => {
    const payload = await payloadFor(card.id);
    const before = await currentSnapshotId(card.id);

    const again = await ensureCardSnapshot({
      tenantId: tenant.id,
      cardId: card.id,
      payload,
    });

    expect(again.created).toBe(false);
    expect(again.snapshotId).toBe(before);
    expect(await snapshotsOf(card.id)).toHaveLength(1);
  });

  it("is idempotent across repeated calls, not just the second one", async () => {
    const payload = await payloadFor(card.id);
    for (let i = 0; i < 3; i++) {
      const r = await ensureCardSnapshot({ tenantId: tenant.id, cardId: card.id, payload });
      expect(r.created).toBe(false);
    }
    expect(await snapshotsOf(card.id)).toHaveLength(1);
  });

  it("chains a changed payload onto the previous snapshot", async () => {
    const [v0] = await snapshotsOf(card.id);

    const changed = buildCardSnapshotPayload({
      ...(await loadCardSnapshotSource(tenant.id, card.id))!,
      fields: [
        {
          fieldDefinitionId: nameField.id,
          name: "nombre",
          label: "Nombre",
          type: "text",
          isSystem: false,
          value: "Grace",
        },
      ],
    });

    const second = await ensureCardSnapshot({
      tenantId: tenant.id,
      cardId: card.id,
      payload: changed,
    });

    expect(second.created).toBe(true);
    expect(second.snapshotId).not.toBe(v0.id);

    const rows = await snapshotsOf(card.id);
    expect(rows).toHaveLength(2);
    expect(rows[1].id).toBe(second.snapshotId);
    expect(rows[1].previousSnapshotId).toBe(v0.id);
    expect(await currentSnapshotId(card.id)).toBe(second.snapshotId);
  });

  it("creates a NEW snapshot when a card returns to an earlier state", async () => {
    // Deduplication compares against the CURRENT snapshot only. Pointing back
    // at the identical older row would fork `previous_snapshot_id`, and that
    // chain is what the A2 diff walks.
    const v0Payload = await payloadFor(card.id);
    const backToAda = buildCardSnapshotPayload({
      ...v0Payload,
      fields: v0Payload.fields.map((f) => ({
        fieldDefinitionId: f.fieldDefinitionId,
        name: f.name,
        label: f.label,
        type: f.type,
        isSystem: f.isSystem,
        value: "Ada",
      })),
    });

    const third = await ensureCardSnapshot({
      tenantId: tenant.id,
      cardId: card.id,
      payload: backToAda,
    });

    expect(third.created).toBe(true);

    const rows = await snapshotsOf(card.id);
    expect(rows).toHaveLength(3);
    // Same content as V0, but a distinct row with its own place in the chain.
    expect(rows[2].contentHash).toBe(rows[0].contentHash);
    expect(rows[2].id).not.toBe(rows[0].id);
    expect(rows[2].previousSnapshotId).toBe(rows[1].id);
  });

  it("refuses a card belonging to another tenant", async () => {
    const other = await createTenant({ name: `${PREFIX}Other` });
    const payload = await payloadFor(card.id);

    await expect(
      ensureCardSnapshot({ tenantId: other.id, cardId: card.id, payload }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // And it wrote nothing.
    expect(await snapshotsOf(card.id)).toHaveLength(3);
    await deleteTenant(other.id);
  });
});

describe("loadCardSnapshotSource", () => {
  it("includes a field the card has no value for, as null", async () => {
    const extra = await addFieldDefinition(cardType.id, {
      name: "saldo",
      label: "Saldo",
      fieldType: "number",
      isRequired: false,
    });

    const source = await loadCardSnapshotSource(tenant.id, card.id);
    const field = source!.fields.find((f) => f.fieldDefinitionId === extra.id);

    expect(field).toBeDefined();
    expect(field!.value).toBeNull();
    expect(buildCardSnapshotPayload(source!).fields.find((f) => f.fieldDefinitionId === extra.id)!
      .value).toBeNull();
  });

  it("carries the card code and card type name", async () => {
    const source = await loadCardSnapshotSource(tenant.id, card.id);
    expect(source!.code).toBe(`${PREFIX}S001`);
    expect(source!.cardTypeName).toBe(`${PREFIX}Residente`);
  });

  it("returns null for a card outside the tenant", async () => {
    const other = await createTenant({ name: `${PREFIX}Other2` });
    expect(await loadCardSnapshotSource(other.id, card.id)).toBeNull();
    await deleteTenant(other.id);
  });
});

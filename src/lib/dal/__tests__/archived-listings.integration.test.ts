/**
 * Integration tests for the phase-4 trash listings.
 *
 * `listArchivedCards` and `listArchivedCardTypes` are pure SQL (scope + joins +
 * a grouped count), so they run against the real Dockerized Postgres, like the
 * other lifecycle tests.
 *
 * Covered:
 *  1. listArchivedCards returns only archived cards of the tenant, newest first,
 *     resolving the archiver's name and the archived-via-type flag.
 *  2. listArchivedCardTypes returns only archived types with the cascade card
 *     count and the archiver's name.
 *  3. Neither leaks live rows nor another tenant's rows.
 *
 * WARNING: creates and deletes real data, prefixed `__test_archlist_`.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { config } from "dotenv";

// Load env before any import that touches DATABASE_URL (see lifecycle test).
config({ path: ".env.test.local" });
config({ path: ".env.local" });

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DB_DRIVER = "local";
}

import { eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, cardTypes, cards, user } from "@/lib/db/schema";
import { createTenant } from "@/lib/dal/tenants";
import { createCardType, listArchivedCardTypes } from "@/lib/dal/card-types";
import { createCard, listArchivedCards } from "@/lib/dal/cards";
import { archiveCard, archiveCardType } from "@/lib/server/lifecycle";
import type { Tenant } from "@/lib/dal/types";
import type { LifecycleActor } from "@/lib/server/lifecycle/cards";

const PREFIX = "__test_archlist_";
const USER_ID = `${PREFIX}user`;
const USER_NAME = "Archive Lister";

let tenant: Tenant;
let actor: LifecycleActor;

async function makeType(name: string) {
  return createCardType(tenant.id, { name: `${PREFIX}${name}` });
}
async function makeCard(typeId: string, code: string) {
  return createCard(typeId, tenant.id, `${PREFIX}${code}`, {});
}

beforeAll(async () => {
  await db
    .insert(user)
    .values({
      id: USER_ID,
      name: USER_NAME,
      email: `${PREFIX}user@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  tenant = await createTenant({ name: `${PREFIX}Tenant` });
  actor = { userId: USER_ID, tenantId: tenant.id };
});

beforeEach(async () => {
  await db.delete(cards).where(eq(cards.tenantId, tenant.id));
  await db.delete(cardTypes).where(eq(cardTypes.tenantId, tenant.id));
});

afterAll(async () => {
  await db.delete(tenants).where(like(tenants.name, `${PREFIX}%`));
  await db.delete(user).where(eq(user.id, USER_ID));
});

// ─── Cards ────────────────────────────────────────────────────────────────────

describe("listArchivedCards", () => {
  it("returns only archived cards, resolving type name and archiver", async () => {
    const type = await makeType("T");
    const archived = await makeCard(type.id, "A1");
    await makeCard(type.id, "LIVE"); // active — must not appear
    await archiveCard(archived.id, actor);

    const rows = await listArchivedCards(tenant.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe(`${PREFIX}A1`);
    expect(rows[0].cardTypeName).toBe(`${PREFIX}T`);
    expect(rows[0].archivedByName).toBe(USER_NAME);
    expect(rows[0].archivedViaType).toBe(false);
  });

  it("flags cards dragged in by a card type cascade", async () => {
    const type = await makeType("Casc");
    await makeCard(type.id, "CV1");
    await archiveCardType(type.id, actor); // cascades the card

    const rows = await listArchivedCards(tenant.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe(`${PREFIX}CV1`);
    expect(rows[0].archivedViaType).toBe(true);
  });

  it("orders by archive time, most recent first", async () => {
    const type = await makeType("Ord");
    const first = await makeCard(type.id, "OLD");
    const second = await makeCard(type.id, "NEW");
    await archiveCard(first.id, actor);
    await archiveCard(second.id, actor);

    // Pin distinct archive times so ordering is deterministic.
    await db
      .update(cards)
      .set({ archivedAt: new Date("2026-01-01T00:00:00Z") })
      .where(eq(cards.id, first.id));
    await db
      .update(cards)
      .set({ archivedAt: new Date("2026-02-01T00:00:00Z") })
      .where(eq(cards.id, second.id));

    const rows = await listArchivedCards(tenant.id);

    expect(rows.map((r) => r.code)).toEqual([`${PREFIX}NEW`, `${PREFIX}OLD`]);
  });

  it("does not leak another tenant's archived cards", async () => {
    const type = await makeType("Mine");
    const mine = await makeCard(type.id, "M1");
    await archiveCard(mine.id, actor);

    const other = await createTenant({ name: `${PREFIX}Other` });
    const otherType = await createCardType(other.id, { name: `${PREFIX}OtherT` });
    const otherCard = await createCard(otherType.id, other.id, `${PREFIX}O1`, {});
    await archiveCard(otherCard.id, { userId: USER_ID, tenantId: other.id });

    const rows = await listArchivedCards(tenant.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe(`${PREFIX}M1`);
  });
});

// ─── Card types ───────────────────────────────────────────────────────────────

describe("listArchivedCardTypes", () => {
  it("returns only archived types with cascade count and archiver", async () => {
    const type = await makeType("Arch");
    await makeCard(type.id, "AT1");
    await makeCard(type.id, "AT2");
    await archiveCardType(type.id, actor);

    await makeType("Alive"); // active type — must not appear

    const rows = await listArchivedCardTypes(tenant.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe(`${PREFIX}Arch`);
    expect(rows[0].cardCount).toBe(2);
    expect(rows[0].archivedByName).toBe(USER_NAME);
  });

  it("reports zero cards for an archived type that had none", async () => {
    const type = await makeType("Empty");
    await archiveCardType(type.id, actor);

    const rows = await listArchivedCardTypes(tenant.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].cardCount).toBe(0);
  });

  it("does not leak another tenant's archived types", async () => {
    const mine = await makeType("MineT");
    await archiveCardType(mine.id, actor);

    const other = await createTenant({ name: `${PREFIX}OtherTt` });
    const otherType = await createCardType(other.id, { name: `${PREFIX}TheirT` });
    await archiveCardType(otherType.id, { userId: USER_ID, tenantId: other.id });

    const rows = await listArchivedCardTypes(tenant.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe(`${PREFIX}MineT`);
  });
});

/**
 * Integration tests for the phase-3 card search status filter and the live-card
 * count helper. Both are pure SQL, so they run against the real Dockerized
 * Postgres (same harness as the other lifecycle integration tests).
 *
 * Covered:
 *  1. searchCards status filter: `all` (default), `active`, `inactive`.
 *  2. `inactive` groups inactive + expired (they behave identically).
 *  3. archived cards never appear in search, regardless of status.
 *  4. countLiveCardsForCardType counts every non-archived card of the type.
 *
 * WARNING: creates and deletes real data, prefixed `__test_searchstatus_`.
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
import { tenants, cards, user } from "@/lib/db/schema";
import { createTenant } from "@/lib/dal/tenants";
import { createCardType } from "@/lib/dal/card-types";
import {
  createCard,
  searchCards,
  countLiveCardsForCardType,
} from "@/lib/dal/cards";
import { archiveCard } from "@/lib/server/lifecycle";
import type { Tenant, CardType, Card } from "@/lib/dal/types";

const PREFIX = "__test_searchstatus_";
const USER_ID = `${PREFIX}user`;

let tenant: Tenant;
let cardType: CardType;

/** Create a card and force a non-archived status directly. */
async function makeCard(code: string, status: Card["status"] = "active") {
  const card = await createCard(cardType.id, tenant.id, `${PREFIX}${code}`, {});
  if (status !== "active" && status !== "archived") {
    await db.update(cards).set({ status }).where(eq(cards.id, card.id));
  }
  return card;
}

beforeAll(async () => {
  await db
    .insert(user)
    .values({
      id: USER_ID,
      name: "Search Status Test",
      email: `${PREFIX}user@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  tenant = await createTenant({ name: `${PREFIX}Tenant` });
  cardType = await createCardType(tenant.id, { name: `${PREFIX}Type` });
});

beforeEach(async () => {
  await db.delete(cards).where(eq(cards.tenantId, tenant.id));
});

afterAll(async () => {
  await db.delete(tenants).where(like(tenants.name, `${PREFIX}%`));
  await db.delete(user).where(eq(user.id, USER_ID));
});

/** Seed the standard mix: 2 active, 1 inactive, 1 expired, 1 archived. */
async function seedMix() {
  await makeCard("A1", "active");
  await makeCard("A2", "active");
  await makeCard("I1", "inactive");
  await makeCard("E1", "expired");
  const toArchive = await makeCard("X1", "active");
  await archiveCard(toArchive.id, { userId: USER_ID, tenantId: tenant.id });
}

describe("searchCards status filter", () => {
  it("`all` returns every non-archived card (active + inactive + expired)", async () => {
    await seedMix();
    const res = await searchCards([cardType.id], tenant.id, { status: "all" });
    expect(res.total).toBe(4);
    expect(res.data.every((c) => c.status !== "archived")).toBe(true);
  });

  it("undefined status behaves like `all`", async () => {
    await seedMix();
    const res = await searchCards([cardType.id], tenant.id, {});
    expect(res.total).toBe(4);
  });

  it("`active` returns only active cards", async () => {
    await seedMix();
    const res = await searchCards([cardType.id], tenant.id, { status: "active" });
    expect(res.total).toBe(2);
    expect(res.data.every((c) => c.status === "active")).toBe(true);
  });

  it("`inactive` groups inactive + expired", async () => {
    await seedMix();
    const res = await searchCards([cardType.id], tenant.id, {
      status: "inactive",
    });
    expect(res.total).toBe(2);
    expect(
      res.data.every((c) => c.status === "inactive" || c.status === "expired"),
    ).toBe(true);
  });

  it("archived cards never appear, whatever the status filter", async () => {
    await seedMix();
    for (const status of ["all", "active", "inactive"] as const) {
      const res = await searchCards([cardType.id], tenant.id, { status });
      expect(res.data.some((c) => c.status === "archived")).toBe(false);
    }
  });
});

describe("countLiveCardsForCardType", () => {
  it("counts every non-archived card of the type", async () => {
    await seedMix();
    expect(await countLiveCardsForCardType(cardType.id, tenant.id)).toBe(4);
  });

  it("drops as cards are archived", async () => {
    const c = await makeCard("L1", "active");
    await makeCard("L2", "inactive");
    expect(await countLiveCardsForCardType(cardType.id, tenant.id)).toBe(2);

    await archiveCard(c.id, { userId: USER_ID, tenantId: tenant.id });
    expect(await countLiveCardsForCardType(cardType.id, tenant.id)).toBe(1);
  });

  it("is zero for a type with no live cards", async () => {
    expect(await countLiveCardsForCardType(cardType.id, tenant.id)).toBe(0);
  });
});

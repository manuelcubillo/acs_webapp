/**
 * Integration tests for the phase-5 retention purge — the daily job that
 * physically deletes archived rows once their per-tenant retention has elapsed.
 *
 * Runs against the Dockerized `acs_test` Postgres (same harness as the other
 * lifecycle tests): the whole point is the real DELETE + FK cascade + per-tenant
 * retention join, none of which a mock would exercise.
 *
 * Covered:
 *  1. Per-tenant retention is respected and tenants are isolated (a 10-day tenant
 *     purges what a 30-day tenant keeps for the same archive age).
 *  2. An expired archived card type cascades away its cards, field values and
 *     audit logs.
 *  3. Live rows and rows still within their window are never touched.
 *  4. Idempotence — a second run purges nothing.
 *  5. The per-tenant summary counts (types + cards, cascades included) are right.
 *  6. The cron endpoint: 401 without / with a wrong secret, 200 + summary with
 *     the right secret, and it actually runs the purge.
 *
 * WARNING: creates and deletes real data, prefixed `__test_purgeret_`.
 * `purgeExpiredArchivedRecords()` is global, but it only removes rows past
 * retention; the other test suites archive with a fresh `archived_at`, so their
 * rows are never in range here.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import { config } from "dotenv";

// Load env before any import that touches DATABASE_URL (see sibling tests).
config({ path: ".env.test.local" });
config({ path: ".env.local" });

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DB_DRIVER = "local";
}

// The endpoint reads CRON_SECRET at request time; fix it for the whole suite.
const CRON_SECRET = "test-cron-secret-123";
process.env.CRON_SECRET = CRON_SECRET;

import { NextRequest } from "next/server";
import { eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tenants,
  cardTypes,
  cards,
  fieldDefinitions,
  fieldValues,
  actionLogs,
  user,
} from "@/lib/db/schema";
import { createTenant } from "@/lib/dal/tenants";
import { createCardType } from "@/lib/dal/card-types";
import { createCard } from "@/lib/dal/cards";
import {
  archiveCard,
  archiveCardType,
  purgeExpiredArchivedRecords,
} from "@/lib/server/lifecycle";
import { GET as purgeEndpoint } from "@/app/api/cron/purge-archived/route";
import type { PurgeResult } from "../purge";
import type { LifecycleActor } from "../cards";

const PREFIX = "__test_purgeret_";
const USER_ID = `${PREFIX}user`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function actorFor(tenantId: string): LifecycleActor {
  return { userId: USER_ID, tenantId };
}

/** Create a tenant with an explicit retention window. */
async function makeTenant(name: string, retentionDays: number) {
  const tenant = await createTenant({ name: `${PREFIX}${name}` });
  await db
    .update(tenants)
    .set({ archiveRetentionDays: retentionDays })
    .where(eq(tenants.id, tenant.id));
  return tenant;
}

/** Create a card type with a single text field. */
async function makeType(tenantId: string, name: string) {
  return createCardType(tenantId, {
    name: `${PREFIX}${name}`,
    fieldDefinitions: [{ name: "note", label: "Note", fieldType: "text" }],
  });
}

/** Create a card carrying one field value (proves the value cascade). */
async function makeCard(tenantId: string, typeId: string, code: string) {
  const [fd] = await db
    .select({ id: fieldDefinitions.id })
    .from(fieldDefinitions)
    .where(eq(fieldDefinitions.cardTypeId, typeId));
  return createCard(typeId, tenantId, `${PREFIX}${code}`, { [fd.id]: "x" });
}

/** Backdate an individually-archived card's clock into the trash. */
async function backdateCard(cardId: string, n: number) {
  await db.update(cards).set({ archivedAt: daysAgo(n) }).where(eq(cards.id, cardId));
}

/**
 * Backdate an archived type AND its cascaded cards to the same instant — this is
 * the production-faithful state (archiveCardType stamps both with one `now()`).
 */
async function backdateTypeAndCards(typeId: string, n: number) {
  const when = daysAgo(n);
  await db.update(cardTypes).set({ archivedAt: when }).where(eq(cardTypes.id, typeId));
  await db.update(cards).set({ archivedAt: when }).where(eq(cards.cardTypeId, typeId));
}

async function cardExists(id: string) {
  return (
    (await db.select({ id: cards.id }).from(cards).where(eq(cards.id, id))).length === 1
  );
}
async function typeExists(id: string) {
  return (
    (await db.select({ id: cardTypes.id }).from(cardTypes).where(eq(cardTypes.id, id)))
      .length === 1
  );
}
async function countFieldValues(cardId: string) {
  return (
    await db
      .select({ cardId: fieldValues.cardId })
      .from(fieldValues)
      .where(eq(fieldValues.cardId, cardId))
  ).length;
}
async function countActionLogs(cardId: string) {
  return (
    await db
      .select({ cardId: actionLogs.cardId })
      .from(actionLogs)
      .where(eq(actionLogs.cardId, cardId))
  ).length;
}

/** Pull one tenant's line out of a purge summary. */
function summaryFor(result: PurgeResult, tenantId: string) {
  return result.tenants.find((t) => t.tenantId === tenantId);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await db
    .insert(user)
    .values({
      id: USER_ID,
      name: "Purge Retention Test",
      email: `${PREFIX}user@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
});

afterEach(async () => {
  // Wipe all rows created by this suite (cascades clear cards/types/logs).
  await db.delete(tenants).where(like(tenants.name, `${PREFIX}%`));
});

afterAll(async () => {
  await db.delete(tenants).where(like(tenants.name, `${PREFIX}%`));
  await db.delete(user).where(eq(user.id, USER_ID));
});

// ─── 1. Per-tenant retention + isolation ──────────────────────────────────────

describe("purgeExpiredArchivedRecords — retention & isolation", () => {
  it("purges only rows past their own tenant's retention, isolating tenants", async () => {
    // Tenant A keeps trash 10 days, tenant B keeps it 30.
    const tenantA = await makeTenant("A", 10);
    const tenantB = await makeTenant("B", 30);

    // Same archive age (20 days) in both tenants.
    const typeA = await makeType(tenantA.id, "TA");
    const overdueA = await makeCard(tenantA.id, typeA.id, "A-overdue");
    await archiveCard(overdueA.id, actorFor(tenantA.id));
    await backdateCard(overdueA.id, 20); // 20 > 10 → purge

    const freshA = await makeCard(tenantA.id, typeA.id, "A-fresh");
    await archiveCard(freshA.id, actorFor(tenantA.id));
    await backdateCard(freshA.id, 3); // 3 < 10 → keep

    const typeB = await makeType(tenantB.id, "TB");
    const survivorB = await makeCard(tenantB.id, typeB.id, "B-survivor");
    await archiveCard(survivorB.id, actorFor(tenantB.id));
    await backdateCard(survivorB.id, 20); // 20 < 30 → keep

    const result = await purgeExpiredArchivedRecords();

    expect(await cardExists(overdueA.id)).toBe(false); // A's overdue card gone
    expect(await cardExists(freshA.id)).toBe(true); // A's in-window card kept
    expect(await cardExists(survivorB.id)).toBe(true); // B's 20-day card kept (30-day window)

    expect(summaryFor(result, tenantA.id)?.deletedCards).toBe(1);
    expect(summaryFor(result, tenantB.id)).toBeUndefined(); // nothing purged for B
  });

  it("never touches a live (non-archived) card even if old", async () => {
    const tenant = await makeTenant("Live", 1);
    const type = await makeType(tenant.id, "T");
    const live = await makeCard(tenant.id, type.id, "live"); // active, no archived_at

    await purgeExpiredArchivedRecords();

    expect(await cardExists(live.id)).toBe(true);
  });
});

// ─── 2. Cascade from an expired archived type ─────────────────────────────────

describe("purgeExpiredArchivedRecords — cascade", () => {
  it("deletes an expired archived type and cascades cards, values + audit logs", async () => {
    const tenant = await makeTenant("Cascade", 30);
    const type = await makeType(tenant.id, "T");
    const a = await makeCard(tenant.id, type.id, "A");
    const b = await makeCard(tenant.id, type.id, "B");

    await archiveCardType(type.id, actorFor(tenant.id)); // cascades both + writes logs
    await backdateTypeAndCards(type.id, 45); // 45 > 30 → purge the whole type

    expect(await countFieldValues(a.id)).toBe(1);
    expect(await countActionLogs(a.id)).toBeGreaterThan(0);

    const result = await purgeExpiredArchivedRecords();

    expect(await typeExists(type.id)).toBe(false);
    expect(await cardExists(a.id)).toBe(false);
    expect(await cardExists(b.id)).toBe(false);
    expect(await countFieldValues(a.id)).toBe(0);
    expect(await countActionLogs(a.id)).toBe(0);

    const line = summaryFor(result, tenant.id);
    expect(line?.deletedCardTypes).toBe(1);
    expect(line?.deletedCards).toBe(2); // both cascaded cards counted
  });

  it("keeps an archived type still within its window", async () => {
    const tenant = await makeTenant("Kept", 30);
    const type = await makeType(tenant.id, "T");
    const card = await makeCard(tenant.id, type.id, "C");

    await archiveCardType(type.id, actorFor(tenant.id));
    await backdateTypeAndCards(type.id, 10); // 10 < 30 → keep

    const result = await purgeExpiredArchivedRecords();

    expect(await typeExists(type.id)).toBe(true);
    expect(await cardExists(card.id)).toBe(true);
    expect(summaryFor(result, tenant.id)).toBeUndefined();
  });
});

// ─── 3. Idempotence ───────────────────────────────────────────────────────────

describe("purgeExpiredArchivedRecords — idempotence", () => {
  it("purges nothing on a second run", async () => {
    const tenant = await makeTenant("Idem", 5);
    const type = await makeType(tenant.id, "T");
    const card = await makeCard(tenant.id, type.id, "C");
    await archiveCard(card.id, actorFor(tenant.id));
    await backdateCard(card.id, 30);

    const first = await purgeExpiredArchivedRecords();
    expect(summaryFor(first, tenant.id)?.deletedCards).toBe(1);

    const second = await purgeExpiredArchivedRecords();
    expect(summaryFor(second, tenant.id)).toBeUndefined();
    expect(await cardExists(card.id)).toBe(false);
  });
});

// ─── 4. Cron endpoint ─────────────────────────────────────────────────────────

describe("GET /api/cron/purge-archived", () => {
  function request(authHeader?: string) {
    return new NextRequest("http://localhost/api/cron/purge-archived", {
      headers: authHeader ? { authorization: authHeader } : {},
    });
  }

  it("returns 401 without an Authorization header", async () => {
    const res = await purgeEndpoint(request());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 401 with a wrong secret", async () => {
    const res = await purgeEndpoint(request("Bearer wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 200 + summary and runs the purge with the right secret", async () => {
    const tenant = await makeTenant("Endpoint", 7);
    const type = await makeType(tenant.id, "T");
    const card = await makeCard(tenant.id, type.id, "C");
    await archiveCard(card.id, actorFor(tenant.id));
    await backdateCard(card.id, 30); // overdue → must be purged by the call

    const res = await purgeEndpoint(request(`Bearer ${CRON_SECRET}`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.deletedCards).toBe("number");
    expect(typeof body.data.deletedCardTypes).toBe("number");
    expect(await cardExists(card.id)).toBe(false); // the endpoint really purged it
  });
});

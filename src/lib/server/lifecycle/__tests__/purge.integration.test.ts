/**
 * Integration tests for the phase-4 hard-delete (purge) primitive.
 *
 * The whole point of these functions is the physical DELETE and its FK cascade,
 * so they must run against a real Postgres (the Dockerized `acs_test`, same
 * harness as the other lifecycle tests). Mocking would test nothing real.
 *
 * Covered:
 *  1. hardDeleteArchivedCard removes the card AND cascades its field values and
 *     lifecycle audit rows; refuses live rows, other tenants; is idempotent.
 *  2. hardDeleteArchivedCardType removes the type AND cascades every card, field
 *     definition, field value and audit row; refuses live rows / other tenants.
 *  3. hardDeleteAllArchived empties the trash (archived types + their cascade +
 *     individually-archived cards) while leaving live rows, and reports counts.
 *
 * WARNING: creates and deletes real data, prefixed `__test_purge_`.
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
import {
  tenants,
  cardTypes,
  cards,
  fieldValues,
  fieldDefinitions,
  actionLogs,
  user,
} from "@/lib/db/schema";
import { createTenant } from "@/lib/dal/tenants";
import { createCardType } from "@/lib/dal/card-types";
import { createCard } from "@/lib/dal/cards";
import { archiveCard, archiveCardType } from "@/lib/server/lifecycle";
import {
  hardDeleteArchivedCard,
  hardDeleteArchivedCardType,
  hardDeleteAllArchived,
} from "../purge";
import type { Tenant } from "@/lib/dal/types";
import type { LifecycleActor } from "../cards";

const PREFIX = "__test_purge_";
const USER_ID = `${PREFIX}user`;

let tenant: Tenant;
let actor: LifecycleActor;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a card type with a single text field, returning its id + field id. */
async function makeType(name: string) {
  const type = await createCardType(tenant.id, {
    name: `${PREFIX}${name}`,
    fieldDefinitions: [{ name: "note", label: "Note", fieldType: "text" }],
  });
  return type;
}

/**
 * Create a card carrying one field value (so a field_values row exists to prove
 * the cascade). The value map is keyed by field definition ID, so resolve the
 * type's "note" field first.
 */
async function makeCard(typeId: string, code: string) {
  const [fd] = await db
    .select({ id: fieldDefinitions.id })
    .from(fieldDefinitions)
    .where(eq(fieldDefinitions.cardTypeId, typeId));
  return createCard(typeId, tenant.id, `${PREFIX}${code}`, { [fd.id]: "x" });
}

async function countCard(id: string) {
  return (await db.select({ id: cards.id }).from(cards).where(eq(cards.id, id)))
    .length;
}
async function countType(id: string) {
  return (
    await db.select({ id: cardTypes.id }).from(cardTypes).where(eq(cardTypes.id, id))
  ).length;
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
async function countFieldDefs(typeId: string) {
  return (
    await db
      .select({ cardTypeId: fieldDefinitions.cardTypeId })
      .from(fieldDefinitions)
      .where(eq(fieldDefinitions.cardTypeId, typeId))
  ).length;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await db
    .insert(user)
    .values({
      id: USER_ID,
      name: "Purge Test",
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
  // Fresh slate: deleting the types cascades their cards + schema away.
  await db.delete(cards).where(eq(cards.tenantId, tenant.id));
  await db.delete(cardTypes).where(eq(cardTypes.tenantId, tenant.id));
});

afterAll(async () => {
  await db.delete(tenants).where(like(tenants.name, `${PREFIX}%`));
  await db.delete(user).where(eq(user.id, USER_ID));
});

// ─── 1. Card purge ────────────────────────────────────────────────────────────

describe("hardDeleteArchivedCard", () => {
  it("deletes an archived card and cascades its field values + audit rows", async () => {
    const type = await makeType("T");
    const card = await makeCard(type.id, "C1");
    await archiveCard(card.id, actor); // writes a lifecycle action_log row

    expect(await countFieldValues(card.id)).toBe(1);
    expect(await countActionLogs(card.id)).toBeGreaterThan(0);

    const removed = await hardDeleteArchivedCard(card.id, tenant.id);

    expect(removed).toBe(1);
    expect(await countCard(card.id)).toBe(0);
    expect(await countFieldValues(card.id)).toBe(0);
    expect(await countActionLogs(card.id)).toBe(0);
  });

  it("refuses a live (non-archived) card and leaves it intact", async () => {
    const type = await makeType("T");
    const card = await makeCard(type.id, "C2"); // active, not archived

    const removed = await hardDeleteArchivedCard(card.id, tenant.id);

    expect(removed).toBe(0);
    expect(await countCard(card.id)).toBe(1);
  });

  it("refuses a card belonging to another tenant", async () => {
    const type = await makeType("T");
    const card = await makeCard(type.id, "C3");
    await archiveCard(card.id, actor);

    const other = await createTenant({ name: `${PREFIX}Other` });
    const removed = await hardDeleteArchivedCard(card.id, other.id);

    expect(removed).toBe(0);
    expect(await countCard(card.id)).toBe(1);
  });

  it("is idempotent — a second delete removes nothing", async () => {
    const type = await makeType("T");
    const card = await makeCard(type.id, "C4");
    await archiveCard(card.id, actor);

    expect(await hardDeleteArchivedCard(card.id, tenant.id)).toBe(1);
    expect(await hardDeleteArchivedCard(card.id, tenant.id)).toBe(0);
  });
});

// ─── 2. Card type purge ───────────────────────────────────────────────────────

describe("hardDeleteArchivedCardType", () => {
  it("deletes an archived type and cascades cards, field defs, values + audit", async () => {
    const type = await makeType("Cascade");
    const a = await makeCard(type.id, "A");
    const b = await makeCard(type.id, "B");
    await archiveCardType(type.id, actor); // cascades both cards + writes logs

    expect(await countFieldDefs(type.id)).toBe(1);
    expect(await countFieldValues(a.id)).toBe(1);
    expect(await countActionLogs(a.id)).toBeGreaterThan(0);

    const removed = await hardDeleteArchivedCardType(type.id, tenant.id);

    expect(removed).toBe(1);
    expect(await countType(type.id)).toBe(0);
    expect(await countCard(a.id)).toBe(0);
    expect(await countCard(b.id)).toBe(0);
    expect(await countFieldDefs(type.id)).toBe(0);
    expect(await countFieldValues(a.id)).toBe(0);
    expect(await countActionLogs(a.id)).toBe(0);
  });

  it("refuses a live (non-archived) type and leaves its cards intact", async () => {
    const type = await makeType("Live");
    const card = await makeCard(type.id, "L1");

    const removed = await hardDeleteArchivedCardType(type.id, tenant.id);

    expect(removed).toBe(0);
    expect(await countType(type.id)).toBe(1);
    expect(await countCard(card.id)).toBe(1);
  });

  it("refuses a type belonging to another tenant", async () => {
    const type = await makeType("Foreign");
    await archiveCardType(type.id, actor);

    const other = await createTenant({ name: `${PREFIX}Other2` });
    const removed = await hardDeleteArchivedCardType(type.id, other.id);

    expect(removed).toBe(0);
    expect(await countType(type.id)).toBe(1);
  });
});

// ─── 3. Empty trash ───────────────────────────────────────────────────────────

describe("hardDeleteAllArchived", () => {
  it("removes every archived type + card, keeps live rows, and reports counts", async () => {
    // Archived type dragging two cards.
    const archivedType = await makeType("Arch");
    await makeCard(archivedType.id, "AT1");
    await makeCard(archivedType.id, "AT2");
    await archiveCardType(archivedType.id, actor);

    // Live type with one individually-archived card and one active card.
    const liveType = await makeType("Kept");
    const individually = await makeCard(liveType.id, "IND");
    await archiveCard(individually.id, actor);
    const stillActive = await makeCard(liveType.id, "ACT");

    const result = await hardDeleteAllArchived(tenant.id);

    // 1 archived type, 3 archived cards total (2 cascaded + 1 individual).
    expect(result.deletedCardTypes).toBe(1);
    expect(result.deletedCards).toBe(3);

    // Everything archived is gone…
    expect(await countType(archivedType.id)).toBe(0);
    expect(await countCard(individually.id)).toBe(0);

    // …and the live type + its active card are untouched.
    expect(await countType(liveType.id)).toBe(1);
    expect(await countCard(stillActive.id)).toBe(1);
  });

  it("is a no-op on an empty trash", async () => {
    const type = await makeType("Empty");
    await makeCard(type.id, "E1"); // active only, nothing archived

    const result = await hardDeleteAllArchived(tenant.id);

    expect(result).toEqual({ deletedCardTypes: 0, deletedCards: 0 });
    expect(await countType(type.id)).toBe(1);
  });
});

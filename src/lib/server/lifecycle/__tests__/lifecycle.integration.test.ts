/**
 * Integration tests for the card / card type lifecycle.
 *
 * These run against a real Postgres (using .env.local, same as
 * `src/lib/dal/__tests__/critical-rules.integration.test.ts`) because the
 * behaviour under test lives in SQL: the cascade CTE, the CHECK constraints and
 * the trash metadata. Mocking the database would test nothing real.
 *
 * Covered:
 *  1. Every card transition, including expired behaving as inactive.
 *  2. Invalid transitions.
 *  3. Card type archive cascade + selective restore via archived_via_type_id.
 *  4. Restoring a card whose type is still archived is blocked.
 *  5. getEffectiveRetentionDays.
 *  6. Management lists exclude archived and keep inactive.
 *  7. The scan lookup path still sees archived cards (phase 2 must deny them
 *     explicitly, not lose them).
 *  8. Audit rows are written for every transition, including the cascade.
 *
 * WARNING: creates and deletes real data, prefixed `__test_lifecycle_`.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { config } from "dotenv";

// Load env before any import that touches DATABASE_URL.
// TEST_DATABASE_URL points these tests at the Dockerized Postgres
// (`docker compose --profile db up`) instead of the shared Neon dev branch, so a
// failed run cannot leave debris on a database other people are using.
// Falls back to .env.local to match the pre-existing integration test.
config({ path: ".env.test.local" });
config({ path: ".env.local" });

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DB_DRIVER = "local";
}

import { eq, and, like, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, cardTypes, cards, actionLogs, user } from "@/lib/db/schema";
import { createTenant } from "@/lib/dal/tenants";
import { createCardType, listCardTypes } from "@/lib/dal/card-types";
import { createCard, listCards, searchCards, getCardByCode } from "@/lib/dal/cards";
import { ValidationError, ForbiddenOperationError } from "@/lib/dal/errors";
import type { Tenant, CardType, Card } from "@/lib/dal/types";

import {
  activateCard,
  deactivateCard,
  archiveCard,
  restoreCard,
} from "../cards";
import {
  activateCardType,
  deactivateCardType,
  archiveCardType,
  restoreCardType,
} from "../card-types";
import { getEffectiveRetentionDays } from "../retention";
import type { LifecycleActor } from "../cards";

const PREFIX = "__test_lifecycle_";
const USER_ID = `${PREFIX}user`;

let tenant: Tenant;
let cardType: CardType;
let actor: LifecycleActor;

/** Re-read a card straight from the DB. */
async function readCard(id: string): Promise<Card> {
  const [row] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
  return row;
}

/** Lifecycle audit rows for a card. */
async function lifecycleLogs(cardId: string) {
  return db
    .select()
    .from(actionLogs)
    .where(
      and(eq(actionLogs.cardId, cardId), eq(actionLogs.logType, "lifecycle")),
    );
}

/** Create a card and force it into a given status directly (bypassing the service). */
async function makeCard(code: string, status: Card["status"] = "active") {
  const card = await createCard(cardType.id, tenant.id, `${PREFIX}${code}`, {});
  if (status !== "active") {
    await db.update(cards).set({ status }).where(eq(cards.id, card.id));
  }
  return readCard(card.id);
}

beforeAll(async () => {
  await db
    .insert(user)
    .values({
      id: USER_ID,
      name: "Lifecycle Test",
      email: `${PREFIX}user@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  tenant = await createTenant({ name: `${PREFIX}Tenant` });
  actor = { userId: USER_ID, tenantId: tenant.id };
  cardType = await createCardType(tenant.id, { name: `${PREFIX}Type` });
});

afterEachCleanup();
function afterEachCleanup() {
  beforeEach(async () => {
    // Each test starts from a clean slate of cards, and an active type.
    await db.delete(cards).where(eq(cards.tenantId, tenant.id));
    await db
      .update(cardTypes)
      .set({
        status: "active",
        archivedAt: null,
        archivedBy: null,
        statusBeforeArchive: null,
      })
      .where(eq(cardTypes.id, cardType.id));
  });
}

afterAll(async () => {
  await db.delete(tenants).where(like(tenants.name, `${PREFIX}%`));
  await db.delete(user).where(eq(user.id, USER_ID));
});

// ─── 1 + 2. Card transitions ─────────────────────────────────────────────────

describe("card transitions", () => {
  it("deactivates an active card", async () => {
    const c = await makeCard("C1", "active");
    const out = await deactivateCard(c.id, actor);
    expect(out.status).toBe("inactive");
    expect(out.archivedAt).toBeNull();
  });

  it("activates an inactive card", async () => {
    const c = await makeCard("C2", "inactive");
    expect((await activateCard(c.id, actor)).status).toBe("active");
  });

  it("activates an expired card — expired behaves as inactive", async () => {
    const c = await makeCard("C3", "expired");
    expect((await activateCard(c.id, actor)).status).toBe("active");
  });

  it("archives an active card and records the trash metadata", async () => {
    const c = await makeCard("C4", "active");
    const out = await archiveCard(c.id, actor);

    expect(out.status).toBe("archived");
    expect(out.statusBeforeArchive).toBe("active");
    expect(out.archivedBy).toBe(USER_ID);
    expect(out.archivedAt).toBeInstanceOf(Date);
    // Archived on its own — a type restore must not revive it.
    expect(out.archivedViaTypeId).toBeNull();
  });

  it("archives an expired card, preserving expired as the restore target", async () => {
    const c = await makeCard("C5", "expired");
    const archived = await archiveCard(c.id, actor);
    expect(archived.statusBeforeArchive).toBe("expired");

    const restored = await restoreCard(c.id, actor);
    expect(restored.status).toBe("expired");
    expect(restored.archivedAt).toBeNull();
    expect(restored.statusBeforeArchive).toBeNull();
  });

  it("restores an archived card to its previous status", async () => {
    const c = await makeCard("C6", "inactive");
    await archiveCard(c.id, actor);
    expect((await restoreCard(c.id, actor)).status).toBe("inactive");
  });

  it("rejects archiving an already archived card", async () => {
    const c = await makeCard("C7", "active");
    await archiveCard(c.id, actor);
    await expect(archiveCard(c.id, actor)).rejects.toThrow(ValidationError);
  });

  it("rejects activating an already active card", async () => {
    const c = await makeCard("C8", "active");
    await expect(activateCard(c.id, actor)).rejects.toThrow(ValidationError);
  });

  it("rejects deactivating an already inactive card", async () => {
    const c = await makeCard("C9", "inactive");
    await expect(deactivateCard(c.id, actor)).rejects.toThrow(ValidationError);
  });

  it("rejects restoring a card that is not archived", async () => {
    const c = await makeCard("C10", "active");
    await expect(restoreCard(c.id, actor)).rejects.toThrow(ValidationError);
  });

  it("refuses to touch a card from another tenant", async () => {
    const other = await createTenant({ name: `${PREFIX}Other` });
    const c = await makeCard("C11", "active");
    await expect(
      archiveCard(c.id, { userId: USER_ID, tenantId: other.id }),
    ).rejects.toThrow(/not found/i);
  });
});

// ─── 3. Card type cascade ────────────────────────────────────────────────────

describe("card type archive cascade", () => {
  it("archives the type and all its live cards in one go", async () => {
    const a = await makeCard("T1", "active");
    const b = await makeCard("T2", "inactive");
    const c = await makeCard("T3", "expired");

    const res = await archiveCardType(cardType.id, actor);

    expect(res.cardType.status).toBe("archived");
    expect(res.affectedCards).toBe(3);

    for (const [card, before] of [
      [a, "active"],
      [b, "inactive"],
      [c, "expired"],
    ] as const) {
      const row = await readCard(card.id);
      expect(row.status).toBe("archived");
      expect(row.statusBeforeArchive).toBe(before);
      expect(row.archivedViaTypeId).toBe(cardType.id);
    }
  });

  it("does not overwrite the pre-archive status of already-archived cards", async () => {
    const individually = await makeCard("T4", "inactive");
    await archiveCard(individually.id, actor); // statusBeforeArchive = inactive
    const live = await makeCard("T5", "active");

    const res = await archiveCardType(cardType.id, actor);

    // Only the live card was cascaded.
    expect(res.affectedCards).toBe(1);

    const untouched = await readCard(individually.id);
    expect(untouched.statusBeforeArchive).toBe("inactive");
    expect(untouched.archivedViaTypeId).toBeNull();

    const cascaded = await readCard(live.id);
    expect(cascaded.archivedViaTypeId).toBe(cardType.id);
  });

  it("restores only the cascade, leaving individually-archived cards in the trash", async () => {
    const individually = await makeCard("T6", "active");
    await archiveCard(individually.id, actor);
    const cascaded = await makeCard("T7", "inactive");

    await archiveCardType(cardType.id, actor);
    const res = await restoreCardType(cardType.id, actor);

    expect(res.cardType.status).toBe("active");
    expect(res.affectedCards).toBe(1);

    // The cascaded card came back to exactly its pre-archive status.
    const revived = await readCard(cascaded.id);
    expect(revived.status).toBe("inactive");
    expect(revived.archivedViaTypeId).toBeNull();
    expect(revived.archivedAt).toBeNull();

    // The one archived on purpose stays in the trash.
    const stillArchived = await readCard(individually.id);
    expect(stillArchived.status).toBe("archived");
  });

  it("restores an inactive type back to inactive, not active", async () => {
    await deactivateCardType(cardType.id, actor);
    await archiveCardType(cardType.id, actor);

    const res = await restoreCardType(cardType.id, actor);
    expect(res.cardType.status).toBe("inactive");
  });

  it("rejects archiving an already archived type", async () => {
    await archiveCardType(cardType.id, actor);
    await expect(archiveCardType(cardType.id, actor)).rejects.toThrow(
      ValidationError,
    );
  });

  it("rejects restoring a type that is not archived", async () => {
    await expect(restoreCardType(cardType.id, actor)).rejects.toThrow(
      ValidationError,
    );
  });

  it("activate/deactivate on a type never touches its cards", async () => {
    const c = await makeCard("T8", "active");
    await deactivateCardType(cardType.id, actor);
    expect((await readCard(c.id)).status).toBe("active");
    await activateCardType(cardType.id, actor);
    expect((await readCard(c.id)).status).toBe("active");
  });
});

// ─── 4. Restore blocked by archived type ─────────────────────────────────────

describe("restoring a card whose type is archived", () => {
  it("is blocked with an actionable error", async () => {
    const c = await makeCard("B1", "active");
    await archiveCard(c.id, actor); // archived individually
    await archiveCardType(cardType.id, actor); // type goes to the trash too

    await expect(restoreCard(c.id, actor)).rejects.toThrow(
      ForbiddenOperationError,
    );
    await expect(restoreCard(c.id, actor)).rejects.toThrow(
      /Restore the card type first/,
    );

    // And it really did not move.
    expect((await readCard(c.id)).status).toBe("archived");
  });

  it("is allowed once the type is restored", async () => {
    const c = await makeCard("B2", "active");
    await archiveCard(c.id, actor);
    await archiveCardType(cardType.id, actor);
    await restoreCardType(cardType.id, actor);

    expect((await restoreCard(c.id, actor)).status).toBe("active");
  });

  it("is allowed when the type is merely inactive — inactive is not the trash", async () => {
    const c = await makeCard("B3", "active");
    await archiveCard(c.id, actor);
    await deactivateCardType(cardType.id, actor);

    expect((await restoreCard(c.id, actor)).status).toBe("active");
  });
});

// ─── 5. Retention ────────────────────────────────────────────────────────────

describe("getEffectiveRetentionDays", () => {
  it("defaults to 30 for a new tenant", async () => {
    expect(await getEffectiveRetentionDays(tenant.id)).toBe(30);
  });

  it("returns the tenant's configured override", async () => {
    await db
      .update(tenants)
      .set({ archiveRetentionDays: 7 })
      .where(eq(tenants.id, tenant.id));
    expect(await getEffectiveRetentionDays(tenant.id)).toBe(7);

    await db
      .update(tenants)
      .set({ archiveRetentionDays: 30 })
      .where(eq(tenants.id, tenant.id));
  });

  it("is per tenant — one tenant's value does not leak into another", async () => {
    const other = await createTenant({ name: `${PREFIX}Retention` });
    await db
      .update(tenants)
      .set({ archiveRetentionDays: 365 })
      .where(eq(tenants.id, other.id));

    expect(await getEffectiveRetentionDays(other.id)).toBe(365);
    expect(await getEffectiveRetentionDays(tenant.id)).toBe(30);
  });
});

// ─── 6 + 7. Query scoping ────────────────────────────────────────────────────

describe("management lists exclude archived, keep inactive", () => {
  it("listCards hides archived and shows inactive + expired", async () => {
    const active = await makeCard("L1", "active");
    const inactive = await makeCard("L2", "inactive");
    const expired = await makeCard("L3", "expired");
    const archived = await makeCard("L4", "active");
    await archiveCard(archived.id, actor);

    const res = await listCards(cardType.id, tenant.id);
    const ids = res.data.map((c) => c.id);

    expect(ids).toContain(active.id);
    expect(ids).toContain(inactive.id);
    expect(ids).toContain(expired.id);
    expect(ids).not.toContain(archived.id);
    expect(res.total).toBe(3);
  });

  it("searchCards hides archived and shows inactive", async () => {
    const inactive = await makeCard("S1", "inactive");
    const archived = await makeCard("S2", "active");
    await archiveCard(archived.id, actor);

    const res = await searchCards([cardType.id], tenant.id, {});
    const ids = res.data.map((c) => c.id);

    expect(ids).toContain(inactive.id);
    expect(ids).not.toContain(archived.id);
  });

  it("listCardTypes hides archived types and shows inactive ones", async () => {
    await deactivateCardType(cardType.id, actor);
    expect((await listCardTypes(tenant.id)).map((t) => t.id)).toContain(
      cardType.id,
    );

    await archiveCardType(cardType.id, actor);
    expect((await listCardTypes(tenant.id)).map((t) => t.id)).not.toContain(
      cardType.id,
    );
  });
});

describe("the scan lookup path is untouched", () => {
  // Phase 2 must DENY an archived card explicitly (red, no override). If the
  // lookup silently filtered archived rows out, the card would read as "not
  // found" and that denial could never be shown.
  it("getCardByCode still returns an archived card", async () => {
    const c = await makeCard("SCAN1", "active");
    await archiveCard(c.id, actor);

    const found = await getCardByCode(`${PREFIX}SCAN1`, tenant.id);
    expect(found.id).toBe(c.id);
    expect(found.status).toBe("archived");
  });

  it("getCardByCode still returns inactive and expired cards", async () => {
    await makeCard("SCAN2", "inactive");
    await makeCard("SCAN3", "expired");

    expect((await getCardByCode(`${PREFIX}SCAN2`, tenant.id)).status).toBe(
      "inactive",
    );
    expect((await getCardByCode(`${PREFIX}SCAN3`, tenant.id)).status).toBe(
      "expired",
    );
  });
});

// ─── 8. Audit ────────────────────────────────────────────────────────────────

describe("audit", () => {
  it("logs each direct transition with from/to and the actor", async () => {
    const c = await makeCard("A1", "active");
    await deactivateCard(c.id, actor);
    await activateCard(c.id, actor);
    await archiveCard(c.id, actor);
    await restoreCard(c.id, actor);

    const logs = await lifecycleLogs(c.id);
    expect(logs).toHaveLength(4);

    const meta = logs.map((l) => l.metadata as Record<string, unknown>);
    expect(meta).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ transition: "deactivate", from: "active", to: "inactive" }),
        expect.objectContaining({ transition: "activate", from: "inactive", to: "active" }),
        expect.objectContaining({ transition: "archive", from: "active", to: "archived" }),
        expect.objectContaining({ transition: "restore", from: "archived", to: "active" }),
      ]),
    );
    expect(logs.every((l) => l.executedBy === USER_ID)).toBe(true);
    expect(logs.every((l) => l.tenantId === tenant.id)).toBe(true);
  });

  it("logs one row per cascaded card, tagged with the originating type", async () => {
    const a = await makeCard("A2", "active");
    const b = await makeCard("A3", "inactive");

    await archiveCardType(cardType.id, actor);

    for (const [card, from] of [
      [a, "active"],
      [b, "inactive"],
    ] as const) {
      const logs = await lifecycleLogs(card.id);
      expect(logs).toHaveLength(1);
      expect(logs[0].metadata).toMatchObject({
        transition: "archive",
        from,
        to: "archived",
        cascaded_from_card_type_id: cardType.id,
      });
    }
  });

  it("logs the cascade on restore too", async () => {
    const c = await makeCard("A4", "inactive");
    await archiveCardType(cardType.id, actor);
    await restoreCardType(cardType.id, actor);

    const logs = await lifecycleLogs(c.id);
    expect(logs).toHaveLength(2);
    expect(logs.map((l) => (l.metadata as Record<string, unknown>).transition).sort()).toEqual(
      ["archive", "restore"],
    );
    const restoreLog = logs.find(
      (l) => (l.metadata as Record<string, unknown>).transition === "restore",
    )!;
    expect(restoreLog.metadata).toMatchObject({
      from: "archived",
      to: "inactive",
      cascaded_from_card_type_id: cardType.id,
    });
  });

  it("does not leak lifecycle rows into scan/action queries", async () => {
    const c = await makeCard("A5", "active");
    await archiveCard(c.id, actor);

    const nonLifecycle = await db
      .select()
      .from(actionLogs)
      .where(
        and(
          eq(actionLogs.cardId, c.id),
          inArray(actionLogs.logType, ["scan", "action"]),
        ),
      );
    expect(nonLifecycle).toHaveLength(0);
  });
});

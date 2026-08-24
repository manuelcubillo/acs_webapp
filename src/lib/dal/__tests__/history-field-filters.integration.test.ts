/**
 * Integration tests for field-level filters in the action history query.
 *
 * The filters are pure SQL (correlated EXISTS over `field_values`), so they run
 * against the real Dockerized Postgres, like the other DAL integration tests.
 *
 * Covered:
 *  1. A field filter applies with NO card type selected — the regression fixed
 *     here: `buildWhere` used to drop it silently unless `cardTypeIds` was set.
 *  2. The same filter combined with `cardTypeIds` still narrows to that type.
 *  3. `fieldDefinitionIds` spanning two card types matches logs from both.
 *
 * WARNING: creates and deletes real data, prefixed `__test_histfieldfilter_`.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
import { tenants, user, actionLogs } from "@/lib/db/schema";
import { createTenant } from "@/lib/dal/tenants";
import { createCardType } from "@/lib/dal/card-types";
import { addFieldDefinition } from "@/lib/dal/field-definitions";
import { createCard } from "@/lib/dal/cards";
import { getActionHistory } from "@/lib/dal/action-history";
import type { Tenant, CardType, FieldDefinition } from "@/lib/dal/types";

const PREFIX = "__test_histfieldfilter_";
const USER_ID = `${PREFIX}user`;
const PAGE = { page: 1, pageSize: 50 };

let tenant: Tenant;
let typeA: CardType;
let typeB: CardType;
/** "nombre" text field — same name + fieldType in both types, so it is common. */
let nameFieldA: FieldDefinition;
let nameFieldB: FieldDefinition;

/** Create a card with a `nombre` value and one scan log pointing at it. */
async function makeCardWithLog(
  cardType: CardType,
  nameField: FieldDefinition,
  code: string,
  nombre: string,
) {
  const card = await createCard(cardType.id, tenant.id, `${PREFIX}${code}`, {
    [nameField.id]: nombre,
  });
  await db.insert(actionLogs).values({
    tenantId: tenant.id,
    cardId: card.id,
    logType: "scan",
    executedBy: USER_ID,
  });
  return card;
}

beforeAll(async () => {
  await db
    .insert(user)
    .values({
      id: USER_ID,
      name: "History Field Filter Test",
      email: `${PREFIX}user@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  tenant = await createTenant({ name: `${PREFIX}Tenant` });

  typeA = await createCardType(tenant.id, { name: `${PREFIX}TypeA` });
  typeB = await createCardType(tenant.id, { name: `${PREFIX}TypeB` });

  nameFieldA = await addFieldDefinition(typeA.id, {
    name: "nombre",
    label: "Nombre",
    fieldType: "text",
  });
  nameFieldB = await addFieldDefinition(typeB.id, {
    name: "nombre",
    label: "Nombre",
    fieldType: "text",
  });

  // 3 cards / 3 scan logs: two match "Alic", one does not, split across types.
  await makeCardWithLog(typeA, nameFieldA, "A1", "Alicia");
  await makeCardWithLog(typeA, nameFieldA, "A2", "Bruno");
  await makeCardWithLog(typeB, nameFieldB, "B1", "Alicia");
});

afterAll(async () => {
  await db.delete(tenants).where(like(tenants.name, `${PREFIX}%`));
  await db.delete(user).where(eq(user.id, USER_ID));
});

describe("getActionHistory field filters", () => {
  it("baseline: no filters returns every log for the tenant", async () => {
    const res = await getActionHistory(tenant.id, {}, PAGE);
    expect(res.total).toBe(3);
  });

  it("applies a field filter with NO card type selected", async () => {
    const res = await getActionHistory(
      tenant.id,
      {
        fieldFilters: [
          {
            fieldDefinitionIds: [nameFieldA.id, nameFieldB.id],
            operator: "contains",
            value: "Alic",
          },
        ],
      },
      PAGE,
    );

    expect(res.total).toBe(2);
    expect(res.data.map((e) => e.cardCode).sort()).toEqual([
      `${PREFIX}A1`,
      `${PREFIX}B1`,
    ]);
  });

  it("still narrows to the selected card type when one is given", async () => {
    const res = await getActionHistory(
      tenant.id,
      {
        cardTypeIds: [typeA.id],
        fieldFilters: [
          {
            fieldDefinitionIds: [nameFieldA.id, nameFieldB.id],
            operator: "contains",
            value: "Alic",
          },
        ],
      },
      PAGE,
    );

    expect(res.total).toBe(1);
    expect(res.data[0].cardCode).toBe(`${PREFIX}A1`);
  });

  it("a non-matching value filters everything out", async () => {
    const res = await getActionHistory(
      tenant.id,
      {
        fieldFilters: [
          {
            fieldDefinitionIds: [nameFieldA.id, nameFieldB.id],
            operator: "equals_text",
            value: "Nadie",
          },
        ],
      },
      PAGE,
    );

    expect(res.total).toBe(0);
    expect(res.data).toHaveLength(0);
  });

  it("a filter scoped to one type's field id ignores the other type's logs", async () => {
    const res = await getActionHistory(
      tenant.id,
      {
        fieldFilters: [
          {
            fieldDefinitionIds: [nameFieldB.id],
            operator: "contains",
            value: "Alic",
          },
        ],
      },
      PAGE,
    );

    expect(res.total).toBe(1);
    expect(res.data[0].cardCode).toBe(`${PREFIX}B1`);
  });
});

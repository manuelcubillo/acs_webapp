/**
 * Integration tests for filtering a MULTI-SELECT field.
 *
 * A select stores one option in `value_text` and several in `value_json`, so a
 * text filter that only reads `value_text` silently drops every card whose
 * match is one of its multiple selections — a wrong result set, not an error,
 * which is why this needs real SQL rather than a unit test.
 *
 * `fieldValueTextIlike` / `fieldValueTextEquals` build the shared predicate;
 * this exercises it through `searchCards` (the card list) and
 * `getActionHistory` (`/history`), the two callers.
 *
 * WARNING: creates and deletes real data, prefixed `__test_multiselectfilter_`.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, user, actionLogs } from "@/lib/db/schema";
import { createTenant } from "@/lib/dal/tenants";
import { createCardType } from "@/lib/dal/card-types";
import { addFieldDefinition } from "@/lib/dal/field-definitions";
import { createCard, searchCards } from "@/lib/dal/cards";
import { getActionHistory } from "@/lib/dal/action-history";
import { SELECT_OPTIONS_RULE, ALLOW_MULTIPLE_RULE } from "@/lib/validation/rules";
import type { Tenant, CardType, FieldDefinition } from "@/lib/dal/types";

const PREFIX = "__test_multiselectfilter_";
const USER_ID = `${PREFIX}user`;
const PAGE = { page: 1, pageSize: 50 };
const OPTIONS = ["Av.Madrid", "Lisboa", "Veredillas"];

let tenant: Tenant;
let cardType: CardType;
let zonaField: FieldDefinition;

/** Create a card with a `zona` value (single string or array) plus a scan log. */
async function makeCard(code: string, zona: string | string[]) {
  const card = await createCard(cardType.id, tenant.id, `${PREFIX}${code}`, {
    [zonaField.id]: zona,
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
      name: "Multi Select Filter Test",
      email: `${PREFIX}user@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  tenant = await createTenant({ name: `${PREFIX}Tenant` });
  cardType = await createCardType(tenant.id, { name: `${PREFIX}Type` });

  zonaField = await addFieldDefinition(cardType.id, {
    name: "zona",
    label: "Zona",
    fieldType: "select",
    validationRules: {
      rules: [
        { rule: SELECT_OPTIONS_RULE, value: OPTIONS },
        { rule: ALLOW_MULTIPLE_RULE, value: true },
      ],
    },
  });

  // Two multi-select cards and one single-select, so every assertion below
  // distinguishes "found the array" from "found everything".
  await makeCard("M1", ["Lisboa", "Veredillas"]);
  await makeCard("M2", ["Av.Madrid"]);
  await makeCard("S1", "Lisboa");
});

afterAll(async () => {
  await db.delete(tenants).where(like(tenants.name, `${PREFIX}%`));
  await db.delete(user).where(eq(user.id, USER_ID));
});

describe("searchCards — multi-select field filters", () => {
  it("finds a card by an option that is not the first of its selection", async () => {
    const res = await searchCards([cardType.id], tenant.id, {
      filters: [
        {
          fieldDefinitionIds: [zonaField.id],
          operator: "equals_text",
          value: "Veredillas",
        },
      ],
    });

    expect(res.data.map((c) => c.code)).toEqual([`${PREFIX}M1`]);
  });

  it("matches single-select and multi-select cards with one filter", async () => {
    const res = await searchCards([cardType.id], tenant.id, {
      filters: [
        {
          fieldDefinitionIds: [zonaField.id],
          operator: "equals_text",
          value: "Lisboa",
        },
      ],
    });

    expect(res.data.map((c) => c.code).sort()).toEqual([
      `${PREFIX}M1`,
      `${PREFIX}S1`,
    ]);
  });

  it("supports `contains` across both storage shapes", async () => {
    const res = await searchCards([cardType.id], tenant.id, {
      filters: [
        {
          fieldDefinitionIds: [zonaField.id],
          operator: "contains",
          value: "isbo",
        },
      ],
    });

    expect(res.data.map((c) => c.code).sort()).toEqual([
      `${PREFIX}M1`,
      `${PREFIX}S1`,
    ]);
  });

  it("does not match an option no card holds", async () => {
    const res = await searchCards([cardType.id], tenant.id, {
      filters: [
        {
          fieldDefinitionIds: [zonaField.id],
          operator: "equals_text",
          value: "Oporto",
        },
      ],
    });

    expect(res.data).toEqual([]);
  });
});

describe("getActionHistory — multi-select field filters", () => {
  it("finds the log of a card whose selection includes the value", async () => {
    const res = await getActionHistory(
      tenant.id,
      {
        fieldFilters: [
          {
            fieldDefinitionIds: [zonaField.id],
            operator: "equals_text",
            value: "Veredillas",
          },
        ],
      },
      PAGE,
    );

    expect(res.total).toBe(1);
    expect(res.data[0].cardCode).toBe(`${PREFIX}M1`);
  });
});

describe("multi-select round trip through the DAL", () => {
  it("reads the stored selection back as an array", async () => {
    const res = await searchCards([cardType.id], tenant.id, {
      codeContains: `${PREFIX}M1`,
    });

    const zona = res.data[0].fields.find((f) => f.fieldDefinitionId === zonaField.id);
    expect(zona?.value).toEqual(["Lisboa", "Veredillas"]);
  });
});

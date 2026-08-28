/**
 * Verifies the enable/disable provisioning CTEs against a real Postgres —
 * the dedicated `acs_test` database, wired by `src/test/setup-integration.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { eq, and, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, cardTypes, fieldDefinitions, actionDefinitions, cards, fieldValues } from "@/lib/db/schema";
import { createTenant, deleteTenant } from "@/lib/dal/tenants";
import { createCardType } from "@/lib/dal/card-types";
import { addFieldDefinition } from "@/lib/dal/field-definitions";
import { enablePresenceControl, disablePresenceControl } from "@/lib/server/presence/provisioning";
import { PRESENCE_FIELD_NAME } from "@/lib/server/presence/constants";

// Disjoint from every other test file's prefix. The afterAll sweep matches
// `LIKE '<PREFIX>%'`, so a prefix that is a PROPER PREFIX of another file's
// would delete that file's tenants mid-run when vitest runs them in parallel.
const PREFIX = "__test_provisioning_";
let tenantId = "";
let ctId = "";

beforeAll(async () => {
  const t = await createTenant({ name: `${PREFIX}T` });
  tenantId = t.id;
  const ct = await createCardType(tenantId, { name: `${PREFIX}CT` });
  ctId = ct.id;
  // A pre-existing user field, so `position = last` is actually exercised.
  await addFieldDefinition(ctId, { name: "nombre", label: "Nombre", fieldType: "text", isRequired: false });
});

afterAll(async () => {
  if (tenantId) await deleteTenant(tenantId);
  const leftovers = await db.select().from(tenants).where(like(tenants.name, `${PREFIX}%`));
  for (const t of leftovers) await deleteTenant(t.id);
});

async function systemRows() {
  const fds = await db.select().from(fieldDefinitions)
    .where(and(eq(fieldDefinitions.cardTypeId, ctId), eq(fieldDefinitions.isSystem, true)));
  const ads = await db.select().from(actionDefinitions)
    .where(and(eq(actionDefinitions.cardTypeId, ctId), eq(actionDefinitions.isSystem, true)));
  const [ct] = await db.select().from(cardTypes).where(eq(cardTypes.id, ctId));
  return { fds, ads, ct };
}

describe("presence provisioning", () => {
  let firstFieldId = "";
  let firstActionId = "";

  it("enable creates exactly one system field + one system action and designates it", async () => {
    const r = await enablePresenceControl(tenantId, ctId);
    expect(r.changed).toBe(true);
    firstFieldId = r.fieldDefinitionId;
    firstActionId = r.actionDefinitionId;

    const { fds, ads, ct } = await systemRows();
    expect(fds).toHaveLength(1);
    expect(ads).toHaveLength(1);
    expect(fds[0].name).toBe(PRESENCE_FIELD_NAME);
    expect(fds[0].label).toBe("Dentro");
    expect(fds[0].fieldType).toBe("boolean");
    expect(fds[0].isRequired).toBe(false);
    expect(fds[0].position).toBe(1); // after the user field at 0
    expect(ads[0].actionType).toBe("toggle");
    expect(ads[0].isAutoExecute).toBe(true);
    expect(ads[0].isOperatorVisible).toBe(true);
    expect(ads[0].targetFieldDefinitionId).toBe(firstFieldId);
    expect(ct.presenceFieldDefinitionId).toBe(firstFieldId);
  });

  it("enable is idempotent — second call changes nothing and creates no duplicate", async () => {
    const r = await enablePresenceControl(tenantId, ctId);
    expect(r.changed).toBe(false);
    expect(r.fieldDefinitionId).toBe(firstFieldId);
    expect(r.actionDefinitionId).toBe(firstActionId);
    const { fds, ads } = await systemRows();
    expect(fds).toHaveLength(1);
    expect(ads).toHaveLength(1);
  });

  it("disable clears the designation and soft-deletes both rows, keeping field_values", async () => {
    // Give a card a presence value first, so we can prove it survives.
    const [card] = await db.insert(cards)
      .values({ code: `${PREFIX}c1`, cardTypeId: ctId, tenantId }).returning();
    await db.insert(fieldValues)
      .values({ cardId: card.id, fieldDefinitionId: firstFieldId, valueBoolean: true });

    const r = await disablePresenceControl(tenantId, ctId);
    expect(r.changed).toBe(true);

    const { fds, ads, ct } = await systemRows();
    expect(ct.presenceFieldDefinitionId).toBeNull();
    expect(fds).toHaveLength(1);
    expect(fds[0].isActive).toBe(false);
    expect(ads).toHaveLength(1);
    expect(ads[0].isActive).toBe(false);

    const vals = await db.select().from(fieldValues)
      .where(eq(fieldValues.fieldDefinitionId, firstFieldId));
    expect(vals).toHaveLength(1);
    expect(vals[0].valueBoolean).toBe(true);
  });

  it("disable is idempotent", async () => {
    const r = await disablePresenceControl(tenantId, ctId);
    expect(r.changed).toBe(false);
  });

  it("re-enable REUSES the same rows (same UUIDs) and revives them", async () => {
    const r = await enablePresenceControl(tenantId, ctId);
    expect(r.changed).toBe(true);
    expect(r.fieldDefinitionId).toBe(firstFieldId);
    expect(r.actionDefinitionId).toBe(firstActionId);

    const { fds, ads, ct } = await systemRows();
    expect(fds).toHaveLength(1);
    expect(ads).toHaveLength(1);
    expect(fds[0].isActive).toBe(true);
    expect(ads[0].isActive).toBe(true);
    expect(ct.presenceFieldDefinitionId).toBe(firstFieldId);

    // The stored value came back with it.
    const vals = await db.select().from(fieldValues)
      .where(eq(fieldValues.fieldDefinitionId, firstFieldId));
    expect(vals[0].valueBoolean).toBe(true);
  });

  it("repairs a dangling designation (field soft-deleted underneath it)", async () => {
    await db.update(fieldDefinitions).set({ isActive: false }).where(eq(fieldDefinitions.id, firstFieldId));
    const r = await enablePresenceControl(tenantId, ctId);
    expect(r.changed).toBe(true);
    expect(r.fieldDefinitionId).toBe(firstFieldId);
    const { fds } = await systemRows();
    expect(fds).toHaveLength(1);
    expect(fds[0].isActive).toBe(true);
  });

  it("refuses a card type from another tenant", async () => {
    const other = await createTenant({ name: `${PREFIX}Other` });
    await expect(enablePresenceControl(other.id, ctId)).rejects.toThrow(/no encontrado|not found/i);
    await expect(disablePresenceControl(other.id, ctId)).rejects.toThrow(/no encontrado|not found/i);
    await deleteTenant(other.id);
  });
});

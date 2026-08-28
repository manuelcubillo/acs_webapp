/**
 * Verifies the bulk-close CTE (`closeAllPresence`) against a real Postgres —
 * the dedicated `acs_test` database, wired by `src/test/setup-integration.ts`.
 *
 * The tests run in order against one shared fixture: the close happens once and
 * the following cases assert on the state and the log rows it left behind, the
 * same shape `src/lib/dal/__tests__/presence.integration.test.ts` uses.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { and, eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, actionLogs, fieldValues } from "@/lib/db/schema";
import { createTenant, deleteTenant } from "@/lib/dal/tenants";
import { createCardType } from "@/lib/dal/card-types";
import { createCard } from "@/lib/dal/cards";
import { executeAction } from "@/lib/dal/actions";
import { getPresenceOccupants } from "@/lib/dal/presence";
import { getActionHistory } from "@/lib/dal/action-history";
import { presenceDirectionLabel } from "@/lib/presence/labels";
import {
  enablePresenceControl,
  disablePresenceControl,
} from "@/lib/server/presence/provisioning";
import { PRESENCE_FIELD_NAME } from "@/lib/server/presence/constants";
import { archiveCard } from "@/lib/server/lifecycle/cards";
import { closeAllPresence } from "../close";

// Disjoint from every other test file's prefix — see the note in
// `provisioning.integration.test.ts`.
const PREFIX = "__test_close_recinto_";
const USER_ID = "00000000-0000-0000-0000-000000000001"; // seeded sentinel

/** Tenant under test. */
let tenantId = "";
/** A second tenant, whose occupant must survive the close untouched. */
let otherTenantId = "";
/** The presence action of the tenant's participating card type. */
let presenceActionId = "";
/** Two live cards inside + one archived-while-inside "ghost". */
let insideIds: string[] = [];
let ghostId = "";
/** A card whose type had presence disabled, leaving a stale `true` behind. */
let orphanedId = "";
/** The other tenant's occupant. */
let otherCardId = "";

/** Put a card inside through the ordinary execution path. */
async function enter(cardId: string, tenant: string, actionId: string) {
  await executeAction({
    cardId,
    actionDefinitionId: actionId,
    tenantId: tenant,
    executedBy: USER_ID,
  });
}

/** The stored presence boolean of a card, whatever its card type's state. */
async function presenceValue(cardId: string): Promise<boolean | null> {
  const rows = await db.select().from(fieldValues).where(eq(fieldValues.cardId, cardId));
  const row = rows.find((r) => r.valueBoolean !== null);
  return row?.valueBoolean ?? null;
}

/** Every `action` row this tenant's presence action produced. */
async function presenceLogs() {
  return db
    .select()
    .from(actionLogs)
    .where(
      and(
        eq(actionLogs.tenantId, tenantId),
        eq(actionLogs.actionDefinitionId, presenceActionId),
      ),
    )
    .orderBy(actionLogs.executedAt);
}

beforeAll(async () => {
  const t = await createTenant({ name: `${PREFIX}T` });
  tenantId = t.id;

  // ── Participating card type: two live occupants + one ghost.
  const ct = await createCardType(tenantId, { name: `${PREFIX}CT` });
  const provisioned = await enablePresenceControl(tenantId, ct.id);
  presenceActionId = provisioned.actionDefinitionId;

  const c1 = await createCard(ct.id, tenantId, "C001", {});
  const c2 = await createCard(ct.id, tenantId, "C002", {});
  const ghost = await createCard(ct.id, tenantId, "C003", {});
  insideIds = [c1.id, c2.id];
  ghostId = ghost.id;

  for (const id of [c1.id, c2.id, ghost.id]) await enter(id, tenantId, presenceActionId);
  // Archived WHILE inside: invisible to the page, still flagged true in storage.
  await archiveCard(ghost.id, { userId: USER_ID, tenantId });

  // ── A card type whose presence was turned off, keeping its stored values.
  const ctOff = await createCardType(tenantId, { name: `${PREFIX}CTOFF` });
  const provisionedOff = await enablePresenceControl(tenantId, ctOff.id);
  const orphaned = await createCard(ctOff.id, tenantId, "C004", {});
  orphanedId = orphaned.id;
  await enter(orphaned.id, tenantId, provisionedOff.actionDefinitionId);
  await disablePresenceControl(tenantId, ctOff.id);

  // ── A second tenant, fully independent.
  const other = await createTenant({ name: `${PREFIX}Other` });
  otherTenantId = other.id;
  const otherCt = await createCardType(otherTenantId, { name: `${PREFIX}OtherCT` });
  const otherProvisioned = await enablePresenceControl(otherTenantId, otherCt.id);
  const otherCard = await createCard(otherCt.id, otherTenantId, "D001", {});
  otherCardId = otherCard.id;
  await enter(otherCard.id, otherTenantId, otherProvisioned.actionDefinitionId);
});

afterAll(async () => {
  for (const id of [tenantId, otherTenantId]) if (id) await deleteTenant(id);
  for (const t of await db.select().from(tenants).where(like(tenants.name, `${PREFIX}%`))) {
    await deleteTenant(t.id);
  }
});

describe("closeAllPresence", () => {
  it("the fixture starts with two visible occupants and one hidden ghost", async () => {
    const occupants = await getPresenceOccupants(tenantId);
    expect(occupants.map((o) => o.code).sort()).toEqual(["C001", "C002"]);
    // The ghost is inside in storage but filtered out of the read path.
    expect(await presenceValue(ghostId)).toBe(true);
    expect(await presenceValue(orphanedId)).toBe(true);
  });

  it("closes every card inside, ghosts included, and empties the recinto", async () => {
    // Three rows: the two live occupants plus the archived ghost. The card whose
    // type no longer designates a presence field is NOT one of them.
    expect(await closeAllPresence({ tenantId, executedBy: USER_ID })).toEqual({
      closed: 3,
    });

    expect(await getPresenceOccupants(tenantId)).toEqual([]);
    for (const id of insideIds) expect(await presenceValue(id)).toBe(false);
  });

  it("resets a ghost — a card that is not active but was still flagged inside", async () => {
    // Without this the card would walk back in still flagged as inside the
    // moment it is reactivated. It is the reason the close has no status filter.
    expect(await presenceValue(ghostId)).toBe(false);
  });

  it("does not reach through a NULL designation", async () => {
    // Presence was disabled on this card type, so its stored values are frozen
    // on purpose — re-enabling must restore the card exactly as it was.
    expect(await presenceValue(orphanedId)).toBe(true);
  });

  it("leaves the other tenant's occupants untouched", async () => {
    expect(await presenceValue(otherCardId)).toBe(true);
    expect(await getPresenceOccupants(otherTenantId)).toHaveLength(1);
  });

  it("writes exactly one exit log per closed value, shaped like a manual toggle", async () => {
    const logs = await presenceLogs();
    // Three entries (fixture) + three exits (the close). No more, no less: the
    // log rows are driven by the UPDATE's RETURNING, not a second read.
    expect(logs).toHaveLength(6);

    const exits = logs.filter(
      (l) => (l.metadata as Record<string, unknown>).after_value === false,
    );
    expect(exits).toHaveLength(3);
    expect(new Set(exits.map((l) => l.cardId))).toEqual(
      new Set([...insideIds, ghostId]),
    );

    for (const l of exits) {
      expect(l.logType).toBe("action");
      expect(l.actionDefinitionId).toBe(presenceActionId);
      expect(l.executedBy).toBe(USER_ID);
      expect(l.metadata).toEqual({
        action_type: "toggle",
        target_field: PRESENCE_FIELD_NAME,
        before_value: true,
        after_value: false,
      });
    }
  });

  it("those rows are presence rows in /history and read as Salida", async () => {
    const history = await getActionHistory(tenantId, {}, { page: 1, pageSize: 100 });
    const exits = history.data.filter(
      (e) =>
        e.actionDefinitionId === presenceActionId &&
        (e.metadata as Record<string, unknown>)?.after_value === false,
    );
    expect(exits).toHaveLength(3);

    for (const e of exits) {
      // isPresenceRowSql classifies them — the whole point of matching
      // executeAction's shape column for column.
      expect(e.isPresence).toBe(true);
      const after = (e.metadata as Record<string, unknown>).after_value;
      expect(presenceDirectionLabel(after === true)).toBe("Salida");
    }
  });

  it("is idempotent — a second run closes nothing and logs nothing", async () => {
    const before = (await presenceLogs()).length;
    expect(await closeAllPresence({ tenantId, executedBy: USER_ID })).toEqual({
      closed: 0,
    });
    expect((await presenceLogs()).length).toBe(before);
  });
});

/**
 * Integration tests for presence control, end to end over a real Postgres.
 *
 * Covers the loop the feature actually runs: provision → scan-executed toggle →
 * appear on the presence page → toggle back → disappear, plus the boundaries
 * (tenant isolation, archived/inactive cards, presence disabled).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, fieldValues, actionLogs } from "@/lib/db/schema";
import { createTenant, deleteTenant } from "../tenants";
import { createCardType } from "../card-types";
import { addFieldDefinition } from "../field-definitions";
import { setCardTypeSummaryFields } from "../dashboard-settings";
import { createCard } from "../cards";
import { executeAction, getAutoExecuteActions, getActionsForCardType } from "../actions";
import { getPresenceOccupants, tenantHasPresenceEnabled } from "../presence";
import { getActionHistory, getHistoryFilterOptions, buildCsvFromEntries } from "../action-history";
import { getActivityFeed } from "../activity-feed";
import { presenceDirectionLabel, PRESENCE_FILTER_LABEL } from "@/lib/presence/labels";
import {
  enablePresenceControl,
  disablePresenceControl,
} from "@/lib/server/presence/provisioning";
import { archiveCard, deactivateCard } from "@/lib/server/lifecycle/cards";
import { archiveCardType } from "@/lib/server/lifecycle/card-types";
import type { Tenant, CardType, CardWithFields, FieldDefinition } from "../types";

// Disjoint from every other test file's prefix — see the note in
// `src/lib/server/presence/__tests__/provisioning.integration.test.ts`.
const PREFIX = "__test_recinto_";
const USER_ID = "00000000-0000-0000-0000-000000000001"; // seeded sentinel

let tenant: Tenant;
let cardType: CardType;
let nameField: FieldDefinition;
let card: CardWithFields;
let presenceActionId = "";

beforeAll(async () => {
  tenant = await createTenant({ name: `${PREFIX}T` });
  cardType = await createCardType(tenant.id, { name: `${PREFIX}Residente` });
  nameField = await addFieldDefinition(cardType.id, {
    name: "nombre",
    label: "Nombre",
    fieldType: "text",
    isRequired: false,
  });
  await setCardTypeSummaryFields(cardType.id, tenant.id, {
    fieldDefinitionIds: [nameField.id],
  });
  card = await createCard(cardType.id, tenant.id, "P001", { [nameField.id]: "Ada" });
});

afterAll(async () => {
  if (tenant) await deleteTenant(tenant.id);
  for (const t of await db.select().from(tenants).where(like(tenants.name, `${PREFIX}%`))) {
    await deleteTenant(t.id);
  }
});

/** Fire the card type's system toggle exactly as an operational scan would. */
async function fireAutoActions(cardId: string) {
  const autos = await getAutoExecuteActions(cardType.id);
  for (const a of autos) {
    await executeAction({
      cardId,
      actionDefinitionId: a.id,
      tenantId: tenant.id,
      executedBy: USER_ID,
    });
  }
  return autos;
}

describe("presence", () => {
  it("reports disabled before anything is provisioned", async () => {
    expect(await tenantHasPresenceEnabled(tenant.id)).toBe(false);
    expect(await getPresenceOccupants(tenant.id)).toEqual([]);
  });

  it("enabling makes the toggle an auto-execute action", async () => {
    const r = await enablePresenceControl(tenant.id, cardType.id);
    presenceActionId = r.actionDefinitionId;

    expect(await tenantHasPresenceEnabled(tenant.id)).toBe(true);

    const autos = await getAutoExecuteActions(cardType.id);
    expect(autos.map((a) => a.id)).toContain(presenceActionId);
    expect(autos.find((a) => a.id === presenceActionId)?.actionType).toBe("toggle");
    // Nobody is inside yet: the field has no value row at all.
    expect(await getPresenceOccupants(tenant.id)).toEqual([]);
  });

  it("the first toggle turns a NULL value into true (entry)", async () => {
    const [auto] = await fireAutoActions(card.id);
    expect(auto.id).toBe(presenceActionId);

    const occupants = await getPresenceOccupants(tenant.id);
    expect(occupants).toHaveLength(1);
    expect(occupants[0].code).toBe("P001");
    expect(occupants[0].cardTypeName).toBe(`${PREFIX}Residente`);
    expect(occupants[0].presenceActionDefinitionId).toBe(presenceActionId);
    // Summary fields come through, so the row identifies a person.
    expect(occupants[0].summaryFields).toHaveLength(1);
    expect(occupants[0].summaryFields[0].value).toBe("Ada");
    expect(occupants[0].photoUrl).toBeNull();
    expect(occupants[0].insideSince).toBeInstanceOf(Date);
  });

  it("`inside_since` comes from the trigger, not the app clock", async () => {
    const [before] = await getPresenceOccupants(tenant.id);
    // Backdate the row directly; the trigger must overwrite it on the next write.
    await db
      .update(fieldValues)
      .set({ updatedAt: new Date("2000-01-01T00:00:00Z") })
      .where(eq(fieldValues.cardId, card.id));
    const [after] = await getPresenceOccupants(tenant.id);
    expect(after.insideSince.getFullYear()).toBeGreaterThan(2000);
    expect(after.insideSince.getTime()).toBeGreaterThanOrEqual(before.insideSince.getTime());
  });

  it("the second toggle flips it back (exit) and empties the recinto", async () => {
    await fireAutoActions(card.id);
    expect(await getPresenceOccupants(tenant.id)).toEqual([]);
  });

  it("a third toggle re-enters", async () => {
    await fireAutoActions(card.id);
    expect(await getPresenceOccupants(tenant.id)).toHaveLength(1);
  });

  it("the toggle is operator-visible AND auto-execute — the point of the split", async () => {
    const actions = await getActionsForCardType(cardType.id);
    const presence = actions.find((a) => a.id === presenceActionId)!;
    expect(presence.isAutoExecute).toBe(true);
    expect(presence.isOperatorVisible).toBe(true);
    expect(presence.isSystem).toBe(true);
  });

  it("each toggle writes an audit row with the right before/after, and reaches /history", async () => {
    const logs = await db
      .select()
      .from(actionLogs)
      .where(eq(actionLogs.tenantId, tenant.id))
      .orderBy(actionLogs.executedAt);

    const toggleLogs = logs.filter(
      (l) => (l.metadata as Record<string, unknown> | null)?.action_type === "toggle",
    );
    // Three toggles fired above: entry, exit, re-entry.
    expect(toggleLogs).toHaveLength(3);

    const values = toggleLogs.map((l) => {
      const md = l.metadata as Record<string, unknown>;
      return [md.before_value, md.after_value];
    });
    // First toggle starts from NO ROW — before_value is null, not false.
    expect(values[0]).toEqual([null, true]);
    expect(values[1]).toEqual([true, false]);
    expect(values[2]).toEqual([false, true]);

    for (const l of toggleLogs) {
      expect(l.logType).toBe("action");
      expect(l.actionDefinitionId).toBe(presenceActionId);
      expect(l.executedBy).toBe(USER_ID);
    }

    // /history reads the same rows, unfiltered by action type.
    const history = await getActionHistory(tenant.id, {}, { page: 1, pageSize: 50 });
    const presenceRows = history.data.filter((e) => e.actionDefinitionId === presenceActionId);
    expect(presenceRows).toHaveLength(3);
    expect(presenceRows[0].actionName).toBe("Presencia");
  });

  it("flags presence rows with isPresence in BOTH read paths, and only those", async () => {
    const history = await getActionHistory(tenant.id, {}, { page: 1, pageSize: 50 });
    const presenceRows = history.data.filter((e) => e.isPresence);
    const otherRows = history.data.filter((e) => !e.isPresence);

    expect(presenceRows.length).toBeGreaterThan(0);
    for (const r of presenceRows) {
      expect(r.actionDefinitionId).toBe(presenceActionId);
    }
    // Scan rows have no action at all, so they are never presence rows.
    for (const r of otherRows) {
      expect(r.actionDefinitionId).not.toBe(presenceActionId);
    }

    const feed = await getActivityFeed(tenant.id, { limit: 50 });
    const feedPresence = feed.filter((e) => e.isPresence);
    expect(feedPresence.length).toBeGreaterThan(0);
    for (const r of feedPresence) {
      expect(r.actionDefinitionId).toBe(presenceActionId);
      // The after-value is projected so the label can be derived without the
      // renderer parsing jsonb.
      expect(typeof r.presenceAfterValue).toBe("boolean");
    }
  });

  it("derives Entrada / Salida from the after-value, and the CSV agrees", async () => {
    const history = await getActionHistory(tenant.id, {}, { page: 1, pageSize: 50 });
    // Rows come back newest-first; the three toggles were entry, exit, re-entry.
    const presenceRows = history.data
      .filter((e) => e.isPresence)
      .sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime());

    const labels = presenceRows.map((r) => {
      const after = (r.metadata as Record<string, unknown>).after_value;
      return presenceDirectionLabel(after === true);
    });
    expect(labels.slice(0, 3)).toEqual(["Entrada", "Salida", "Entrada"]);

    // The export must not disagree with the table.
    const csv = buildCsvFromEntries(presenceRows);
    const actionColumn = csv
      .split("\n")
      .slice(1)
      .map((line) => line.split(",")[3]);
    expect(actionColumn.slice(0, 3)).toEqual(["Entrada", "Salida", "Entrada"]);
    expect(csv).not.toContain("Presencia");
  });

  it("relabels the presence action in the history filter dropdown", async () => {
    const options = await getHistoryFilterOptions(tenant.id);
    const presenceOption = options.actionDefinitions.find((a) => a.id === presenceActionId);
    expect(presenceOption).toBeDefined();
    expect(presenceOption!.name).toBe(PRESENCE_FILTER_LABEL);
    expect(presenceOption!.name).toBe("Entrada / Salida");
    // Still ONE option, filtering by action_definition_id.
    expect(options.actionDefinitions.filter((a) => a.id === presenceActionId)).toHaveLength(1);
  });

  it("an inactive card stays out of the recinto even while flagged inside", async () => {
    await deactivateCard(card.id, { userId: USER_ID, tenantId: tenant.id });
    expect(await getPresenceOccupants(tenant.id)).toEqual([]);
  });

  it("an archived card stays out too", async () => {
    await archiveCard(card.id, { userId: USER_ID, tenantId: tenant.id });
    expect(await getPresenceOccupants(tenant.id)).toEqual([]);
  });

  it("archiving the CARD TYPE empties the recinto via the card cascade", async () => {
    const t2 = await createTenant({ name: `${PREFIX}Cascade` });
    const ct2 = await createCardType(t2.id, { name: `${PREFIX}CT2` });
    await enablePresenceControl(t2.id, ct2.id);
    const c2 = await createCard(ct2.id, t2.id, "X001", {});
    const [auto2] = await getAutoExecuteActions(ct2.id);
    await executeAction({
      cardId: c2.id,
      actionDefinitionId: auto2.id,
      tenantId: t2.id,
      executedBy: USER_ID,
    });
    expect(await getPresenceOccupants(t2.id)).toHaveLength(1);

    // Archiving a card type cascades its live cards to archived, and the
    // presence query filters on status='active'.
    await archiveCardType(ct2.id, { userId: USER_ID, tenantId: t2.id });
    expect(await getPresenceOccupants(t2.id)).toEqual([]);

    await deleteTenant(t2.id);
  });

  it("does not leak across tenants", async () => {
    const other = await createTenant({ name: `${PREFIX}Other` });
    expect(await getPresenceOccupants(other.id)).toEqual([]);
    expect(await tenantHasPresenceEnabled(other.id)).toBe(false);
    await deleteTenant(other.id);
  });

  it("disabling hides occupants without destroying their values", async () => {
    // Bring the card back and put it inside again.
    const fresh = await createCard(cardType.id, tenant.id, "P002", {});
    await fireAutoActions(fresh.id);
    expect(await getPresenceOccupants(tenant.id)).toHaveLength(1);

    await disablePresenceControl(tenant.id, cardType.id);

    expect(await tenantHasPresenceEnabled(tenant.id)).toBe(false);
    // The join goes through the now-null designation, so the query returns
    // nothing — but the stored value is untouched and audit-relevant.
    expect(await getPresenceOccupants(tenant.id)).toEqual([]);
    const stored = await db
      .select()
      .from(fieldValues)
      .where(eq(fieldValues.cardId, fresh.id));
    expect(stored.some((v) => v.valueBoolean === true)).toBe(true);

    // Re-enabling brings the same person straight back inside.
    await enablePresenceControl(tenant.id, cardType.id);
    const back = await getPresenceOccupants(tenant.id);
    expect(back).toHaveLength(1);
    expect(back[0].code).toBe("P002");
  });
});

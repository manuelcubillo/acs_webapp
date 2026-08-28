/**
 * The four write paths, end to end over a real Postgres.
 *
 * Asks the questions that actually matter for an audit log: does a repeated
 * scan stop creating snapshots, does a mutation create exactly one and chain
 * it, does a no-op save write nothing at all, and does each of these surface
 * where A2 says it should.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { asc, eq, like, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, cards, cardSnapshots, actionLogs } from "@/lib/db/schema";
import { createTenant, deleteTenant } from "@/lib/dal/tenants";
import { createCardType } from "@/lib/dal/card-types";
import { addFieldDefinition } from "@/lib/dal/field-definitions";
import { createActionDefinition } from "@/lib/dal/actions";
import { setCardTypeSummaryFields } from "@/lib/dal/dashboard-settings";
import { createCard, updateCard, updateCardCode } from "@/lib/dal/cards";
import { executeAction, logScanEntry } from "@/lib/dal/actions";
import { getActivityFeed } from "@/lib/dal/activity-feed";
import { getActionHistory, getActionHistoryForExport } from "@/lib/dal/action-history";
import type {
  Tenant,
  CardType,
  CardWithFields,
  FieldDefinition,
} from "@/lib/dal/types";
import type { CardSnapshotPayload } from "../payload";

// Disjoint from every other test file's prefix.
const PREFIX = "__test_writepath_";
const USER_ID = "00000000-0000-0000-0000-000000000001"; // seeded sentinel

let tenant: Tenant;
let cardType: CardType;
let nameField: FieldDefinition;
let counterField: FieldDefinition;
let card: CardWithFields;
let incrementActionId = "";

beforeAll(async () => {
  tenant = await createTenant({ name: `${PREFIX}T` });
  cardType = await createCardType(tenant.id, { name: `${PREFIX}Residente` });
  nameField = await addFieldDefinition(cardType.id, {
    name: "nombre",
    label: "Nombre",
    fieldType: "text",
    isRequired: false,
  });
  counterField = await addFieldDefinition(cardType.id, {
    name: "visitas",
    label: "Visitas",
    fieldType: "number",
    isRequired: false,
  });
  await setCardTypeSummaryFields(cardType.id, tenant.id, {
    fieldDefinitionIds: [nameField.id],
  });
  const inc = await createActionDefinition(cardType.id, {
    name: "Sumar visita",
    actionType: "increment",
    targetFieldDefinitionId: counterField.id,
    config: { amount: 1 },
  });
  incrementActionId = inc.id;

  card = await createCard(cardType.id, tenant.id, `${PREFIX}W001`, {
    [nameField.id]: "Ada",
    [counterField.id]: 0,
  });
});

afterAll(async () => {
  if (tenant) await deleteTenant(tenant.id);
  for (const t of await db.select().from(tenants).where(like(tenants.name, `${PREFIX}%`))) {
    await deleteTenant(t.id);
  }
});

async function snapshots() {
  return db
    .select()
    .from(cardSnapshots)
    .where(eq(cardSnapshots.cardId, card.id))
    .orderBy(asc(cardSnapshots.createdAt));
}

async function logs() {
  return db
    .select()
    .from(actionLogs)
    .where(eq(actionLogs.cardId, card.id))
    .orderBy(asc(actionLogs.executedAt));
}

/** Exactly what an operational scan does, minus the validation machinery. */
function scan() {
  return logScanEntry({
    cardId: card.id,
    tenantId: tenant.id,
    executedBy: USER_ID,
    metadata: { method: "operational_scan", cardCode: card.code },
  });
}

describe("createCard", () => {
  it("gives a new card a V0 from birth, and writes no log row", async () => {
    const rows = await snapshots();
    expect(rows).toHaveLength(1);
    expect(rows[0].previousSnapshotId).toBeNull();

    const [cardRow] = await db.select().from(cards).where(eq(cards.id, card.id));
    expect(cardRow.currentSnapshotId).toBe(rows[0].id);

    // Creation auditing is out of scope — no row, of any log_type.
    expect(await logs()).toHaveLength(0);
  });

  it("freezes the values the card was created with", async () => {
    const [v0] = await snapshots();
    const payload = v0.payload as CardSnapshotPayload;

    expect(payload.code).toBe(`${PREFIX}W001`);
    expect(payload.cardTypeName).toBe(`${PREFIX}Residente`);
    expect(payload.fields.find((f) => f.fieldDefinitionId === nameField.id)!.value).toBe("Ada");
    expect(payload.fields.find((f) => f.fieldDefinitionId === counterField.id)!.value).toBe(0);
  });
});

describe("repeated scans", () => {
  it("three scans of an unchanged card share ONE snapshot, none of them creating it", async () => {
    const [v0] = await snapshots();

    const a = await scan();
    const b = await scan();
    const c = await scan();

    expect(await snapshots()).toHaveLength(1); // still just V0
    for (const row of [a, b, c]) {
      expect(row.cardSnapshotId).toBe(v0.id);
      expect(row.snapshotCreated).toBe(false);
    }
  });
});

describe("executeAction", () => {
  it("creates a second snapshot chained to the first, and stamps the row that caused it", async () => {
    const before = await snapshots();

    const result = await executeAction({
      cardId: card.id,
      actionDefinitionId: incrementActionId,
      tenantId: tenant.id,
      executedBy: USER_ID,
    });

    const after = await snapshots();
    expect(after).toHaveLength(before.length + 1);

    const v1 = after[after.length - 1];
    expect(v1.previousSnapshotId).toBe(before[before.length - 1].id);
    expect(result.log.cardSnapshotId).toBe(v1.id);
    expect(result.log.snapshotCreated).toBe(true);

    // The snapshot describes the POST-action state.
    const payload = v1.payload as CardSnapshotPayload;
    expect(payload.fields.find((f) => f.fieldDefinitionId === counterField.id)!.value).toBe(1);
  });

  it("a later scan observes the new snapshot without creating one", async () => {
    const rows = await snapshots();
    const current = rows[rows.length - 1];

    const row = await scan();

    expect(row.cardSnapshotId).toBe(current.id);
    expect(row.snapshotCreated).toBe(false);
    expect(await snapshots()).toHaveLength(rows.length);
  });
});

describe("updateCard", () => {
  it("writes nothing when the save changes no value", async () => {
    const before = await snapshots();
    const logsBefore = await logs();

    // Exactly what the edit form submits: the seed map, wholesale, unchanged.
    await updateCard(card.code, tenant.id, {
      [nameField.id]: "Ada",
      [counterField.id]: 1,
    }, USER_ID);

    expect(await snapshots()).toHaveLength(before.length);
    expect(await logs()).toHaveLength(logsBefore.length);
  });

  it("creates a snapshot and one card_edit row when a value really changes", async () => {
    const before = await snapshots();

    await updateCard(card.code, tenant.id, {
      [nameField.id]: "Grace",
      [counterField.id]: 1,
    }, USER_ID);

    const after = await snapshots();
    expect(after).toHaveLength(before.length + 1);

    const edits = await db
      .select()
      .from(actionLogs)
      .where(and(eq(actionLogs.cardId, card.id), eq(actionLogs.logType, "card_edit")));

    expect(edits).toHaveLength(1);
    expect(edits[0].actionDefinitionId).toBeNull();
    expect(edits[0].executedBy).toBe(USER_ID);
    expect(edits[0].cardSnapshotId).toBe(after[after.length - 1].id);
    expect(edits[0].snapshotCreated).toBe(true);

    const payload = after[after.length - 1].payload as CardSnapshotPayload;
    expect(payload.fields.find((f) => f.fieldDefinitionId === nameField.id)!.value).toBe("Grace");
  });

  it("freezes the label as it stands, so a later rename does not rewrite history", async () => {
    const rows = await snapshots();
    const payload = rows[rows.length - 1].payload as CardSnapshotPayload;
    expect(payload.fields.find((f) => f.fieldDefinitionId === nameField.id)!.label).toBe("Nombre");
  });
});

describe("where a card_edit row is and is not visible", () => {
  it("is EXCLUDED from the activity feed, permanently", async () => {
    // Not a staging step: the feed answers "what is happening at the door right
    // now", and an administrator correcting a phone number is not a door event.
    const feed = await getActivityFeed(tenant.id, { limit: 100 });
    expect(feed.length).toBeGreaterThan(0); // the scans and the action are there
    expect(feed.map((e) => e.logType)).not.toContain("card_edit");
  });

  it("APPEARS in /history — the audit surface", async () => {
    const all = await getActionHistory(tenant.id, {}, { page: 1, pageSize: 50 });
    expect(all.data.map((e) => e.logType)).toContain("card_edit");
  });

  it("appears in the CSV export", async () => {
    const { entries } = await getActionHistoryForExport(tenant.id, {});
    expect(entries.map((e) => e.logType)).toContain("card_edit");
  });

  it("can be isolated, and excluded, by the log-type filter", async () => {
    const onlyEdits = await getActionHistory(
      tenant.id,
      { logTypes: ["card_edit"] },
      { page: 1, pageSize: 50 },
    );
    expect(onlyEdits.data.length).toBeGreaterThan(0);
    expect(new Set(onlyEdits.data.map((e) => e.logType))).toEqual(new Set(["card_edit"]));

    const noEdits = await getActionHistory(
      tenant.id,
      { logTypes: ["scan", "action"] },
      { page: 1, pageSize: 50 },
    );
    expect(noEdits.data.map((e) => e.logType)).not.toContain("card_edit");
  });

  it("an EMPTY log-type list matches nothing, not everything", async () => {
    const none = await getActionHistory(
      tenant.id,
      { logTypes: [] },
      { page: 1, pageSize: 50 },
    );
    expect(none.data).toEqual([]);
    expect(none.total).toBe(0);
  });

  it("the row is in the database exactly once", async () => {
    const edits = await db
      .select()
      .from(actionLogs)
      .where(and(eq(actionLogs.cardId, card.id), eq(actionLogs.logType, "card_edit")));

    expect(edits).toHaveLength(1);
  });
});

describe("updateCardCode versions the card", () => {
  /** A card of its own, so the counts above are unaffected. */
  let renamed: CardWithFields;

  beforeAll(async () => {
    renamed = await createCard(cardType.id, tenant.id, `${PREFIX}S002`, {
      [nameField.id]: "Rita",
    });
  });

  async function editsFor(cardId: string) {
    return db
      .select()
      .from(actionLogs)
      .where(and(eq(actionLogs.cardId, cardId), eq(actionLogs.logType, "card_edit")));
  }

  async function snapshotsFor(cardId: string) {
    return db
      .select()
      .from(cardSnapshots)
      .where(eq(cardSnapshots.cardId, cardId))
      .orderBy(asc(cardSnapshots.createdAt));
  }

  it("creates exactly one snapshot and one card_edit row for a rename", async () => {
    const before = await snapshotsFor(renamed.id);
    expect(before).toHaveLength(1); // the V0 createCard took

    await updateCardCode(renamed.id, tenant.id, `${PREFIX}S002B`, USER_ID);

    const after = await snapshotsFor(renamed.id);
    expect(after).toHaveLength(2);
    expect(after[1].previousSnapshotId).toBe(after[0].id);
    expect((after[1].payload as CardSnapshotPayload).code).toBe(`${PREFIX}S002B`);

    const edits = await editsFor(renamed.id);
    expect(edits).toHaveLength(1);
    expect(edits[0].cardSnapshotId).toBe(after[1].id);
    expect(edits[0].snapshotCreated).toBe(true);
    expect(edits[0].executedBy).toBe(USER_ID);
    expect(edits[0].actionDefinitionId).toBeNull();
  });

  it("writes nothing when the code is saved unchanged", async () => {
    const beforeSnapshots = (await snapshotsFor(renamed.id)).length;
    const beforeEdits = (await editsFor(renamed.id)).length;

    await updateCardCode(renamed.id, tenant.id, `${PREFIX}S002B`, USER_ID);

    expect(await snapshotsFor(renamed.id)).toHaveLength(beforeSnapshots);
    expect(await editsFor(renamed.id)).toHaveLength(beforeEdits);
  });

  it("re-points cards.current_snapshot_id at the new version", async () => {
    const [row] = await db.select().from(cards).where(eq(cards.id, renamed.id));
    const snaps = await snapshotsFor(renamed.id);
    expect(row.currentSnapshotId).toBe(snaps[snaps.length - 1].id);
  });
});

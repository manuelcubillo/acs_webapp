/**
 * A2's acceptance tests: what a reader SEES, over a real Postgres.
 *
 * Two claims, and neither can be checked in isolation:
 *
 *   1. `/history` reports each event's own values, and goes on doing so after
 *      the card and its field definitions have moved on.
 *   2. The feed's two producers agree. The dashboard builds a scan row locally
 *      from what the Server Action returned, and rebuilds it from the server on
 *      Refrescar. A scan whose auto-action decrements a balance from 10 to 9
 *      must read 10 both times — anything else means the operator watches the
 *      number change under them.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

const testCtx = vi.hoisted(() => ({
  userId: "",
  tenantId: "",
  role: "master" as const,
  memberId: "__test_readpath_member",
}));

vi.mock("@/lib/api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/auth")>();
  return {
    ...actual,
    requireOperator: async () => testCtx,
    requireAdmin: async () => testCtx,
    requireMaster: async () => testCtx,
  };
});

import { eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, fieldDefinitions, user } from "@/lib/db/schema";
import { createTenant, deleteTenant } from "@/lib/dal/tenants";
import { createCardType } from "@/lib/dal/card-types";
import { addFieldDefinition } from "@/lib/dal/field-definitions";
import { createActionDefinition } from "@/lib/dal/actions";
import { createCard, updateCard, getCardByCode } from "@/lib/dal/cards";
import { logScanEntry } from "@/lib/dal/actions";
import { setCardTypeSummaryFields } from "@/lib/dal/dashboard-settings";
import { getActionHistory, buildCsvFromEntries } from "@/lib/dal/action-history";
import { getActivityFeed } from "@/lib/dal/activity-feed";
import { executeScanWithAutoActionsAction } from "@/lib/actions/cards";
import { buildScanEntries } from "@/lib/dashboard/feed-entries";
import type { FeedBuilderConfig } from "@/lib/dashboard/feed-entries";
import type { Tenant, CardType, FieldDefinition, ActionHistoryEntry } from "@/lib/dal/types";

const PREFIX = "__test_readpath_";
const USER_ID = `${PREFIX}user`;

let tenant: Tenant;

beforeAll(async () => {
  tenant = await createTenant({ name: `${PREFIX}T` });
  testCtx.tenantId = tenant.id;
  testCtx.userId = USER_ID;

  await db
    .insert(user)
    .values({
      id: USER_ID,
      name: `${PREFIX}Operador`,
      email: `${PREFIX}op@example.test`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
});

afterAll(async () => {
  if (tenant) await deleteTenant(tenant.id);
  for (const t of await db.select().from(tenants).where(like(tenants.name, `${PREFIX}%`))) {
    await deleteTenant(t.id);
  }
  await db.delete(user).where(eq(user.id, USER_ID));
});

// ─── 1. /history reports each event's own values ─────────────────────────────

describe("/history shows the values of each event, not of today", () => {
  let cardType: CardType;
  let nombre: FieldDefinition;
  let telefono: FieldDefinition;
  let saldo: FieldDefinition;
  let rows: ActionHistoryEntry[] = [];

  beforeAll(async () => {
    cardType = await createCardType(tenant.id, { name: `${PREFIX}Socio` });
    nombre = await addFieldDefinition(cardType.id, {
      name: "nombre", label: "Nombre", fieldType: "text", isRequired: false,
    });
    telefono = await addFieldDefinition(cardType.id, {
      name: "telefono", label: "Teléfono", fieldType: "text", isRequired: false,
    });
    saldo = await addFieldDefinition(cardType.id, {
      name: "saldo", label: "Saldo", fieldType: "number", isRequired: false,
    });
    await setCardTypeSummaryFields(cardType.id, tenant.id, {
      fieldDefinitionIds: [nombre.id, saldo.id],
    });

    const card = await createCard(cardType.id, tenant.id, `${PREFIX}H001`, {
      [nombre.id]: "Ana",
      [telefono.id]: "600000000",
      [saldo.id]: 10,
    });

    // Scan → edit three fields → scan again.
    await logScanEntry({
      cardId: card.id, tenantId: tenant.id, executedBy: USER_ID,
      metadata: { method: "operational_scan", cardCode: card.code },
    });
    await updateCard(
      card.code,
      tenant.id,
      { [nombre.id]: "Ana María", [telefono.id]: "611111111", [saldo.id]: 25 },
      USER_ID,
    );
    await logScanEntry({
      cardId: card.id, tenantId: tenant.id, executedBy: USER_ID,
      metadata: { method: "operational_scan", cardCode: card.code },
    });

    // AFTER the fact: rename a field definition. Nothing above may move.
    await db
      .update(fieldDefinitions)
      .set({ label: "Nombre completo" })
      .where(eq(fieldDefinitions.id, nombre.id));

    const page = await getActionHistory(tenant.id, {}, { page: 1, pageSize: 50 });
    // Newest first → [second scan, edit, first scan].
    rows = page.data;
  });

  const valueOf = (row: ActionHistoryEntry, fieldId: string) =>
    row.summaryFields.find((f) => f.fieldDefinitionId === fieldId)?.value;

  it("returns the three rows, newest first", () => {
    expect(rows.map((r) => r.logType)).toEqual(["scan", "card_edit", "scan"]);
  });

  it("the FIRST scan still reports the values it observed", () => {
    const firstScan = rows[2];
    expect(valueOf(firstScan, nombre.id)).toBe("Ana");
    expect(valueOf(firstScan, saldo.id)).toBe(10);
    // It observed the card; it did not change it.
    expect(firstScan.snapshotCreated).toBe(false);
    expect(firstScan.snapshotChanges).toEqual([]);
  });

  it("the EDIT row reports exactly the three fields it changed", () => {
    const edit = rows[1];
    expect(edit.snapshotCreated).toBe(true);

    const byId = new Map(edit.snapshotChanges.map((c) => [c.fieldDefinitionId, c]));
    expect(edit.snapshotChanges).toHaveLength(3);
    expect(byId.get(nombre.id)).toMatchObject({ before: "Ana", after: "Ana María" });
    expect(byId.get(telefono.id)).toMatchObject({
      before: "600000000",
      after: "611111111",
    });
    expect(byId.get(saldo.id)).toMatchObject({ before: 10, after: 25 });
  });

  it("the SECOND scan reports the new values, and no detail", () => {
    const secondScan = rows[0];
    expect(valueOf(secondScan, nombre.id)).toBe("Ana María");
    expect(valueOf(secondScan, saldo.id)).toBe(25);
    expect(secondScan.snapshotChanges).toEqual([]);
  });

  it("renaming a field definition afterwards changed none of the three", () => {
    // The definition now says "Nombre completo"; every row still says "Nombre",
    // because the label was frozen into each payload when it was written.
    for (const row of rows) {
      const sf = row.summaryFields.find((f) => f.fieldDefinitionId === nombre.id);
      expect(sf?.label).toBe("Nombre");
    }
    const edit = rows[1];
    expect(
      edit.snapshotChanges.find((c) => c.fieldDefinitionId === nombre.id)?.label,
    ).toBe("Nombre");
  });

  it("the CSV export carries the same three changes in one cell", () => {
    const csv = buildCsvFromEntries(rows);
    // One change per line inside a quoted cell, so a spreadsheet reads it as one.
    expect(csv).toContain("Nombre: Ana → Ana María");
    expect(csv).toContain("Teléfono: 600000000 → 611111111");
    expect(csv).toContain("Saldo: 10 → 25");
    // Ordered for reading — by label, not by the payload's UUID order — and
    // quoted, because a multi-line cell that is not quoted is a malformed file.
    expect(csv).toContain(
      '"Nombre: Ana → Ana María\nSaldo: 10 → 25\nTeléfono: 600000000 → 611111111"',
    );
  });
});

// ─── 2. The feed's two producers agree ───────────────────────────────────────

describe("the feed's two producers agree about a scan row", () => {
  let cardType: CardType;
  let saldo: FieldDefinition;
  let feedConfig: FeedBuilderConfig;
  const CODE = `${PREFIX}F001`;

  beforeAll(async () => {
    cardType = await createCardType(tenant.id, { name: `${PREFIX}Bono` });
    saldo = await addFieldDefinition(cardType.id, {
      name: "saldo", label: "Saldo", fieldType: "number", isRequired: false,
    });
    // The auto-action every scan triggers: 10 → 9.
    await createActionDefinition(cardType.id, {
      name: "Consumir viaje",
      actionType: "decrement",
      targetFieldDefinitionId: saldo.id,
      config: { amount: 1 },
      isAutoExecute: true,
    });
    await setCardTypeSummaryFields(cardType.id, tenant.id, {
      fieldDefinitionIds: [saldo.id],
    });
    await createCard(cardType.id, tenant.id, CODE, { [saldo.id]: 10 });

    feedConfig = {
      cardTypeNames: { [cardType.id]: cardType.name },
      summaryFields: {
        [cardType.id]: [
          { fieldDefinitionId: saldo.id, label: "Saldo", fieldType: "number" },
        ],
      },
      presenceActionIds: {},
    };
  });

  it("both read 10 on the scan row, and 9 on the action row", async () => {
    const result = await executeScanWithAutoActionsAction(CODE);
    expect(result.success).toBe(true);
    if (!result.success) return;

    // The card the action returns is the FINAL state — this is the trap.
    const finalValue = result.data.card.fields.find(
      (f) => f.fieldDefinitionId === saldo.id,
    )?.value;
    expect(finalValue).toBe(9);

    // ── Producer A: the client, immediately after the scan ──────────────────
    const local = buildScanEntries({
      card: result.data.card,
      autoActions: result.data.autoActions,
      config: feedConfig,
      visibility: { showScanEntries: true, showActionEntries: true, feedLimit: 20 },
      scanLogId: result.data.scanLogId,
      scanSnapshotId: result.data.scanSnapshotId,
      snapshots: result.data.snapshots,
    });

    const localScan = local.find((e) => e.logType === "scan")!;
    const localAction = local.find((e) => e.logType === "action")!;
    expect(localScan.summaryFields[0].value).toBe(10);
    expect(localAction.summaryFields[0].value).toBe(9);

    // ── Producer B: the server, on Refrescar ────────────────────────────────
    const card = await getCardByCode(CODE, tenant.id);
    const server = (await getActivityFeed(tenant.id, { limit: 50 })).filter(
      (e) => e.cardId === card.id,
    );

    const serverScan = server.find((e) => e.logType === "scan")!;
    const serverAction = server.find((e) => e.logType === "action")!;
    expect(serverScan.summaryFields[0].value).toBe(10);
    expect(serverAction.summaryFields[0].value).toBe(9);

    // The claim, stated directly: pressing Refrescar changes nothing.
    expect(localScan.summaryFields).toEqual(serverScan.summaryFields);
    expect(localAction.summaryFields).toEqual(serverAction.summaryFields);
  });
});

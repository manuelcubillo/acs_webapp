/**
 * Scan correlation: every auto-action a scan causes carries the scan row's id
 * in `metadata.scanLogId`, INCLUDING the ones a resumed override run executes.
 *
 * That last part is the whole reason the id round-trips through the client: a
 * pause waits on a human, so the resumed rows can be many seconds after the
 * scan and no time window could stitch them back together.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, like, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, actionLogs } from "@/lib/db/schema";
import { createTenant, deleteTenant } from "@/lib/dal/tenants";
import { createCardType } from "@/lib/dal/card-types";
import { addFieldDefinition } from "@/lib/dal/field-definitions";
import { createActionDefinition } from "@/lib/dal/actions";
import { createCard } from "@/lib/dal/cards";
import { executeAction, logScanEntry, getAutoExecuteActions } from "@/lib/dal/actions";
import { enablePresenceControl } from "@/lib/server/presence/provisioning";
import { SCAN_LOG_ID_METADATA_KEY, readScanLogId } from "@/lib/dal/metadata-keys";
import type { Tenant, CardType, CardWithFields } from "@/lib/dal/types";

const PREFIX = "__test_scancorr_";
const USER_ID = "00000000-0000-0000-0000-000000000001";

let tenant: Tenant;
let cardType: CardType;
let card: CardWithFields;

beforeAll(async () => {
  tenant = await createTenant({ name: `${PREFIX}T` });
  cardType = await createCardType(tenant.id, { name: `${PREFIX}CT` });
  const counter = await addFieldDefinition(cardType.id, {
    name: "visitas",
    label: "Visitas",
    fieldType: "number",
    isRequired: false,
  });
  // A second auto-action alongside presence, so grouping has more than one.
  await createActionDefinition(cardType.id, {
    name: "Contar visita",
    actionType: "increment",
    targetFieldDefinitionId: counter.id,
    config: { amount: 1 },
    isAutoExecute: true,
  });
  await enablePresenceControl(tenant.id, cardType.id);
  card = await createCard(cardType.id, tenant.id, "SC001", {});
});

afterAll(async () => {
  if (tenant) await deleteTenant(tenant.id);
  for (const t of await db.select().from(tenants).where(like(tenants.name, `${PREFIX}%`))) {
    await deleteTenant(t.id);
  }
});

/** Replays what executeScanWithAutoActionsAction does, without the auth layer. */
async function simulateScan(): Promise<string> {
  const scanLog = await logScanEntry({
    cardId: card.id,
    tenantId: tenant.id,
    executedBy: USER_ID,
    metadata: { method: "operational_scan", cardCode: card.code },
  });
  const correlation = { [SCAN_LOG_ID_METADATA_KEY]: scanLog.id };
  for (const def of await getAutoExecuteActions(cardType.id)) {
    await executeAction({
      cardId: card.id,
      actionDefinitionId: def.id,
      tenantId: tenant.id,
      executedBy: USER_ID,
      metadataExtra: correlation,
    });
  }
  return scanLog.id;
}

async function logsFor(tenantId: string) {
  return db
    .select()
    .from(actionLogs)
    .where(eq(actionLogs.tenantId, tenantId))
    .orderBy(asc(actionLogs.executedAt));
}

describe("scan correlation via metadata.scanLogId", () => {
  it("stamps every auto-action of one scan with that scan's log id", async () => {
    const scanLogId = await simulateScan();

    const logs = await logsFor(tenant.id);
    const scans = logs.filter((l) => l.logType === "scan");
    const actions = logs.filter((l) => l.logType === "action");

    expect(scans).toHaveLength(1);
    expect(scans[0].id).toBe(scanLogId);
    expect(actions).toHaveLength(2);
    for (const a of actions) {
      expect(readScanLogId(a.metadata)).toBe(scanLogId);
    }
    // The scan row itself is NOT self-correlated — it is the group's anchor.
    expect(readScanLogId(scans[0].metadata)).toBeNull();
  });

  it("a resumed override run reuses the ORIGINAL scan's id", async () => {
    const before = (await logsFor(tenant.id)).length;

    // Pause: scan logged, no auto-actions run yet.
    const scanLog = await logScanEntry({
      cardId: card.id,
      tenantId: tenant.id,
      executedBy: USER_ID,
      metadata: { method: "operational_scan", cardCode: card.code },
    });

    // Confirm: the client hands the id back, and resume stamps it.
    const defs = await getAutoExecuteActions(cardType.id);
    for (const def of defs) {
      await executeAction({
        cardId: card.id,
        actionDefinitionId: def.id,
        tenantId: tenant.id,
        executedBy: USER_ID,
        operatorOverride: true,
        overrideValidationErrors: ["forzado"],
        metadataExtra: { [SCAN_LOG_ID_METADATA_KEY]: scanLog.id },
      });
    }

    const logs = (await logsFor(tenant.id)).slice(before);
    const resumed = logs.filter((l) => l.logType === "action");
    expect(resumed).toHaveLength(defs.length);
    for (const a of resumed) {
      expect(readScanLogId(a.metadata)).toBe(scanLog.id);
      // The override flag survives alongside the correlation — metadataExtra
      // is merged BEFORE the override branch, so it cannot clobber it.
      expect((a.metadata as Record<string, unknown>).operator_override).toBe(true);
    }
  });

  it("a manual action carries NO scanLogId — its absence is the definition", async () => {
    const before = (await logsFor(tenant.id)).length;
    // Auto-actions come back ordered by position, and the counter was created
    // first — pick the toggle explicitly rather than by index.
    const defs = await getAutoExecuteActions(cardType.id);
    const def = defs.find((d) => d.actionType === "toggle")!;
    expect(def).toBeDefined();

    await executeAction({
      cardId: card.id,
      actionDefinitionId: def.id,
      tenantId: tenant.id,
      executedBy: USER_ID,
    });

    const logs = (await logsFor(tenant.id)).slice(before);
    expect(logs).toHaveLength(1);
    expect(readScanLogId(logs[0].metadata)).toBeNull();
    // The ordinary keys are untouched.
    const md = logs[0].metadata as Record<string, unknown>;
    expect(md.action_type).toBe("toggle");
    expect(md).toHaveProperty("after_value");
  });

  it("metadataExtra cannot overwrite operator_override", async () => {
    const before = (await logsFor(tenant.id)).length;
    const [def] = await getAutoExecuteActions(cardType.id);

    await executeAction({
      cardId: card.id,
      actionDefinitionId: def.id,
      tenantId: tenant.id,
      executedBy: USER_ID,
      operatorOverride: true,
      overrideValidationErrors: ["x"],
      // A caller trying to spoof the audit flag off.
      metadataExtra: { operator_override: false },
    });

    const logs = (await logsFor(tenant.id)).slice(before);
    expect((logs[0].metadata as Record<string, unknown>).operator_override).toBe(true);
  });
});

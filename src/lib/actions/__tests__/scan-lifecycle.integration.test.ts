/**
 * Integration tests for phase-2 scan / action behaviour by lifecycle status.
 *
 * These exercise the real server actions and the external API route handlers
 * against a real Postgres (Dockerized `acs_test`, same harness as
 * `src/lib/server/lifecycle/__tests__/lifecycle.integration.test.ts`), because
 * the behaviour under test spans the DAL, the gate and the logging rules.
 *
 * The session guards (`requireOperator` etc.) are mocked to a fixed test
 * context — there is no HTTP request in a unit runner. The external API routes
 * authenticate by the `x-tenant-id` header, so they need no mock.
 *
 * Covered:
 *  1. Operational pipeline: archived denied (scan still logged, no actions);
 *     inactive paused (override on) / blocked (override off); active runs.
 *  2. resumeAutoActionsAction: override continues + logs the lifecycle reason;
 *     archived refuses.
 *  3. Manual executeActionAction gated server-side in all cases.
 *  4. validateBeforeActionAction returns the lifecycle gate.
 *  5. External API GET / execute deny archived and block inactive.
 *  6. The informational lookup logs nothing.
 *
 * WARNING: creates and deletes real data, prefixed `__test_scanlc_`.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { config } from "dotenv";

// Load env before any import that touches DATABASE_URL (db is a lazy proxy, so
// this runs in time for the first query inside the tests).
config({ path: ".env.test.local" });
config({ path: ".env.local" });

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DB_DRIVER = "local";
}

// `server-only` is a Next.js build guard with no standalone package; stub it so
// the DAL's photo-url helpers (transitively imported) load under the runner.
vi.mock("server-only", () => ({}));

// Shared, mutable auth context filled in beforeAll and returned by the mocked
// guards at call time.
const testCtx = vi.hoisted(() => ({
  userId: "",
  tenantId: "",
  role: "master" as const,
  memberId: "__test_scanlc_member",
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

import { eq, and, like, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { tenants, cards, actionLogs, user } from "@/lib/db/schema";
import { createTenant } from "@/lib/dal/tenants";
import { createCardType } from "@/lib/dal/card-types";
import { addFieldDefinition } from "@/lib/dal/field-definitions";
import { createActionDefinition } from "@/lib/dal/actions";
import { createCard } from "@/lib/dal/cards";
import { upsertDashboardSettings } from "@/lib/dal/dashboard-settings";
import { archiveCard } from "@/lib/server/lifecycle";
import { LIFECYCLE_SCAN_MESSAGES } from "@/lib/validation/messages";
import type { Tenant, CardType, Card } from "@/lib/dal/types";

import {
  executeScanWithAutoActionsAction,
  resumeAutoActionsAction,
  validateBeforeActionAction,
  getCardByCodeAction,
} from "@/lib/actions/cards";
import { executeActionAction } from "@/lib/actions/actions";

import { GET as apiGetCard } from "@/app/api/cards/[code]/route";
import { POST as apiExecute } from "@/app/api/cards/[code]/actions/[actionDefinitionId]/execute/route";

const PREFIX = "__test_scanlc_";
const USER_ID = `${PREFIX}user`;

let tenant: Tenant;
let cardType: CardType;
let numberFieldId: string;
let autoActionId: string;

/**
 * Create a card in a given status. Archived goes through the lifecycle service
 * so the trash-metadata CHECK constraint is satisfied; inactive/expired can be
 * set directly (that constraint only governs archived rows).
 */
async function makeCard(code: string, status: Card["status"] = "active"): Promise<Card> {
  const card = await createCard(cardType.id, tenant.id, `${PREFIX}${code}`, {});
  if (status === "archived") {
    await archiveCard(card.id, { userId: USER_ID, tenantId: tenant.id });
  } else if (status !== "active") {
    await db.update(cards).set({ status }).where(eq(cards.id, card.id));
  }
  const [row] = await db.select().from(cards).where(eq(cards.id, card.id)).limit(1);
  return row;
}

/** Read this card's non-lifecycle logs (scans and actions). */
async function scanActionLogs(cardId: string) {
  return db
    .select()
    .from(actionLogs)
    .where(
      and(eq(actionLogs.cardId, cardId), inArray(actionLogs.logType, ["scan", "action"])),
    );
}

/** Build a NextRequest carrying the tenant header the external API expects. */
function apiRequest(): NextRequest {
  return new NextRequest("http://localhost/api/cards", {
    headers: { "x-tenant-id": tenant.id },
  });
}

async function setOverride(allow: boolean) {
  await upsertDashboardSettings(tenant.id, { allowOverrideOnError: allow });
}

beforeAll(async () => {
  await db
    .insert(user)
    .values({
      id: USER_ID,
      name: "Scan Lifecycle Test",
      email: `${PREFIX}user@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  tenant = await createTenant({ name: `${PREFIX}Tenant` });
  testCtx.userId = USER_ID;
  testCtx.tenantId = tenant.id;

  cardType = await createCardType(tenant.id, { name: `${PREFIX}Type` });

  const numberField = await addFieldDefinition(cardType.id, {
    name: "credits",
    label: "Credits",
    fieldType: "number",
  });
  numberFieldId = numberField.id;

  const action = await createActionDefinition(cardType.id, {
    name: "Add credit",
    actionType: "increment",
    targetFieldDefinitionId: numberFieldId,
    config: { amount: 1 },
    isAutoExecute: true,
  });
  autoActionId = action.id;
});

beforeEach(async () => {
  // Deleting cards cascades to their action_logs (phase-1 CASCADE FK), so each
  // test starts with no cards and no logs. Default override off.
  await db.delete(cards).where(eq(cards.tenantId, tenant.id));
  await setOverride(false);
});

afterAll(async () => {
  await db.delete(tenants).where(like(tenants.name, `${PREFIX}%`));
  await db.delete(user).where(eq(user.id, USER_ID));
});

// ─── 1. Operational pipeline ─────────────────────────────────────────────────

describe("executeScanWithAutoActionsAction", () => {
  it("runs auto-actions for an active card", async () => {
    const c = await makeCard("P1", "active");

    const res = await executeScanWithAutoActionsAction(`${PREFIX}P1`);
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.lifecycleGate.outcome).toBe("allowed");
    expect(res.data.autoActions).toHaveLength(1);
    expect(res.data.autoActions[0].success).toBe(true);
    expect(res.data.pausedForConfirmation).toBe(false);

    const logs = await scanActionLogs(c.id);
    expect(logs.filter((l) => l.logType === "scan")).toHaveLength(1);
    expect(logs.filter((l) => l.logType === "action")).toHaveLength(1);
  });

  it("hard-denies an archived card: no actions, but the scan is still logged", async () => {
    await setOverride(true); // even with override on, archived is denied
    const c = await makeCard("P2", "archived");

    const res = await executeScanWithAutoActionsAction(`${PREFIX}P2`);
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.lifecycleGate.outcome).toBe("denied_archived");
    expect(res.data.autoActions).toHaveLength(0);
    expect(res.data.pausedForConfirmation).toBe(false);
    expect(res.data.hasBlockingErrors).toBe(true);

    const logs = await scanActionLogs(c.id);
    expect(logs.filter((l) => l.logType === "scan")).toHaveLength(1);
    expect(logs.filter((l) => l.logType === "action")).toHaveLength(0);
  });

  it("pauses an inactive card for override when the tenant allows it", async () => {
    await setOverride(true);
    const c = await makeCard("P3", "inactive");

    const res = await executeScanWithAutoActionsAction(`${PREFIX}P3`);
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.lifecycleGate.outcome).toBe("requires_override");
    expect(res.data.pausedForConfirmation).toBe(true);
    expect(res.data.pendingAutoActionIds).toContain(autoActionId);
    expect(res.data.autoActions).toHaveLength(0);
    expect(
      res.data.pauseValidationErrors?.some((e) => e.rule === "lifecycle_status"),
    ).toBe(true);

    // Scan logged, but no action ran.
    const logs = await scanActionLogs(c.id);
    expect(logs.filter((l) => l.logType === "scan")).toHaveLength(1);
    expect(logs.filter((l) => l.logType === "action")).toHaveLength(0);
  });

  it("blocks an inactive card without a modal when override is off", async () => {
    await setOverride(false);
    const c = await makeCard("P4", "inactive");

    const res = await executeScanWithAutoActionsAction(`${PREFIX}P4`);
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.lifecycleGate.outcome).toBe("blocked");
    expect(res.data.pausedForConfirmation).toBe(false);
    expect(res.data.hasBlockingErrors).toBe(true);
    expect(res.data.autoActions).toHaveLength(0);

    const logs = await scanActionLogs(c.id);
    expect(logs.filter((l) => l.logType === "scan")).toHaveLength(1);
    expect(logs.filter((l) => l.logType === "action")).toHaveLength(0);
  });

  it("treats expired exactly like inactive", async () => {
    await setOverride(true);
    await makeCard("P5", "expired");

    const res = await executeScanWithAutoActionsAction(`${PREFIX}P5`);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.lifecycleGate.outcome).toBe("requires_override");
    expect(res.data.pausedForConfirmation).toBe(true);
  });
});

// ─── 2. Resume ───────────────────────────────────────────────────────────────

describe("resumeAutoActionsAction", () => {
  it("continues a lifecycle-paused flow and logs the override reason", async () => {
    await setOverride(true);
    const c = await makeCard("R1", "inactive");

    const res = await resumeAutoActionsAction({
      cardCode: `${PREFIX}R1`,
      pendingActionIds: [autoActionId],
      overrideValidationErrors: [LIFECYCLE_SCAN_MESSAGES.inactive],
    });
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.autoActions).toHaveLength(1);
    expect(res.data.autoActions[0].success).toBe(true);

    const actions = (await scanActionLogs(c.id)).filter((l) => l.logType === "action");
    expect(actions).toHaveLength(1);
    const meta = actions[0].metadata as Record<string, unknown>;
    expect(meta.operator_override).toBe(true);
    expect(meta.override_validation_errors).toContain(LIFECYCLE_SCAN_MESSAGES.inactive);
  });

  it("refuses to resume on an archived card", async () => {
    await setOverride(true);
    await makeCard("R2", "archived");

    const res = await resumeAutoActionsAction({
      cardCode: `${PREFIX}R2`,
      pendingActionIds: [autoActionId],
      overrideValidationErrors: [],
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.code).toBe("CARD_ARCHIVED");
  });
});

// ─── 3. Manual action gate (server-side) ─────────────────────────────────────

describe("executeActionAction lifecycle gate", () => {
  it("executes on an active card", async () => {
    const c = await makeCard("M1", "active");
    const res = await executeActionAction({ cardId: c.id, actionDefinitionId: autoActionId });
    expect(res.success).toBe(true);
  });

  it("denies an archived card", async () => {
    const c = await makeCard("M2", "archived");
    const res = await executeActionAction({ cardId: c.id, actionDefinitionId: autoActionId });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.code).toBe("CARD_ARCHIVED");
  });

  it("blocks an inactive card when override is off", async () => {
    await setOverride(false);
    const c = await makeCard("M3", "inactive");
    const res = await executeActionAction({ cardId: c.id, actionDefinitionId: autoActionId });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.code).toBe("LIFECYCLE_BLOCKED");
  });

  it("requires the override flag on an inactive card when override is on", async () => {
    await setOverride(true);
    const c = await makeCard("M4", "inactive");

    const denied = await executeActionAction({ cardId: c.id, actionDefinitionId: autoActionId });
    expect(denied.success).toBe(false);
    if (denied.success) return;
    expect(denied.code).toBe("OVERRIDE_REQUIRED");

    const ok = await executeActionAction({
      cardId: c.id,
      actionDefinitionId: autoActionId,
      operatorOverride: true,
    });
    expect(ok.success).toBe(true);

    const actions = (await scanActionLogs(c.id)).filter((l) => l.logType === "action");
    expect(actions).toHaveLength(1);
    const meta = actions[0].metadata as Record<string, unknown>;
    expect(meta.operator_override).toBe(true);
    expect(meta.override_validation_errors).toContain(LIFECYCLE_SCAN_MESSAGES.inactive);
  });
});

// ─── 4. validateBeforeActionAction ───────────────────────────────────────────

describe("validateBeforeActionAction", () => {
  it("returns the lifecycle gate for the card", async () => {
    await setOverride(true);
    const c = await makeCard("V1", "inactive");
    const res = await validateBeforeActionAction(c.id);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.lifecycleGate.outcome).toBe("requires_override");
  });
});

// ─── 5. External API ─────────────────────────────────────────────────────────

describe("external API lifecycle gate", () => {
  it("GET denies an archived card with 403", async () => {
    await makeCard("A1", "archived");
    const res = await apiGetCard(apiRequest(), {
      params: Promise.resolve({ code: `${PREFIX}A1` }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("CARD_ARCHIVED");
  });

  it("GET returns an inactive card normally (200)", async () => {
    await makeCard("A2", "inactive");
    const res = await apiGetCard(apiRequest(), {
      params: Promise.resolve({ code: `${PREFIX}A2` }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("execute denies an archived card with 403", async () => {
    await makeCard("A3", "archived");
    const res = await apiExecute(apiRequest(), {
      params: Promise.resolve({ code: `${PREFIX}A3`, actionDefinitionId: autoActionId }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("CARD_ARCHIVED");
  });

  it("execute blocks an inactive card with 422 (no interactive override)", async () => {
    await makeCard("A4", "inactive");
    const res = await apiExecute(apiRequest(), {
      params: Promise.resolve({ code: `${PREFIX}A4`, actionDefinitionId: autoActionId }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("CARD_INACTIVE");
  });

  it("execute runs on an active card (201)", async () => {
    const c = await makeCard("A5", "active");
    const res = await apiExecute(apiRequest(), {
      params: Promise.resolve({ code: `${PREFIX}A5`, actionDefinitionId: autoActionId }),
    });
    expect(res.status).toBe(201);

    const actions = (await scanActionLogs(c.id)).filter((l) => l.logType === "action");
    expect(actions).toHaveLength(1);
  });
});

// ─── 6. Informational path logs nothing ──────────────────────────────────────

describe("informational lookup", () => {
  it("getCardByCodeAction never logs a scan or action", async () => {
    const c = await makeCard("I1", "active");
    const res = await getCardByCodeAction(`${PREFIX}I1`);
    expect(res.success).toBe(true);
    expect(await scanActionLogs(c.id)).toHaveLength(0);
  });
});

/**
 * Unit tests for the invitation accounting strategy.
 *
 * Pure logic plus a fake `ActionStrategyContext` — no database. The context is
 * a plain object because `ActionStrategyContext` is an interface over three
 * helper functions; faking it exercises the real `handleAction` dispatch,
 * balance reads, auxiliary writes and metadata, which is where the rules meet
 * the edges.
 *
 * The cases pinned here are the ones that break SILENTLY: the timezone
 * boundary in both DST offsets, the settlements that deliberately leave the
 * TARGET field unchanged, unmarked legacy rows, and the promise that a
 * standard tenant is untouched.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import type { Card } from "@/lib/dal/types";
import type {
  ActionHistoryRecord,
  ActionStrategyContext,
  GetCardActionHistoryOptions,
  StrategyAction,
} from "../types";
import { StandardActionStrategy } from "../standard-strategy";
import {
  InvitationActionStrategy,
  countSettlements,
  decideEntry,
  decideExit,
  readSettlement,
  resolveLocalMoment,
  resolveSlot,
  toBalance,
} from "../invitation-strategy";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Must mirror INVITATION_CONFIG in the strategy (it is intentionally private). */
const INVITATIONS_FIELD = "d48eec1b-2de1-4342-9e23-43da269db1f8";
const HALF_FIELD = "4fbac0d2-6820-4921-b1f7-5be35b2abab7";
const ENTRY_ACTION = "dd2461c6-fadd-4f98-91e0-571184747e9c";
const EXIT_ACTION = "5cd7a02f-f9a1-4a85-9406-a1022897a3c9";

/** 2026-08-27 10:00 Madrid (CEST, UTC+2) — a MORNING instant. */
const MORNING_INSTANT = new Date("2026-08-27T08:00:00Z");
/** 2026-08-27 16:00 Madrid (CEST) — an AFTERNOON instant. */
const AFTERNOON_INSTANT = new Date("2026-08-27T14:00:00Z");

const MORNING = { date: "2026-08-27", slot: "MORNING" } as const;
const AFTERNOON = { date: "2026-08-27", slot: "AFTERNOON" } as const;

/** Build a decoded log row carrying (or missing) a settlement marker. */
function logRow(
  executedAt: Date,
  settlement: string | undefined,
  actionDefinitionId = ENTRY_ACTION,
): ActionHistoryRecord {
  return {
    id: `log-${executedAt.toISOString()}-${settlement ?? "none"}`,
    logType: "action",
    actionDefinitionId,
    actionType: "decrement",
    targetField: "invitations",
    beforeValue: null,
    afterValue: null,
    operatorOverride: false,
    executedAt,
    executedBy: null,
    // A row written before this strategy shipped has metadata but no marker.
    metadata: settlement === undefined ? {} : { invitationSettlement: settlement },
  };
}

interface FakeContextOptions {
  actionId: string;
  /** Defaults to the configured INVITATIONS field. */
  targetFieldId?: string;
  actionType?: StrategyAction["actionType"];
  config?: Record<string, unknown> | null;
  invitations?: number | null;
  halfInvitations?: number | null;
  /** Prior log rows, keyed by the action definition they belong to. */
  history?: ActionHistoryRecord[];
}

interface FakeContext {
  ctx: ActionStrategyContext;
  writes: Array<{ fieldId: string; value: unknown }>;
}

/**
 * Build a context that records auxiliary writes so a test can assert which
 * field actually moved.
 */
function fakeContext(options: FakeContextOptions): FakeContext {
  const {
    actionId,
    targetFieldId = INVITATIONS_FIELD,
    actionType = "decrement",
    config = { amount: 1 },
    invitations = 0,
    halfInvitations = 0,
    history = [],
  } = options;

  const writes: Array<{ fieldId: string; value: unknown }> = [];

  const ctx: ActionStrategyContext = {
    tenantId: "tenant-1",
    card: { id: "card-1", code: "C-001" } as Card,
    action: {
      id: actionId,
      actionType,
      config,
      targetField: {
        id: targetFieldId,
        name: targetFieldId === INVITATIONS_FIELD ? "invitations" : "otro_campo",
        label: "Invitaciones",
        fieldType: "number",
      },
    },
    // executeAction passes the TARGET field's current value.
    currentValue: targetFieldId === INVITATIONS_FIELD ? invitations : 0,
    executedBy: "user-1",
    getCardActionHistory: async (opts: GetCardActionHistoryOptions = {}) =>
      history.filter(
        (r) =>
          (!opts.actionDefinitionId ||
            r.actionDefinitionId === opts.actionDefinitionId) &&
          (!opts.logType || r.logType === opts.logType),
      ),
    readField: async (fieldDefinitionId: string) => {
      if (fieldDefinitionId === INVITATIONS_FIELD) return invitations;
      if (fieldDefinitionId === HALF_FIELD) return halfInvitations;
      return null;
    },
    setFieldValue: async (fieldDefinitionId: string, value: unknown) => {
      writes.push({ fieldId: fieldDefinitionId, value });
    },
  };

  return { ctx, writes };
}

afterEach(() => {
  vi.restoreAllMocks();
  // The exit tests pin the clock with `vi.setSystemTime` — without this a
  // faked "now" leaks into every test that follows.
  vi.useRealTimers();
});

// ─── Slot resolution ─────────────────────────────────────────────────────────

describe("resolveLocalMoment — Europe/Madrid, never UTC", () => {
  it("puts 14:59 local in MORNING and 15:00 local in AFTERNOON (CEST, UTC+2)", () => {
    expect(resolveLocalMoment(new Date("2026-08-27T12:59:00Z")).slot).toBe("MORNING");
    expect(resolveLocalMoment(new Date("2026-08-27T13:00:00Z")).slot).toBe("AFTERNOON");
  });

  it("puts 14:59 local in MORNING and 15:00 local in AFTERNOON (CET, UTC+1)", () => {
    // The same UTC instants would fall on the other side of the boundary in
    // winter — this is the pair that catches a raw-UTC regression.
    expect(resolveLocalMoment(new Date("2026-01-15T13:59:00Z")).slot).toBe("MORNING");
    expect(resolveLocalMoment(new Date("2026-01-15T14:00:00Z")).slot).toBe("AFTERNOON");
    expect(resolveLocalMoment(new Date("2026-01-15T13:00:00Z")).slot).toBe("MORNING");
  });

  it("counts 00:30 Madrid as the local day, not the previous UTC day", () => {
    // 2026-08-26T22:30Z is 2026-08-27 00:30 in Madrid.
    expect(resolveLocalMoment(new Date("2026-08-26T22:30:00Z"))).toEqual({
      date: "2026-08-27",
      slot: "MORNING",
    });
  });

  it("treats midnight as hour 0, not hour 24 (hourCycle h23)", () => {
    // With `hour12: false` some locales render midnight as "24", which would
    // push every midnight execution into the AFTERNOON slot.
    expect(resolveSlot(0)).toBe("MORNING");
    expect(resolveLocalMoment(new Date("2026-08-26T22:00:00Z")).slot).toBe("MORNING");
  });

  it("splits the day at 15:00 exactly", () => {
    expect(resolveSlot(14)).toBe("MORNING");
    expect(resolveSlot(15)).toBe("AFTERNOON");
    expect(resolveSlot(23)).toBe("AFTERNOON");
  });
});

// ─── Balance coercion ────────────────────────────────────────────────────────

describe("toBalance", () => {
  it("reads an unset field as 0", () => {
    expect(toBalance(null)).toBe(0);
    expect(toBalance(undefined)).toBe(0);
  });

  it("rejects non-finite and non-numeric values", () => {
    expect(toBalance(NaN)).toBe(0);
    expect(toBalance(Infinity)).toBe(0);
    expect(toBalance("3")).toBe(0);
  });

  it("preserves a negative balance", () => {
    expect(toBalance(-2)).toBe(-2);
  });
});

// ─── R1 ──────────────────────────────────────────────────────────────────────

describe("decideEntry — R1", () => {
  it("R1.1 spends a half credit when one is available, leaving INVITATIONS alone", () => {
    expect(decideEntry({ invitations: 5, halfInvitations: 2 })).toEqual({
      settlement: "half_spent",
      next: { invitations: 5, halfInvitations: 1 },
    });
  });

  it("R1.2 spends a full invitation when no half credit remains", () => {
    expect(decideEntry({ invitations: 5, halfInvitations: 0 })).toEqual({
      settlement: "full_spent",
      next: { invitations: 4, halfInvitations: 0 },
    });
  });

  it("R1.2 interim: drives INVITATIONS negative when the balance is already 0", () => {
    // Accepted interim behaviour until R3 (insufficient-balance validation)
    // lands. If this test ever fails, R3 was implemented — update it, do not
    // "fix" the strategy back.
    expect(decideEntry({ invitations: 0, halfInvitations: 0 })).toEqual({
      settlement: "full_spent",
      next: { invitations: -1, halfInvitations: 0 },
    });
    expect(decideEntry({ invitations: -3, halfInvitations: 0 }).next.invitations).toBe(-4);
  });
});

// ─── R2 ──────────────────────────────────────────────────────────────────────

describe("decideExit — R2", () => {
  it("R2.3 refunds a half credit while the slot is under its cap", () => {
    expect(
      decideExit({ invitations: 4, halfInvitations: 0 }, { spent: 1, refunded: 0 }),
    ).toEqual({
      settlement: "half_refunded",
      next: { invitations: 4, halfInvitations: 1 },
    });
  });

  it("R2.4 refunds nothing once the cap is reached", () => {
    expect(
      decideExit({ invitations: 4, halfInvitations: 1 }, { spent: 1, refunded: 1 }),
    ).toEqual({
      settlement: "none",
      next: { invitations: 4, halfInvitations: 1 },
    });
  });

  it("R2.4 never refunds an entry that was itself paid with a half credit", () => {
    // A half_spent entry contributes 0 to `spent`, so the exit finds nothing
    // to refund against.
    expect(
      decideExit({ invitations: 5, halfInvitations: 1 }, { spent: 0, refunded: 0 }),
    ).toEqual({
      settlement: "none",
      next: { invitations: 5, halfInvitations: 1 },
    });
  });
});

// ─── Settlement markers ──────────────────────────────────────────────────────

describe("readSettlement", () => {
  it("reads back each of the four markers", () => {
    for (const s of ["full_spent", "half_spent", "half_refunded", "none"] as const) {
      expect(readSettlement(logRow(MORNING_INSTANT, s))).toBe(s);
    }
  });

  it("treats a legacy row with no marker as unmarked", () => {
    expect(readSettlement(logRow(MORNING_INSTANT, undefined))).toBeNull();
  });

  it("treats an unrecognised marker as unmarked", () => {
    expect(readSettlement(logRow(MORNING_INSTANT, "nonsense"))).toBeNull();
  });
});

describe("countSettlements — day + slot scoping", () => {
  const rows = [
    logRow(new Date("2026-08-27T08:00:00Z"), "full_spent"), // 10:00 MORNING
    logRow(new Date("2026-08-27T09:00:00Z"), "half_spent"), // 11:00 MORNING
    logRow(new Date("2026-08-27T14:00:00Z"), "full_spent"), // 16:00 AFTERNOON
    logRow(new Date("2026-08-26T08:00:00Z"), "full_spent"), // yesterday
    logRow(new Date("2026-08-27T09:30:00Z"), undefined), // legacy, unmarked
  ];

  it("counts only the requested marker, within the requested slot and day", () => {
    expect(countSettlements(rows, "full_spent", MORNING)).toBe(1);
    expect(countSettlements(rows, "full_spent", AFTERNOON)).toBe(1);
    expect(countSettlements(rows, "half_spent", MORNING)).toBe(1);
    expect(countSettlements(rows, "half_spent", AFTERNOON)).toBe(0);
  });

  it("excludes unmarked legacy rows, which under-refunds rather than over-refunds", () => {
    // The unmarked 11:30 row is invisible to `spent`, so an exit in that slot
    // will not refund against it. Under-refunding is recoverable by hand;
    // over-refunding hands out credits the tenant never sold.
    const legacyOnly = [logRow(new Date("2026-08-27T09:30:00Z"), undefined)];
    expect(countSettlements(legacyOnly, "full_spent", MORNING)).toBe(0);
  });

  it("ignores other days entirely", () => {
    expect(countSettlements(rows, "full_spent", { date: "2026-08-26", slot: "MORNING" })).toBe(1);
    expect(countSettlements(rows, "full_spent", { date: "2026-08-25", slot: "MORNING" })).toBe(0);
  });
});

// ─── Slot scenario ───────────────────────────────────────────────────────────

describe("refund cap — full slot scenario", () => {
  it("caps refunds at the number of full invitations spent in the slot", () => {
    // 2 full-paid entries, then 3 exits: two refund, the third finds the cap.
    let balances = { invitations: 2, halfInvitations: 0 };
    const settlements: string[] = [];

    for (let i = 0; i < 2; i++) {
      const d = decideEntry(balances);
      balances = d.next;
      settlements.push(d.settlement);
    }

    const spent = 2;
    let refunded = 0;
    for (let i = 0; i < 3; i++) {
      const d = decideExit(balances, { spent, refunded });
      balances = d.next;
      settlements.push(d.settlement);
      if (d.settlement === "half_refunded") refunded++;
    }

    expect(settlements).toEqual([
      "full_spent",
      "full_spent",
      "half_refunded",
      "half_refunded",
      "none",
    ]);
    expect(balances).toEqual({ invitations: 0, halfInvitations: 2 });
  });
});

// ─── handleAction — dispatch, writes and metadata ────────────────────────────

describe("handleAction — GUEST_ENTRY", () => {
  it("R1.2 decrements the TARGET field and writes nothing else", async () => {
    const { ctx, writes } = fakeContext({
      actionId: ENTRY_ACTION,
      invitations: 3,
      halfInvitations: 0,
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(result.newValue).toBe(2);
    expect(writes).toEqual([]);
    expect(result.metadata?.invitationSettlement).toBe("full_spent");
  });

  it("R1.1 leaves the TARGET field UNCHANGED and moves HALF_INVITATION instead", async () => {
    // The case most likely to be "fixed" into a bug: the action targets
    // INVITATIONS, so it looks like INVITATIONS must change. It must not.
    const { ctx, writes } = fakeContext({
      actionId: ENTRY_ACTION,
      invitations: 3,
      halfInvitations: 2,
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(result.newValue).toBe(3);
    expect(writes).toEqual([{ fieldId: HALF_FIELD, value: 1 }]);
    expect(result.metadata?.invitationSettlement).toBe("half_spent");
  });

  it("goes negative at zero balance (interim, pending R3)", async () => {
    const { ctx, writes } = fakeContext({
      actionId: ENTRY_ACTION,
      invitations: 0,
      halfInvitations: 0,
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(result.newValue).toBe(-1);
    expect(writes).toEqual([]);
    expect(result.metadata?.invitationSettlement).toBe("full_spent");
  });
});

describe("handleAction — GUEST_EXIT", () => {
  it("R2.3 leaves the TARGET field UNCHANGED and grants a half credit", async () => {
    vi.setSystemTime(MORNING_INSTANT);
    const { ctx, writes } = fakeContext({
      actionId: EXIT_ACTION,
      invitations: 2,
      halfInvitations: 0,
      history: [logRow(MORNING_INSTANT, "full_spent", ENTRY_ACTION)],
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(result.newValue).toBe(2);
    expect(writes).toEqual([{ fieldId: HALF_FIELD, value: 1 }]);
    expect(result.metadata?.invitationSettlement).toBe("half_refunded");
  });

  it("R2.4 logs `none` and writes nothing when the cap is reached", async () => {
    // The `none` row is deliberate: it is what makes the cap auditable, and
    // what a later exit in the same slot counts as `refunded`.
    vi.setSystemTime(MORNING_INSTANT);
    const { ctx, writes } = fakeContext({
      actionId: EXIT_ACTION,
      invitations: 2,
      halfInvitations: 1,
      history: [
        logRow(MORNING_INSTANT, "full_spent", ENTRY_ACTION),
        logRow(MORNING_INSTANT, "half_refunded", EXIT_ACTION),
      ],
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(result.newValue).toBe(2);
    expect(writes).toEqual([]);
    expect(result.metadata?.invitationSettlement).toBe("none");
  });

  it("never refunds an exit in a different slot than the entry", async () => {
    // Entry in the MORNING, exit in the AFTERNOON: the guest occupied both.
    vi.setSystemTime(AFTERNOON_INSTANT);
    const { ctx, writes } = fakeContext({
      actionId: EXIT_ACTION,
      invitations: 2,
      halfInvitations: 0,
      history: [logRow(MORNING_INSTANT, "full_spent", ENTRY_ACTION)],
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(result.newValue).toBe(2);
    expect(writes).toEqual([]);
    expect(result.metadata?.invitationSettlement).toBe("none");
  });

  it("does not refund against an unmarked legacy entry", async () => {
    vi.setSystemTime(MORNING_INSTANT);
    const { ctx, writes } = fakeContext({
      actionId: EXIT_ACTION,
      invitations: 2,
      halfInvitations: 0,
      history: [logRow(MORNING_INSTANT, undefined, ENTRY_ACTION)],
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(writes).toEqual([]);
    expect(result.metadata?.invitationSettlement).toBe("none");
  });
});

describe("handleAction — diagnostic metadata", () => {
  it("stamps the slot and local date alongside the settlement marker", async () => {
    vi.setSystemTime(AFTERNOON_INSTANT);
    const { ctx } = fakeContext({
      actionId: ENTRY_ACTION,
      invitations: 1,
      halfInvitations: 0,
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(result.metadata).toEqual({
      invitationSettlement: "full_spent",
      invitationSlot: "AFTERNOON",
      invitationDate: "2026-08-27",
    });
  });
});

// ─── Repointed-target guard ──────────────────────────────────────────────────

describe("handleAction — repointed target guard", () => {
  it("falls through to standard behaviour and warns when the target is not INVITATIONS", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ctx, writes } = fakeContext({
      actionId: ENTRY_ACTION,
      targetFieldId: "11111111-2222-3333-4444-555555555555",
      actionType: "decrement",
      config: { amount: 2 },
      invitations: 3,
      halfInvitations: 5,
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    // Standard decrement of the repointed target (currentValue 0 - amount 2),
    // no balance settlement, no marker.
    expect(result.newValue).toBe(-2);
    expect(result.metadata).toBeUndefined();
    expect(writes).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("[invitation-strategy]");
  });

  it("does not throw — a misconfiguration must never block the door", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ctx } = fakeContext({
      actionId: EXIT_ACTION,
      targetFieldId: "11111111-2222-3333-4444-555555555555",
    });

    await expect(InvitationActionStrategy.handleAction(ctx)).resolves.toBeDefined();
  });
});

// ─── Blast-radius guard ──────────────────────────────────────────────────────

describe("blast radius — every other action is untouched", () => {
  const OTHER_ACTION = "99999999-8888-7777-6666-555555555555";

  it("produces exactly what StandardActionStrategy produces", async () => {
    // The ADR's core promise: a tenant routed to this strategy still gets the
    // standard result for every action that is not GUEST_ENTRY / GUEST_EXIT,
    // and a standard tenant is entirely unaffected.
    const cases = [
      { actionType: "increment", config: { amount: 3 }, currentValue: 5 },
      { actionType: "decrement", config: { amount: 2 }, currentValue: 5 },
      { actionType: "increment", config: null, currentValue: 5 },
      { actionType: "check", config: null, currentValue: false },
      { actionType: "uncheck", config: null, currentValue: true },
      { actionType: "toggle", config: null, currentValue: null },
    ] as const;

    for (const c of cases) {
      const { ctx, writes } = fakeContext({
        actionId: OTHER_ACTION,
        actionType: c.actionType,
        config: c.config,
      });
      const withValue = { ...ctx, currentValue: c.currentValue };

      const custom = await InvitationActionStrategy.handleAction(withValue);
      const standard = await StandardActionStrategy.handleAction(withValue);

      expect(custom).toEqual(standard);
      // No settlement marker leaks onto an unrelated action's audit log.
      expect(custom.metadata).toBeUndefined();
      expect(writes).toEqual([]);
    }
  });

  it("reads no history and writes no auxiliary field for an unrelated action", async () => {
    const { ctx, writes } = fakeContext({ actionId: OTHER_ACTION });
    const historySpy = vi.fn(async () => []);
    const result = await InvitationActionStrategy.handleAction({
      ...ctx,
      getCardActionHistory: historySpy,
    });

    expect(historySpy).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
    expect(result.metadata).toBeUndefined();
  });
});

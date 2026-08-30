/**
 * Unit tests for the invitation accounting strategy.
 *
 * Pure logic plus a fake `ActionStrategyContext` — no database. The context is
 * a plain object because `ActionStrategyContext` is an interface over three
 * helper functions; faking it exercises the real `handleAction` dispatch,
 * balance reads, auxiliary writes and metadata, which is where the rules meet
 * the edges.
 *
 * The cases pinned here are the ones that break SILENTLY: the local-day
 * rollover in both DST offsets, the inclusive five-hour boundary, the
 * settlements that deliberately leave the TARGET field unchanged, unmarked
 * legacy rows, and the promise that a standard tenant is untouched.
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
  INVITATION_CONFIG,
  InvitationActionStrategy,
  buildRefundCounters,
  countSettlements,
  decideEntry,
  decideExit,
  earliestExecutedAt,
  readSettlement,
  resolveLocalDate,
  selectSettlements,
  toBalance,
  toFlag,
} from "../invitation-strategy";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Read from the strategy rather than re-declared: a config change must break
 *  these tests, not leave them green against ids nothing uses. */
const {
  invitationsFieldId: INVITATIONS_FIELD,
  halfInvitationFieldId: HALF_FIELD,
  purchaseModeFieldId: PURCHASE_FIELD,
  guestEntryActionId: ENTRY_ACTION,
  guestExitActionId: EXIT_ACTION,
} = INVITATION_CONFIG;

const HOUR_MS = 60 * 60 * 1000;

/** 2026-08-27 16:00 Madrid (CEST, UTC+2) — the instant the exit tests settle
 *  at. Late enough that five hours back is still the same local day, so the
 *  window and the day gate can be exercised independently. */
const NOW = new Date("2026-08-27T14:00:00Z");
/** NOW's local day — the date every window is scoped to. */
const TODAY = "2026-08-27";

/** An instant `hours` before NOW. Fractions are allowed. */
function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * HOUR_MS);
}

/** The window `buildRefundCounters` derives from NOW, for direct helper tests. */
const WINDOW = { date: TODAY, since: hoursAgo(5) } as const;

/** Build a decoded log row carrying (or missing) a settlement marker. */
function logRow(
  executedAt: Date,
  settlement: string | undefined,
  // Annotated because `INVITATION_CONFIG` is `as const`: without it the default
  // narrows the parameter to the entry action's literal id.
  actionDefinitionId: string = ENTRY_ACTION,
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
  /**
   * The "compra invitaciones" flag. `null` is the DEFAULT and is not a
   * placeholder: a card whose boolean field was never set has no `field_values`
   * row, so `readField` really does yield null there — which is exactly why
   * every pre-R4 test in this file keeps passing untouched.
   */
  purchaseMode?: boolean | null;
  /** Prior log rows, keyed by the action definition they belong to. */
  history?: ActionHistoryRecord[];
}

interface FakeContext {
  ctx: ActionStrategyContext;
  writes: Array<{ fieldId: string; value: unknown }>;
  /** Every `getCardActionHistory` call, so a test can assert none happened. */
  historyCalls: GetCardActionHistoryOptions[];
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
    purchaseMode = null,
    history = [],
  } = options;

  const writes: Array<{ fieldId: string; value: unknown }> = [];
  const historyCalls: GetCardActionHistoryOptions[] = [];

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
    getCardActionHistory: async (opts: GetCardActionHistoryOptions = {}) => {
      historyCalls.push(opts);
      return history.filter(
        (r) =>
          (!opts.actionDefinitionId ||
            r.actionDefinitionId === opts.actionDefinitionId) &&
          (!opts.logType || r.logType === opts.logType),
      );
    },
    readField: async (fieldDefinitionId: string) => {
      if (fieldDefinitionId === INVITATIONS_FIELD) return invitations;
      if (fieldDefinitionId === HALF_FIELD) return halfInvitations;
      if (fieldDefinitionId === PURCHASE_FIELD) return purchaseMode;
      return null;
    },
    setFieldValue: async (fieldDefinitionId: string, value: unknown) => {
      writes.push({ fieldId: fieldDefinitionId, value });
    },
  };

  return { ctx, writes, historyCalls };
}

afterEach(() => {
  vi.restoreAllMocks();
  // The exit tests pin the clock with `vi.setSystemTime` — without this a
  // faked "now" leaks into every test that follows.
  vi.useRealTimers();
});

// ─── Local day resolution ────────────────────────────────────────────────────

describe("resolveLocalDate — Europe/Madrid, never UTC", () => {
  it("rolls the day at Madrid midnight in summer (CEST, UTC+2)", () => {
    // 22:30Z is already 00:30 the next day in Madrid; 21:30Z is still 23:30.
    expect(resolveLocalDate(new Date("2026-08-26T22:30:00Z"))).toBe("2026-08-27");
    expect(resolveLocalDate(new Date("2026-08-26T21:30:00Z"))).toBe("2026-08-26");
  });

  it("rolls the day an hour later in winter (CET, UTC+1)", () => {
    // The pair that catches a raw-UTC regression: 22:30Z crosses midnight in
    // summer but not in winter.
    expect(resolveLocalDate(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-16");
    expect(resolveLocalDate(new Date("2026-01-15T22:30:00Z"))).toBe("2026-01-15");
  });

  it("zero-pads, so the paging loop can compare dates as strings", () => {
    // `collectSameDayExecutions` stops on `rowDate < today`. Two-digit month
    // and day are load-bearing there, not cosmetic.
    expect(resolveLocalDate(new Date("2026-01-05T12:00:00Z"))).toBe("2026-01-05");
    expect(resolveLocalDate(new Date("2026-01-05T12:00:00Z")) < "2026-01-06").toBe(
      true,
    );
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

describe("toFlag", () => {
  it("turns purchase mode on only for a real boolean true", () => {
    expect(toFlag(true)).toBe(true);
    expect(toFlag(false)).toBe(false);
  });

  it("reads an unset or unresolvable field as OFF, preserving R1/R2", () => {
    // Both of `readField`'s null paths — no `field_values` row, and an id that
    // matches no field definition — arrive here as null.
    expect(toFlag(null)).toBe(false);
    expect(toFlag(undefined)).toBe(false);
  });

  it("does not accept a truthy non-boolean", () => {
    // A boolean field cannot hold these, but this flag decides whether credits
    // ever come back, so the coercion refuses to guess.
    expect(toFlag("true")).toBe(false);
    expect(toFlag(1)).toBe(false);
    expect(toFlag({})).toBe(false);
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

// ─── R4 · purchase mode, pure rules ──────────────────────────────────────────

describe("decideEntry — R4.1 purchase mode", () => {
  it("marks a full-invitation entry `purchase_spent`, not `full_spent`", () => {
    expect(decideEntry({ invitations: 4, halfInvitations: 0 }, true)).toEqual({
      settlement: "purchase_spent",
      next: { invitations: 3, halfInvitations: 0 },
    });
  });

  it("still spends a half credit first — R4 changes the marker, not the cost", () => {
    expect(decideEntry({ invitations: 4, halfInvitations: 2 }, true)).toEqual({
      settlement: "half_spent",
      next: { invitations: 4, halfInvitations: 1 },
    });
  });

  it("defaults to duration accounting when the flag is omitted", () => {
    expect(decideEntry({ invitations: 4, halfInvitations: 0 }).settlement).toBe(
      "full_spent",
    );
  });
});

describe("decideExit — R4.2 purchase mode", () => {
  it("never refunds: null counters leave both balances identical", () => {
    const balances = { invitations: 4, halfInvitations: 2 };
    expect(decideExit(balances, null)).toEqual({
      settlement: "none",
      next: balances,
    });
  });

  it("refunds nothing where duration accounting would have refunded", () => {
    const balances = { invitations: 4, halfInvitations: 0 };
    expect(decideExit(balances, null).settlement).toBe("none");
    // Same balances, same call, duration accounting on — the contrast is the
    // point.
    expect(decideExit(balances, { spent: 1, refunded: 0 }).settlement).toBe(
      "half_refunded",
    );
  });
});

describe("countSettlements — R4 rows sit outside the refundable count", () => {
  it("does not count `purchase_spent` as a refundable entry", () => {
    const rows = [
      logRow(hoursAgo(1), "purchase_spent"),
      logRow(hoursAgo(1), "purchase_spent"),
      logRow(hoursAgo(1), "full_spent"),
    ];
    expect(countSettlements(rows, "full_spent", WINDOW)).toBe(1);
  });
});

// ─── R2 ──────────────────────────────────────────────────────────────────────

describe("decideExit — R2", () => {
  it("R2.4 refunds a half credit while the window is under its cap", () => {
    expect(
      decideExit({ invitations: 4, halfInvitations: 0 }, { spent: 1, refunded: 0 }),
    ).toEqual({
      settlement: "half_refunded",
      next: { invitations: 4, halfInvitations: 1 },
    });
  });

  it("R2.5 refunds nothing once the cap is reached", () => {
    expect(
      decideExit({ invitations: 4, halfInvitations: 1 }, { spent: 1, refunded: 1 }),
    ).toEqual({
      settlement: "none",
      next: { invitations: 4, halfInvitations: 1 },
    });
  });

  it("R2.5 never refunds an entry that was itself paid with a half credit", () => {
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
  it("reads back each of the five markers", () => {
    for (const s of [
      "full_spent",
      "purchase_spent",
      "half_spent",
      "half_refunded",
      "none",
    ] as const) {
      expect(readSettlement(logRow(NOW, s))).toBe(s);
    }
  });

  it("treats a legacy row with no marker as unmarked", () => {
    expect(readSettlement(logRow(NOW, undefined))).toBeNull();
  });

  it("treats an unrecognised marker as unmarked", () => {
    expect(readSettlement(logRow(NOW, "nonsense"))).toBeNull();
  });
});

describe("selectSettlements — day + window scoping", () => {
  const rows = [
    logRow(hoursAgo(1), "full_spent"), // 15:00, inside the window
    logRow(hoursAgo(2), "half_spent"), // 14:00, inside the window
    logRow(hoursAgo(6), "full_spent"), // 10:00, same day but aged out
    logRow(new Date("2026-08-26T14:00:00Z"), "full_spent"), // yesterday
    logRow(hoursAgo(3), undefined), // legacy, unmarked
  ];

  it("counts only the requested marker, inside the window and on the day", () => {
    expect(countSettlements(rows, "full_spent", WINDOW)).toBe(1);
    expect(countSettlements(rows, "half_spent", WINDOW)).toBe(1);
    expect(countSettlements(rows, "half_refunded", WINDOW)).toBe(0);
  });

  it("includes a row landing exactly on `since` — the boundary is inclusive", () => {
    const onTheEdge = [logRow(hoursAgo(5), "full_spent")];
    const aMillisecondPast = [
      logRow(new Date(NOW.getTime() - 5 * HOUR_MS - 1), "full_spent"),
    ];
    expect(countSettlements(onTheEdge, "full_spent", WINDOW)).toBe(1);
    expect(countSettlements(aMillisecondPast, "full_spent", WINDOW)).toBe(0);
  });

  it("excludes unmarked legacy rows, which under-refunds rather than over-refunds", () => {
    // An unmarked row is invisible to `spent`, so an exit will not refund
    // against it. Under-refunding is recoverable by hand; over-refunding hands
    // out credits the tenant never sold.
    const legacyOnly = [logRow(hoursAgo(1), undefined)];
    expect(countSettlements(legacyOnly, "full_spent", WINDOW)).toBe(0);
  });

  it("ignores other days entirely, however wide the window", () => {
    const yesterday = { date: "2026-08-26", since: new Date(0) };
    expect(countSettlements(rows, "full_spent", yesterday)).toBe(1);
    expect(
      countSettlements(rows, "full_spent", { date: "2026-08-25", since: new Date(0) }),
    ).toBe(0);
  });

  it("returns the matching rows, which is what `since` is then derived from", () => {
    const selected = selectSettlements(rows, "full_spent", WINDOW);
    expect(selected).toHaveLength(1);
    expect(earliestExecutedAt(selected)).toEqual(hoursAgo(1));
    expect(earliestExecutedAt([])).toBeNull();
  });
});

// ─── R2.1–R2.3 · the counters ────────────────────────────────────────────────

describe("buildRefundCounters", () => {
  it("counts an entry inside the window and none outside it", () => {
    expect(
      buildRefundCounters([logRow(hoursAgo(1), "full_spent")], [], NOW),
    ).toEqual({ spent: 1, refunded: 0 });

    expect(
      buildRefundCounters([logRow(hoursAgo(6), "full_spent")], [], NOW),
    ).toEqual({ spent: 0, refunded: 0 });
  });

  it("treats exactly five hours as inside, five hours and a millisecond as outside", () => {
    expect(
      buildRefundCounters([logRow(hoursAgo(5), "full_spent")], [], NOW).spent,
    ).toBe(1);
    expect(
      buildRefundCounters(
        [logRow(new Date(NOW.getTime() - 5 * HOUR_MS - 1), "full_spent")],
        [],
        NOW,
      ).spent,
    ).toBe(0);
  });

  it("charges a refund already granted against the entry it belongs to", () => {
    const counters = buildRefundCounters(
      [logRow(hoursAgo(2), "full_spent")],
      [logRow(hoursAgo(1), "half_refunded", EXIT_ACTION)],
      NOW,
    );
    expect(counters).toEqual({ spent: 1, refunded: 1 });
  });

  it("R2.2 does NOT charge a refund granted before the oldest counted entry", () => {
    // The case a symmetric window gets wrong. The −4h refund belongs to the
    // −6h entry, which has since aged out; charging it against the fresh −1h
    // entry would silently deny that guest their credit.
    const counters = buildRefundCounters(
      [logRow(hoursAgo(6), "full_spent"), logRow(hoursAgo(1), "full_spent")],
      [logRow(hoursAgo(4), "half_refunded", EXIT_ACTION)],
      NOW,
    );
    expect(counters).toEqual({ spent: 1, refunded: 0 });
  });

  it("stays order-independent across several guests on one card", () => {
    // Two entries inside the window, one refund already granted: exactly one
    // refund is still owed, whatever order the rows arrive in.
    const entries = [logRow(hoursAgo(1), "full_spent"), logRow(hoursAgo(3), "full_spent")];
    const exits = [logRow(hoursAgo(2), "half_refunded", EXIT_ACTION)];

    expect(buildRefundCounters(entries, exits, NOW)).toEqual({ spent: 2, refunded: 1 });
    expect(buildRefundCounters([...entries].reverse(), exits, NOW)).toEqual({
      spent: 2,
      refunded: 1,
    });
  });

  it("ignores yesterday's rows even when they are within five hours", () => {
    // 00:30 Madrid, entry at 23:00 the previous local day: 1.5 hours elapsed,
    // but the same-day gate is deliberately kept.
    const justPastMidnight = new Date("2026-08-26T22:30:00Z");
    const lateYesterday = new Date("2026-08-26T21:00:00Z");
    expect(
      buildRefundCounters([logRow(lateYesterday, "full_spent")], [], justPastMidnight),
    ).toEqual({ spent: 0, refunded: 0 });
  });
});

// ─── Full scenario ───────────────────────────────────────────────────────────

describe("refund cap — full window scenario", () => {
  it("caps refunds at the number of full invitations spent in the window", () => {
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
  it("R2.4 leaves the TARGET field UNCHANGED and grants a half credit", async () => {
    vi.setSystemTime(NOW);
    const { ctx, writes } = fakeContext({
      actionId: EXIT_ACTION,
      invitations: 2,
      halfInvitations: 0,
      history: [logRow(hoursAgo(1), "full_spent", ENTRY_ACTION)],
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(result.newValue).toBe(2);
    expect(writes).toEqual([{ fieldId: HALF_FIELD, value: 1 }]);
    expect(result.metadata?.invitationSettlement).toBe("half_refunded");
  });

  it("refunds at exactly five hours, and not a millisecond later", async () => {
    // The boundary the tenant asked for, end to end: inclusive, compared in
    // milliseconds rather than bucketed by hour.
    vi.setSystemTime(NOW);
    const onTheEdge = fakeContext({
      actionId: EXIT_ACTION,
      invitations: 2,
      halfInvitations: 0,
      history: [logRow(hoursAgo(5), "full_spent", ENTRY_ACTION)],
    });
    const aMillisecondPast = fakeContext({
      actionId: EXIT_ACTION,
      invitations: 2,
      halfInvitations: 0,
      history: [
        logRow(
          new Date(NOW.getTime() - 5 * HOUR_MS - 1),
          "full_spent",
          ENTRY_ACTION,
        ),
      ],
    });

    const edge = await InvitationActionStrategy.handleAction(onTheEdge.ctx);
    const past = await InvitationActionStrategy.handleAction(aMillisecondPast.ctx);

    expect(edge.metadata?.invitationSettlement).toBe("half_refunded");
    expect(onTheEdge.writes).toEqual([{ fieldId: HALF_FIELD, value: 1 }]);
    expect(past.metadata?.invitationSettlement).toBe("none");
    expect(aMillisecondPast.writes).toEqual([]);
  });

  it("R2.5 refunds nothing for a visit longer than five hours", async () => {
    // The whole point of the rule: the same-day entry is there, it is marked
    // refundable, and it still costs a full invitation because the guest
    // stayed six hours.
    vi.setSystemTime(NOW);
    const { ctx, writes } = fakeContext({
      actionId: EXIT_ACTION,
      invitations: 2,
      halfInvitations: 0,
      history: [logRow(hoursAgo(6), "full_spent", ENTRY_ACTION)],
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(result.newValue).toBe(2);
    expect(writes).toEqual([]);
    expect(result.metadata?.invitationSettlement).toBe("none");
  });

  it("R2.5 logs `none` and writes nothing when the cap is reached", async () => {
    // The `none` row is deliberate: it is what makes the cap auditable. The
    // `half_refunded` row is what a later exit counts as `refunded`.
    vi.setSystemTime(NOW);
    const { ctx, writes } = fakeContext({
      actionId: EXIT_ACTION,
      invitations: 2,
      halfInvitations: 1,
      history: [
        logRow(hoursAgo(1), "full_spent", ENTRY_ACTION),
        logRow(hoursAgo(0.5), "half_refunded", EXIT_ACTION),
      ],
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(result.newValue).toBe(2);
    expect(writes).toEqual([]);
    expect(result.metadata?.invitationSettlement).toBe("none");
  });

  it("never refunds across midnight, however short the visit", async () => {
    // Exit at 00:30 Madrid against an entry at 23:00 the previous local day —
    // 1.5 hours elapsed. The same-day gate is kept deliberately, so this is a
    // full spend. The entry is dropped by the paging filter, not by the window.
    vi.setSystemTime(new Date("2026-08-26T22:30:00Z"));
    const { ctx, writes } = fakeContext({
      actionId: EXIT_ACTION,
      invitations: 2,
      halfInvitations: 0,
      history: [
        logRow(new Date("2026-08-26T21:00:00Z"), "full_spent", ENTRY_ACTION),
      ],
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(result.newValue).toBe(2);
    expect(writes).toEqual([]);
    expect(result.metadata?.invitationSettlement).toBe("none");
  });

  it("serves several guests on one card: one refund per in-window entry", async () => {
    // A member walked two guests in, at −6h and −1h, and both are leaving now.
    // The log cannot say which guest is at the gate; the aggregate is what has
    // to be right — exactly one refund, then the cap.
    vi.setSystemTime(NOW);
    const history = [
      logRow(hoursAgo(6), "full_spent", ENTRY_ACTION),
      logRow(hoursAgo(1), "full_spent", ENTRY_ACTION),
    ];

    const first = fakeContext({
      actionId: EXIT_ACTION,
      invitations: 2,
      halfInvitations: 0,
      history,
    });
    const firstResult = await InvitationActionStrategy.handleAction(first.ctx);

    // The second exit sees the refund the first one logged.
    const second = fakeContext({
      actionId: EXIT_ACTION,
      invitations: 2,
      halfInvitations: 1,
      history: [...history, logRow(NOW, "half_refunded", EXIT_ACTION)],
    });
    const secondResult = await InvitationActionStrategy.handleAction(second.ctx);

    expect(firstResult.metadata?.invitationSettlement).toBe("half_refunded");
    expect(first.writes).toEqual([{ fieldId: HALF_FIELD, value: 1 }]);
    expect(secondResult.metadata?.invitationSettlement).toBe("none");
    expect(second.writes).toEqual([]);
  });

  it("a stale refund does not swallow a fresh entry's refund", async () => {
    // Long visit entered at −6h and refunded at −4h; that credit was then spent
    // by a half-paid entry at −3h; a new guest came in at −1h and is leaving
    // now. Counting refunds from the same cutoff as entries would charge the
    // −4h refund against the −1h entry and deny this guest their credit.
    vi.setSystemTime(NOW);
    const { ctx, writes } = fakeContext({
      actionId: EXIT_ACTION,
      invitations: 2,
      halfInvitations: 0,
      history: [
        logRow(hoursAgo(6), "full_spent", ENTRY_ACTION),
        logRow(hoursAgo(4), "half_refunded", EXIT_ACTION),
        logRow(hoursAgo(3), "half_spent", ENTRY_ACTION),
        logRow(hoursAgo(1), "full_spent", ENTRY_ACTION),
      ],
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(result.metadata?.invitationSettlement).toBe("half_refunded");
    expect(writes).toEqual([{ fieldId: HALF_FIELD, value: 1 }]);
  });

  it("never refunds an entry that was itself paid with a half credit", async () => {
    vi.setSystemTime(NOW);
    const { ctx, writes } = fakeContext({
      actionId: EXIT_ACTION,
      invitations: 2,
      halfInvitations: 0,
      history: [logRow(hoursAgo(1), "half_spent", ENTRY_ACTION)],
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(writes).toEqual([]);
    expect(result.metadata?.invitationSettlement).toBe("none");
  });

  it("does not refund against an unmarked legacy entry", async () => {
    vi.setSystemTime(NOW);
    const { ctx, writes } = fakeContext({
      actionId: EXIT_ACTION,
      invitations: 2,
      halfInvitations: 0,
      history: [logRow(hoursAgo(1), undefined, ENTRY_ACTION)],
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(writes).toEqual([]);
    expect(result.metadata?.invitationSettlement).toBe("none");
  });
});

describe("handleAction — R4 purchase mode", () => {
  it("R4.1 decrements INVITATIONS and marks the row `purchase_spent`", async () => {
    const { ctx, writes } = fakeContext({
      actionId: ENTRY_ACTION,
      invitations: 5,
      halfInvitations: 0,
      purchaseMode: true,
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(result.newValue).toBe(4);
    expect(writes).toEqual([]);
    expect(result.metadata?.invitationSettlement).toBe("purchase_spent");
    expect(result.metadata?.invitationMode).toBe("purchase");
  });

  it("R4.1 still spends an owned half credit before a full invitation", async () => {
    // The flag changes what an exit does, not what a credit the holder already
    // owns is worth. INVITATIONS must not move here.
    const { ctx, writes } = fakeContext({
      actionId: ENTRY_ACTION,
      invitations: 5,
      halfInvitations: 3,
      purchaseMode: true,
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(result.newValue).toBe(5);
    expect(writes).toEqual([{ fieldId: HALF_FIELD, value: 2 }]);
    expect(result.metadata?.invitationSettlement).toBe("half_spent");
  });

  it("R4.2 refunds nothing on exit and never reads the history", async () => {
    // Asserting the absent read, not just the absent refund: "no time logic"
    // is the requirement, and an exit that built the counters and then
    // discarded them would pass an outcome-only assertion.
    vi.setSystemTime(NOW);
    const { ctx, writes, historyCalls } = fakeContext({
      actionId: EXIT_ACTION,
      invitations: 5,
      halfInvitations: 0,
      purchaseMode: true,
      history: [logRow(hoursAgo(1), "full_spent", ENTRY_ACTION)],
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(result.newValue).toBe(5);
    expect(writes).toEqual([]);
    expect(historyCalls).toEqual([]);
    expect(result.metadata?.invitationSettlement).toBe("none");
    expect(result.metadata?.invitationMode).toBe("purchase");
  });

  it("R4.2 refunds nothing however many times the exit is run", async () => {
    vi.setSystemTime(NOW);
    for (const halfInvitations of [0, 1, 9]) {
      const { ctx, writes } = fakeContext({
        actionId: EXIT_ACTION,
        invitations: 5,
        halfInvitations,
        purchaseMode: true,
      });

      const result = await InvitationActionStrategy.handleAction(ctx);

      expect(result.newValue).toBe(5);
      expect(writes).toEqual([]);
    }
  });

  it("does not refund against a purchase entry after the flag is turned OFF", async () => {
    // The regression the distinct marker exists for: entries settled under R4
    // an hour ago, flag cleared, exit well inside the window. A shared
    // `full_spent` marker would hand out a credit that was never sold.
    vi.setSystemTime(NOW);
    const { ctx, writes } = fakeContext({
      actionId: EXIT_ACTION,
      invitations: 5,
      halfInvitations: 0,
      purchaseMode: false,
      history: [
        logRow(hoursAgo(1), "purchase_spent", ENTRY_ACTION),
        logRow(hoursAgo(1), "purchase_spent", ENTRY_ACTION),
      ],
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(result.newValue).toBe(5);
    expect(writes).toEqual([]);
    expect(result.metadata?.invitationSettlement).toBe("none");
  });

  it("an absent flag behaves exactly as before R4 shipped", async () => {
    // `purchaseMode` defaults to null — the value a card with no
    // `field_values` row for the boolean actually reads back.
    vi.setSystemTime(NOW);
    const { ctx: entryCtx } = fakeContext({
      actionId: ENTRY_ACTION,
      invitations: 5,
      halfInvitations: 0,
    });
    const { ctx: exitCtx, writes: exitWrites } = fakeContext({
      actionId: EXIT_ACTION,
      invitations: 5,
      halfInvitations: 0,
      history: [logRow(hoursAgo(1), "full_spent", ENTRY_ACTION)],
    });

    const entry = await InvitationActionStrategy.handleAction(entryCtx);
    const exit = await InvitationActionStrategy.handleAction(exitCtx);

    expect(entry.newValue).toBe(4);
    expect(entry.metadata?.invitationSettlement).toBe("full_spent");
    expect(entry.metadata?.invitationMode).toBe("duration");
    expect(exit.metadata?.invitationSettlement).toBe("half_refunded");
    expect(exitWrites).toEqual([{ fieldId: HALF_FIELD, value: 1 }]);
  });

  it("is off for a card whose flag is explicitly false", async () => {
    const { ctx } = fakeContext({
      actionId: ENTRY_ACTION,
      invitations: 5,
      halfInvitations: 0,
      purchaseMode: false,
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(result.metadata?.invitationSettlement).toBe("full_spent");
    expect(result.metadata?.invitationMode).toBe("duration");
  });
});

describe("handleAction — diagnostic metadata", () => {
  it("stamps the local date and mode alongside the settlement marker", async () => {
    // Exact shape, so a stray key cannot appear unnoticed — `invitationSlot`
    // was one, and is gone. There is deliberately no key for the window: it is
    // `executed_at` minus five hours.
    vi.setSystemTime(NOW);
    const { ctx } = fakeContext({
      actionId: ENTRY_ACTION,
      invitations: 1,
      halfInvitations: 0,
    });

    const result = await InvitationActionStrategy.handleAction(ctx);

    expect(result.metadata).toEqual({
      invitationSettlement: "full_spent",
      invitationDate: "2026-08-27",
      invitationMode: "duration",
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

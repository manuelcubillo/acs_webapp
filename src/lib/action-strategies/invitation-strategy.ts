/**
 * Invitation Action Strategy — guest entry / exit accounting
 *
 * Custom action strategy for the single tenant whose `tenants.scan_strategy` is
 * `"invitation"`. That tenant sells guest access on a half-day basis and keeps
 * the balance on two number fields of the card:
 *
 *   INVITATIONS      — full invitations. One covers a whole day.
 *   HALF_INVITATION  — half-invitation credits. One covers a short visit.
 *
 * A third field, boolean, selects the accounting model per card:
 *
 *   PURCHASE_MODE    — "compra invitaciones". When true the holder BUYS their
 *                      invitations outright instead of drawing on a duration-based
 *                      allotment, and nothing is ever returned to them.
 *
 * What a visit costs is decided by HOW LONG IT LASTED, not by which half of the
 * day it fell in:
 *
 *   ≤ 5 hours  — half an invitation.
 *   > 5 hours  — a full invitation.
 *
 * The threshold is inclusive and compared in milliseconds, never bucketed by
 * hour. The calendar day is still evaluated in the tenant's civil timezone
 * (never from the raw UTC instant) because a refund additionally requires entry
 * and exit to fall on the SAME local day.
 *
 * ─── Rules ───────────────────────────────────────────────────────────────────
 *
 * R1 · GUEST_ENTRY
 *   1. HALF_INVITATION > 0  → spend one half credit. INVITATIONS untouched.
 *                             This entry is NOT refundable.
 *   2. otherwise            → spend one full invitation. This entry IS
 *                             refundable (see R2).
 *
 * R2 · GUEST_EXIT — with `N` the exit instant, `D` its local date and
 *      `cutoff = N − 5h`:
 *   1. spent    = GUEST_ENTRY executions on this card that consumed a full
 *                 INVITATIONS unit (R1.2), whose local date is `D` AND whose
 *                 `executedAt >= cutoff` — i.e. entries still inside the
 *                 half-price window.
 *   2. since    = the OLDEST `executedAt` among those entries, or `cutoff` when
 *                 there are none. A refund granted before the oldest entry we
 *                 are still counting cannot have been granted against any of
 *                 them, so it must not consume one of their refunds.
 *   3. refunded = GUEST_EXIT executions on this card, local date `D`, with
 *                 `executedAt >= since`, that already granted a half-invitation.
 *   4. refunded < spent → grant one HALF_INVITATION.
 *   5. otherwise        → no balance change.
 *
 *   The comparison IS the cap: at most one half-invitation returned per full
 *   invitation consumed inside the window. It is order-independent and needs no
 *   entry↔exit pairing key, which is what makes it correct when several guests
 *   are on one card at once — with entries at N−6h and N−1h and two exits at N,
 *   exactly one refund is granted. The log cannot say WHICH guest left, but the
 *   aggregate is right.
 *
 *   An entry that has aged past 5 hours, or that happened on the previous local
 *   day, is simply not counted, so the exit that follows it refunds nothing.
 *
 * R4 · PURCHASE_MODE — evaluated per card, on both handled actions:
 *   1. GUEST_ENTRY keeps R1's preference — a half credit is still spent first,
 *      because a credit the holder already owns is still theirs to spend — but
 *      an entry that consumes a full invitation is marked `purchase_spent`
 *      rather than `full_spent`.
 *   2. GUEST_EXIT never refunds. R2 is skipped WHOLESALE: no window arithmetic,
 *      no history read, no balance change.
 *
 *   R4.1's distinct marker is what makes R4.2 robust rather than merely correct
 *   today. R2 counts only `full_spent` as refundable, so an entry settled under
 *   purchase mode stays unrefundable even if the flag is flipped off later the
 *   same day — which a shared `full_spent` marker would not survive.
 *
 *   Numbered R4 and not R3 because R3 is already spoken for: it names the
 *   insufficient-balance gate in ADR `2026-08-27-invitation-accounting.md`,
 *   which is not built yet. See the interim note on `decideEntry`.
 *
 * Every other action on this tenant falls through to the standard behaviour
 * (`handleStandardAction`), byte-identical to `StandardActionStrategy`. So does
 * a handled action whose target field has been repointed away from INVITATIONS
 * — see the guard in `handleAction`.
 *
 * Both handled actions TARGET the INVITATIONS field, but three of the five
 * settlements do not CHANGE it — they move HALF_INVITATION, or nothing. See
 * `applyDecision`.
 *
 * ─── How past executions are detected ────────────────────────────────────────
 *
 * Each entry/exit annotates its own `action_logs` row through the existing
 * strategy metadata channel (`ActionStrategyResult.metadata`, merged into the
 * log by `executeAction`) with a discriminated `invitationSettlement` marker.
 * R2 reads those markers back via `ctx.getCardActionHistory`. No inference from
 * before/after values, no new persistent state, no schema change.
 *
 * ─── Structure ───────────────────────────────────────────────────────────────
 *
 * The decision logic is a set of exported pure functions (local date resolution,
 * settlement selection, entry/exit decisions). The DB reads and writes live at
 * the edges, in `handleGuestEntry` / `handleGuestExit` / `applyDecision`, so the
 * rules can be unit-tested without a database.
 *
 * Superseded the half-day slot rule (MORNING/AFTERNOON split at 15:00) on
 * 2026-08-30 — ADR `2026-08-30-invitation-duration-refund.md`.
 */
import type {
  ActionHistoryRecord,
  ActionStrategyContext,
  ActionStrategyResult,
  TenantActionStrategy,
} from "./types";

import { computeNewValue } from "./compute-new-value";

// ─── Configuration ───────────────────────────────────────────────────────────

/** Field/action identifiers for the invitation tenant. Values are environment
 *  data, not logic — update here if the tenant's schema is re-provisioned.
 *
 *  Matching is by UUID and never by name: field and action names are
 *  tenant-editable, so a rename must not silently change accounting behaviour.
 *
 *  Matching by id also makes the strategy INERT UNTIL CONFIGURED. If the
 *  tenant's schema is re-provisioned and these ids no longer exist, no action
 *  can match them and every execution falls through to the standard path. That
 *  is the deliberate safe default — see the repointed-target guard in
 *  `handleAction` for the same reasoning applied to the target field. */
export const INVITATION_CONFIG = {
  invitationsFieldId: "d48eec1b-2de1-4342-9e23-43da269db1f8",
  halfInvitationFieldId: "4fbac0d2-6820-4921-b1f7-5be35b2abab7",
  /** Boolean field "compra invitaciones" — selects the R4 accounting model. */
  purchaseModeFieldId: "df83af19-6046-4e28-9622-f5aed0b44db8",
  guestEntryActionId: "dd2461c6-fadd-4f98-91e0-571184747e9c",
  guestExitActionId: "5cd7a02f-f9a1-4a85-9406-a1022897a3c9",
} as const;

/**
 * The tenant's civil timezone. "Today" is always evaluated here, never in UTC —
 * in summer Madrid is UTC+2, so an entry at 00:30 local belongs to the previous
 * UTC day and would be counted against the wrong day if the raw instant were
 * used.
 *
 * Deliberately a single hardcoded constant: making it configurable is out of
 * scope, and keeping it in one place is what makes that change a one-liner.
 */
export const TENANT_TIME_ZONE = "Europe/Madrid";

/**
 * A visit lasting at most this long costs half an invitation; a longer one
 * costs a full invitation.
 *
 * The boundary is INCLUSIVE — exactly five hours still refunds — and the
 * comparison is made in milliseconds off the two `executed_at` instants, never
 * bucketed by hour. `REFUND_WINDOW_MS` is derived rather than spelled out so
 * the two can never drift apart.
 */
const REFUND_WINDOW_HOURS = 5;
const REFUND_WINDOW_MS = REFUND_WINDOW_HOURS * 60 * 60 * 1000;

/** One guest entry costs exactly one credit (full or half). */
const ENTRY_COST = 1;

/** A qualifying exit returns exactly one half-invitation. */
const REFUND_AMOUNT = 1;

/** Key under which the settlement marker is stored in `action_logs.metadata`. */
export const SETTLEMENT_METADATA_KEY = "invitationSettlement";

/** Diagnostic keys written alongside the marker (never read back by the rules;
 *  they exist so an auditor can see which local day a row was settled against
 *  without recomputing the timezone conversion).
 *
 *  `invitationMode` records which accounting model settled the row. It carries
 *  real information the marker cannot: an R4 exit settles as `none`, which is
 *  otherwise indistinguishable from a duration-mode exit that hit its refund
 *  cap.
 *
 *  There is deliberately no key for the refund window: it is `executed_at`
 *  minus five hours, derivable from the row itself. */
export const DATE_METADATA_KEY = "invitationDate";
export const MODE_METADATA_KEY = "invitationMode";

/**
 * History paging. `getCardActionHistory` returns newest-first, so the scan stops
 * as soon as it reaches a row older than today; the page cap is a safety belt
 * against an unbounded loop, not an expected limit — it allows 500 executions of
 * a single action on a single card in one day.
 */
const HISTORY_PAGE_SIZE = 100;
const HISTORY_MAX_PAGES = 5;

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * What an execution did to the balance. Written to the log on every entry/exit
 * and read back to evaluate the R2 refund cap.
 *
 *   full_spent     — GUEST_ENTRY consumed one INVITATIONS unit (refundable).
 *   purchase_spent — GUEST_ENTRY consumed one INVITATIONS unit under purchase
 *                    mode, R4.1 (never refundable).
 *   half_spent     — GUEST_ENTRY consumed one HALF_INVITATION (not refundable).
 *   half_refunded  — GUEST_EXIT granted one HALF_INVITATION.
 *   none           — GUEST_EXIT that did not refund: the cap was already
 *                    reached, or purchase mode disabled refunds entirely.
 */
export type InvitationSettlement =
  | "full_spent"
  | "purchase_spent"
  | "half_spent"
  | "half_refunded"
  | "none";

/**
 * Which accounting model settled an execution. Diagnostic only — written to the
 * log under {@link MODE_METADATA_KEY}, never read back by the rules.
 *
 *   purchase — R4: the holder buys outright, nothing is ever refunded.
 *   duration — the ≤ 5h refund rule.
 *   slot     — HISTORICAL ONLY. The half-day MORNING/AFTERNOON rule this
 *              strategy applied before 2026-08-30, and the label
 *              `scripts/legacyDBMigration/resync.ts` still writes on the rows it
 *              reconstructs from the legacy system. The live strategy never
 *              writes it any more, which is what makes pre-change rows
 *              identifiable in the audit trail instead of silently relabelled.
 */
export type InvitationMode = "purchase" | "duration" | "slot";

/** The card's two invitation counters. */
export interface InvitationBalances {
  invitations: number;
  halfInvitations: number;
}

/** How many refundable entries and granted refunds the refund window holds. */
export interface RefundCounters {
  /**
   * GUEST_ENTRY executions inside the window that consumed a full invitation
   * under duration accounting. `purchase_spent` entries are deliberately NOT
   * counted: R4.1 makes them permanently unrefundable.
   */
  spent: number;
  /** GUEST_EXIT executions since those entries that already granted a half. */
  refunded: number;
}

/** The slice of history a settlement lookup is restricted to: one local day,
 *  from one instant onwards. */
export interface RefundWindow {
  /** Local calendar day as `YYYY-MM-DD` (lexicographically comparable). */
  date: string;
  /** Earliest `executedAt` that still counts, INCLUSIVE. */
  since: Date;
}

/** The outcome of applying R1 or R2: what happened, and the resulting balances. */
export interface SettlementDecision {
  settlement: InvitationSettlement;
  /** Absolute post-decision balances (not deltas). */
  next: InvitationBalances;
}

// ─── Pure helpers — local time ───────────────────────────────────────────────

/**
 * Cache of `Intl.DateTimeFormat` instances by timezone. Constructing one is
 * comparatively expensive and the selection pass formats every history row.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function localFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Convert an instant to the tenant's local calendar day.
 *
 * The only timezone-sensitive quantity left in the rules: elapsed time is a
 * difference between two instants and needs no conversion, but "same day" does.
 *
 * @param instant  - The UTC instant (an execution timestamp).
 * @param timeZone - IANA timezone; defaults to the tenant's.
 * @returns The local day as `YYYY-MM-DD` (lexicographically comparable).
 */
export function resolveLocalDate(
  instant: Date,
  timeZone: string = TENANT_TIME_ZONE,
): string {
  const parts = localFormatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

// ─── Pure helpers — balances and markers ─────────────────────────────────────

/**
 * Coerce a stored field value to a usable counter.
 *
 * A card whose balance field was never filled in has no `field_values` row at
 * all, so the read yields null — that must count as 0, not as an error.
 *
 * @param value - Raw value from `readField` / `ctx.currentValue`.
 * @returns The numeric balance, or 0 when unset or non-numeric.
 */
export function toBalance(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Coerce a stored field value to a boolean flag.
 *
 * Strict on purpose: only a real `true` turns purchase mode on. `readField`
 * yields null both for a boolean field that was never set on this card and for
 * an id that resolves to no field definition at all, and both of those must
 * mean OFF — so a flag that is absent, cleared or misconfigured leaves R1/R2
 * behaviour exactly as it was. Same inert-until-configured default as the rest
 * of the strategy.
 *
 * @param value - Raw value from `readField`.
 * @returns True only when the stored value is boolean `true`.
 */
export function toFlag(value: unknown): boolean {
  return value === true;
}

/** Type guard for the settlement marker read back out of jsonb. */
function isSettlement(value: unknown): value is InvitationSettlement {
  return (
    value === "full_spent" ||
    value === "purchase_spent" ||
    value === "half_spent" ||
    value === "half_refunded" ||
    value === "none"
  );
}

/**
 * Read the settlement marker off a logged execution.
 *
 * Returns null for rows written before this strategy shipped (they carry no
 * marker). Those rows are therefore never counted as `spent` — deliberately
 * conservative: an unmarked entry cannot be refunded against, which can only
 * under-refund, never over-refund.
 *
 * @param record - A decoded `action_logs` row.
 * @returns The marker, or null when absent/unrecognised.
 */
export function readSettlement(
  record: ActionHistoryRecord,
): InvitationSettlement | null {
  const raw = record.metadata?.[SETTLEMENT_METADATA_KEY];
  return isSettlement(raw) ? raw : null;
}

/**
 * Select the records carrying a given settlement marker inside a window.
 *
 * Pure over the record list: the caller supplies whatever rows it fetched and
 * this re-derives each row's local date, so the filter cannot disagree with the
 * moment the decision is being made for.
 *
 * `since` is inclusive, which is what makes an exactly-five-hour visit refund.
 *
 * @param records    - Decoded `action_logs` rows (any order).
 * @param settlement - The marker to select.
 * @param window     - Local day + earliest `executedAt` that still counts.
 * @param timeZone   - IANA timezone; defaults to the tenant's.
 * @returns The matching records, in the order they were supplied.
 */
export function selectSettlements(
  records: ActionHistoryRecord[],
  settlement: InvitationSettlement,
  window: RefundWindow,
  timeZone: string = TENANT_TIME_ZONE,
): ActionHistoryRecord[] {
  const since = window.since.getTime();

  return records.filter(
    (record) =>
      readSettlement(record) === settlement &&
      record.executedAt.getTime() >= since &&
      resolveLocalDate(record.executedAt, timeZone) === window.date,
  );
}

/**
 * How many records carry a given settlement marker inside a window.
 *
 * @see selectSettlements — this is its arity, counted.
 */
export function countSettlements(
  records: ActionHistoryRecord[],
  settlement: InvitationSettlement,
  window: RefundWindow,
  timeZone: string = TENANT_TIME_ZONE,
): number {
  return selectSettlements(records, settlement, window, timeZone).length;
}

/**
 * The oldest execution instant in a record list.
 *
 * @param records - Decoded `action_logs` rows (any order).
 * @returns The earliest `executedAt`, or null when the list is empty.
 */
export function earliestExecutedAt(
  records: ActionHistoryRecord[],
): Date | null {
  let earliest: Date | null = null;
  for (const record of records) {
    if (earliest === null || record.executedAt < earliest) {
      earliest = record.executedAt;
    }
  }
  return earliest;
}

/**
 * R2.1–R2.3 — count the refundable entries and the refunds already granted
 * against them.
 *
 * `spent` is scoped to entries still inside the five-hour window on today's
 * local date: an entry older than that, or from yesterday, is not refundable and
 * must not raise the cap.
 *
 * `refunded` is scoped from the OLDEST counted entry rather than from the same
 * cutoff, and that asymmetry is the point. A refund granted before that entry
 * existed cannot have been granted against any entry we are counting, so
 * charging it against one of them would silently swallow a fresh entry's refund
 * — the exact case of a long visit refunded hours ago followed by a short visit
 * now.
 *
 * @param entryRecords - GUEST_ENTRY rows for the card (any order).
 * @param exitRecords  - GUEST_EXIT rows for the card (any order).
 * @param now          - The exit instant being settled.
 * @param timeZone     - IANA timezone; defaults to the tenant's.
 * @returns The two counts R2.4 compares.
 */
export function buildRefundCounters(
  entryRecords: ActionHistoryRecord[],
  exitRecords: ActionHistoryRecord[],
  now: Date,
  timeZone: string = TENANT_TIME_ZONE,
): RefundCounters {
  const date = resolveLocalDate(now, timeZone);
  const cutoff = new Date(now.getTime() - REFUND_WINDOW_MS);

  const spentRecords = selectSettlements(
    entryRecords,
    "full_spent",
    { date, since: cutoff },
    timeZone,
  );

  const since = earliestExecutedAt(spentRecords) ?? cutoff;

  return {
    spent: spentRecords.length,
    refunded: countSettlements(
      exitRecords,
      "half_refunded",
      { date, since },
      timeZone,
    ),
  };
}

// ─── Pure helpers — the rules ────────────────────────────────────────────────

/**
 * R1 — decide what a GUEST_ENTRY consumes.
 *
 * Half credits are spent first: they are the cheaper, non-refundable unit, so
 * spending them before full invitations is what makes R2's cap meaningful.
 *
 * INTERIM BEHAVIOUR (R3 not yet authorised): when both counters are exhausted
 * this still spends a full invitation and INVITATIONS goes negative. That is
 * accepted for now and is NOT a bug — the depleted-balance validation/block is
 * a separate, approved change. Until then the negative value is the visible
 * signal that the tenant is owed credits.
 *
 * R4.1 — purchase mode does not change WHAT an entry spends, only how it is
 * MARKED. A half credit the holder already owns is still spent first; only the
 * full-invitation branch settles as `purchase_spent`, which is what keeps it
 * out of R2's refundable count for good.
 *
 * @param balances     - Current counters.
 * @param purchaseMode - The card's R4 flag.
 * @returns The settlement and the resulting balances.
 */
export function decideEntry(
  balances: InvitationBalances,
  purchaseMode = false,
): SettlementDecision {
  if (balances.halfInvitations > 0) {
    return {
      settlement: "half_spent",
      next: {
        invitations: balances.invitations,
        halfInvitations: balances.halfInvitations - ENTRY_COST,
      },
    };
  }

  return {
    settlement: purchaseMode ? "purchase_spent" : "full_spent",
    next: {
      invitations: balances.invitations - ENTRY_COST,
      halfInvitations: balances.halfInvitations,
    },
  };
}

/**
 * R2.4 — decide whether a GUEST_EXIT refunds a half-invitation.
 *
 * The comparison IS the cap: one refund per full invitation consumed inside the
 * five-hour window. An exit whose entry was paid with a half credit — or whose
 * entry has aged past the window, or fell on the previous local day — finds
 * `spent` at 0 and refunds nothing.
 *
 * R4.2 rides the same function: `counters === null` means duration accounting
 * does not apply to this card, and nothing is ever returned. Null rather than
 * zeroed counters because the two are not the same claim —
 * `{ spent: 0, refunded: 0 }` asserts a history read that, under purchase mode,
 * never happened.
 *
 * @param balances - Current counters.
 * @param counters - In-window entry/refund counts from the log, or null when
 *                   purchase mode (R4.2) disables duration accounting for this
 *                   card.
 * @returns The settlement and the resulting balances.
 */
export function decideExit(
  balances: InvitationBalances,
  counters: RefundCounters | null,
): SettlementDecision {
  if (counters !== null && counters.refunded < counters.spent) {
    return {
      settlement: "half_refunded",
      next: {
        invitations: balances.invitations,
        halfInvitations: balances.halfInvitations + REFUND_AMOUNT,
      },
    };
  }

  return { settlement: "none", next: balances };
}

// ─── Edges — reads ───────────────────────────────────────────────────────────

/**
 * Read one balance field. When the field IS the action's target, reuse
 * `ctx.currentValue` instead of issuing a second query: it is the same row, and
 * it is the value `executeAction` will record as `before_value`, so the decision
 * and the audit trail cannot disagree.
 */
function readBalanceField(
  ctx: ActionStrategyContext,
  fieldDefinitionId: string,
): Promise<number> {
  if (ctx.action.targetField.id === fieldDefinitionId) {
    return Promise.resolve(toBalance(ctx.currentValue));
  }
  return ctx.readField(fieldDefinitionId).then(toBalance);
}

/** Read both counters for the card being acted on. */
async function readBalances(
  ctx: ActionStrategyContext,
): Promise<InvitationBalances> {
  const [invitations, halfInvitations] = await Promise.all([
    readBalanceField(ctx, INVITATION_CONFIG.invitationsFieldId),
    readBalanceField(ctx, INVITATION_CONFIG.halfInvitationFieldId),
  ]);
  return { invitations, halfInvitations };
}

/**
 * Read the card's R4 purchase-mode flag.
 *
 * Not routed through `readBalanceField`: that helper's `ctx.currentValue`
 * short-circuit is only valid for the action's TARGET field, and this flag is
 * never the target of either handled action — the repointed-target guard in
 * `handleAction` guarantees the target is INVITATIONS.
 */
function readPurchaseMode(ctx: ActionStrategyContext): Promise<boolean> {
  return ctx.readField(INVITATION_CONFIG.purchaseModeFieldId).then(toFlag);
}

/**
 * Fetch this card's executions of one action definition that happened on the
 * given local day.
 *
 * Rows come back newest-first, so the walk stops at the first row belonging to
 * an earlier local day. Only `log_type = "action"` rows are requested —
 * lifecycle and scan rows carry no settlement and must never be counted.
 *
 * The day is the coarse filter; the five-hour window is applied afterwards by
 * `buildRefundCounters`, which is pure. Collecting the whole day and narrowing
 * in memory keeps the paging loop's stop condition a simple string comparison.
 *
 * @param ctx                - The strategy context (card-scoped reader).
 * @param actionDefinitionId - Which action's executions to collect.
 * @param today              - The local day to collect, as `YYYY-MM-DD`.
 * @returns The matching rows, newest first.
 */
async function collectSameDayExecutions(
  ctx: ActionStrategyContext,
  actionDefinitionId: string,
  today: string,
): Promise<ActionHistoryRecord[]> {
  const collected: ActionHistoryRecord[] = [];

  for (let page = 0; page < HISTORY_MAX_PAGES; page += 1) {
    const rows = await ctx.getCardActionHistory({
      logType: "action",
      actionDefinitionId,
      limit: HISTORY_PAGE_SIZE,
      offset: page * HISTORY_PAGE_SIZE,
    });

    let reachedPreviousDay = false;
    for (const row of rows) {
      const rowDate = resolveLocalDate(row.executedAt);
      if (rowDate < today) {
        reachedPreviousDay = true;
        break;
      }
      if (rowDate === today) collected.push(row);
    }

    if (reachedPreviousDay || rows.length < HISTORY_PAGE_SIZE) break;
  }

  return collected;
}

// ─── Edges — writes ──────────────────────────────────────────────────────────

/**
 * Persist a decision.
 *
 * `executeAction` writes exactly one field — the action's target — from the
 * returned `newValue`. Both handled actions target INVITATIONS (enforced by the
 * guard in `handleAction`), so `newValue` is always the new INVITATIONS balance
 * and HALF_INVITATION is always the auxiliary write.
 *
 * TARGETING IS NOT MUTATING. Three of the five settlements leave INVITATIONS
 * exactly as it was and move HALF_INVITATION — or nothing — instead:
 *
 *   half_spent    — R1.1: the half credit paid; INVITATIONS unchanged.
 *   half_refunded — R2.3: a half credit returned; INVITATIONS unchanged.
 *   none          — R2.4: cap reached; neither counter moves.
 *
 * Returning `before.invitations` in those cases is correct, not a missed write.
 * `executeAction` will log `before_value === after_value` for them; the real
 * mutation is recorded in `metadata.invitationSettlement`.
 *
 * NON-ATOMICITY: the Neon HTTP driver has no interactive transactions, so the
 * auxiliary write, the target write and the log insert are three separate
 * statements — a failure between them can leave the two counters inconsistent.
 * This is the same trade-off already documented on `executeAction` and on
 * `ActionStrategyHelpers.setFieldValue`, and is not worked around here.
 *
 * RACE WINDOW: two concurrent executions on the same card both read the balance
 * before either writes, so both settle against the same pre-state — two entries
 * can spend the same credit, and two exits can refund past the cap. Inherent to
 * the same driver limitation; the operator workflow (one operator, one card at a
 * time at a physical gate) makes it a theoretical rather than practical concern.
 */
async function applyDecision(
  ctx: ActionStrategyContext,
  decision: SettlementDecision,
  before: InvitationBalances,
  today: string,
  purchaseMode: boolean,
): Promise<ActionStrategyResult> {
  const { next } = decision;

  // Auxiliary write, only when the half-credit counter actually moved.
  if (next.halfInvitations !== before.halfInvitations) {
    await ctx.setFieldValue(
      INVITATION_CONFIG.halfInvitationFieldId,
      next.halfInvitations,
    );
  }

  return {
    newValue: next.invitations,
    metadata: {
      [SETTLEMENT_METADATA_KEY]: decision.settlement,
      [DATE_METADATA_KEY]: today,
      [MODE_METADATA_KEY]: (purchaseMode
        ? "purchase"
        : "duration") satisfies InvitationMode,
    },
  };
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * R1 — GUEST_ENTRY: spend a half credit if there is one, otherwise a full
 * invitation. R4.1 only decides how the latter is marked.
 */
async function handleGuestEntry(
  ctx: ActionStrategyContext,
  today: string,
): Promise<ActionStrategyResult> {
  // One wave: the flag read rides alongside the balance reads rather than
  // adding a round trip in front of them.
  const [balances, purchaseMode] = await Promise.all([
    readBalances(ctx),
    readPurchaseMode(ctx),
  ]);

  const decision = decideEntry(balances, purchaseMode);
  return applyDecision(ctx, decision, balances, today, purchaseMode);
}

/**
 * R2 — GUEST_EXIT: refund one half-invitation while the five-hour window still
 * holds unrefunded full-invitation entries. R4.2 short-circuits the whole rule.
 *
 * The flag is read in its own wave, ahead of the history, precisely so that a
 * purchase-mode card never pays for the two same-day history reads it has no
 * use for. That is the literal meaning of "no time logic" for these cards, not
 * an optimisation layered on top of it.
 */
async function handleGuestExit(
  ctx: ActionStrategyContext,
  today: string,
  now: Date,
): Promise<ActionStrategyResult> {
  const [balances, purchaseMode] = await Promise.all([
    readBalances(ctx),
    readPurchaseMode(ctx),
  ]);

  if (purchaseMode) {
    const decision = decideExit(balances, null);
    return applyDecision(ctx, decision, balances, today, true);
  }

  const [entryRecords, exitRecords] = await Promise.all([
    collectSameDayExecutions(ctx, INVITATION_CONFIG.guestEntryActionId, today),
    collectSameDayExecutions(ctx, INVITATION_CONFIG.guestExitActionId, today),
  ]);

  const counters = buildRefundCounters(entryRecords, exitRecords, now);

  const decision = decideExit(balances, counters);
  return applyDecision(ctx, decision, balances, today, false);
}

/**
 * Every action other than GUEST_ENTRY / GUEST_EXIT.
 *
 * Mirrors `StandardActionStrategy` exactly, and returns no metadata, so those
 * executions are indistinguishable from a standard tenant's — field value,
 * audit log and result all byte-identical.
 */
function handleStandardAction(ctx: ActionStrategyContext): ActionStrategyResult {
  const cfg = ctx.action.config as { amount?: number } | null;
  const amount = cfg?.amount ?? 1;

  return {
    newValue: computeNewValue(ctx.action.actionType, ctx.currentValue, amount),
  };
}

// ─── Strategy ────────────────────────────────────────────────────────────────

export const InvitationActionStrategy: TenantActionStrategy = {
  key: "invitation",

  async handleAction(
    ctx: ActionStrategyContext,
  ): Promise<ActionStrategyResult> {
    // Branch on the action's UUID, never on its name — names are tenant-editable.
    const isEntry = ctx.action.id === INVITATION_CONFIG.guestEntryActionId;
    const isExit = ctx.action.id === INVITATION_CONFIG.guestExitActionId;

    if (!isEntry && !isExit) return handleStandardAction(ctx);

    // Repointed-target guard. Both handled actions are expected to target
    // INVITATIONS. If a master has repointed one at another field, the tenant's
    // action definitions no longer match what these rules describe, and settling
    // a balance against them would corrupt whatever field they now write.
    //
    // Fall through to standard behaviour rather than throwing: this is an
    // access-control product, and a misconfiguration must never leave a person
    // stuck at the door. Degrading to the plain increment/decrement the action
    // definition literally says is the safe failure — visibly wrong accounting
    // beats a gate that will not open. The warning is what makes it visible.
    if (ctx.action.targetField.id !== INVITATION_CONFIG.invitationsFieldId) {
      // Unguarded by NODE_ENV, unlike the dev-only notice in
      // `src/lib/validation/engine.ts`: this one reports a live
      // misconfiguration silently disabling the tenant's accounting, so it has
      // to reach the production runtime logs.
      console.warn(
        `[invitation-strategy] Action "${ctx.action.id}" targets field ` +
          `"${ctx.action.targetField.id}" (${ctx.action.targetField.name}), not the ` +
          `configured INVITATIONS field "${INVITATION_CONFIG.invitationsFieldId}". ` +
          `Invitation accounting is DISABLED for this execution and standard ` +
          `behaviour applied instead. Repoint the action or update ` +
          `INVITATION_CONFIG in src/lib/action-strategies/invitation-strategy.ts.`,
      );
      return handleStandardAction(ctx);
    }

    // One clock read per execution, shared by the elapsed-time arithmetic, the
    // day filter and the marker, so a single execution can never disagree with
    // itself about when it happened.
    //
    // Note: `action_logs.executed_at` defaults to the DB's now(), a few
    // milliseconds after this, so the instant a later exit measures against is
    // marginally later than the one the entry settled with. Sub-second skew
    // against a five-hour threshold; the alternative (a strategy-supplied
    // executed_at) is a change to executeAction.
    const now = new Date();
    const today = resolveLocalDate(now);

    return isEntry
      ? handleGuestEntry(ctx, today)
      : handleGuestExit(ctx, today, now);
  },
};

/**
 * Invitation Action Strategy — guest entry / exit accounting
 *
 * Custom action strategy for the single tenant whose `tenants.scan_strategy` is
 * `"invitation"`. That tenant sells guest access on a half-day basis and keeps
 * the balance on two number fields of the card:
 *
 *   INVITATIONS      — full invitations. One covers a whole day.
 *   HALF_INVITATION  — half-invitation credits. One covers a single time slot.
 *
 * A *time slot* is derived from the execution timestamp in the tenant's civil
 * timezone (never from the raw UTC instant):
 *
 *   MORNING    — local time before 15:00
 *   AFTERNOON  — local time from 15:00 onwards
 *
 * ─── Rules ───────────────────────────────────────────────────────────────────
 *
 * R1 · GUEST_ENTRY
 *   1. HALF_INVITATION > 0  → spend one half credit. INVITATIONS untouched.
 *                             This entry is NOT refundable.
 *   2. otherwise            → spend one full invitation. This entry IS
 *                             refundable (see R2).
 *
 * R2 · GUEST_EXIT — with `S` the slot of the exit and `D` today's local date:
 *   1. spent    = GUEST_ENTRY executions on this card, on `D`, in slot `S`,
 *                 that consumed a full INVITATIONS unit (R1.2).
 *   2. refunded = GUEST_EXIT executions on this card, on `D`, in slot `S`,
 *                 that already granted a half-invitation.
 *   3. refunded < spent → grant one HALF_INVITATION.
 *   4. otherwise        → no balance change.
 *
 *   The cap is therefore self-enforcing: at most one half-invitation returned
 *   per full invitation consumed, per slot, per day. An exit in a different slot
 *   than its entry never refunds — the guest occupied both slots.
 *
 * Every other action on this tenant falls through to the standard behaviour
 * (`handleStandardAction`), byte-identical to `StandardActionStrategy`. So does
 * a handled action whose target field has been repointed away from INVITATIONS
 * — see the guard in `handleAction`.
 *
 * Both handled actions TARGET the INVITATIONS field, but three of the four
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
 * The decision logic is a set of exported pure functions (slot resolution,
 * settlement counting, entry/exit decisions). The DB reads and writes live at
 * the edges, in `handleGuestEntry` / `handleGuestExit` / `applyDecision`, so the
 * rules can be unit-tested without a database.
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
const INVITATION_CONFIG = {
  invitationsFieldId: "d48eec1b-2de1-4342-9e23-43da269db1f8",
  halfInvitationFieldId: "4fbac0d2-6820-4921-b1f7-5be35b2abab7",
  guestEntryActionId: "dd2461c6-fadd-4f98-91e0-571184747e9c",
  guestExitActionId: "5cd7a02f-f9a1-4a85-9406-a1022897a3c9",
} as const;

/**
 * The tenant's civil timezone. "Today" and the slot boundary are always
 * evaluated here, never in UTC — in summer Madrid is UTC+2, so an entry at
 * 00:30 local belongs to the previous UTC day and would be counted against the
 * wrong day if the raw instant were used.
 *
 * Deliberately a single hardcoded constant: making it configurable is out of
 * scope, and keeping it in one place is what makes that change a one-liner.
 */
const TENANT_TIME_ZONE = "Europe/Madrid";

/** Local hour at which the AFTERNOON slot begins. Before it, MORNING. */
const AFTERNOON_START_HOUR = 15;

/** One guest entry costs exactly one credit (full or half). */
const ENTRY_COST = 1;

/** A qualifying exit returns exactly one half-invitation. */
const REFUND_AMOUNT = 1;

/** Key under which the settlement marker is stored in `action_logs.metadata`. */
const SETTLEMENT_METADATA_KEY = "invitationSettlement";

/** Diagnostic keys written alongside the marker (never read back by the rules;
 *  they exist so an auditor can see which day/slot a row was settled against
 *  without recomputing the timezone conversion). */
const SLOT_METADATA_KEY = "invitationSlot";
const DATE_METADATA_KEY = "invitationDate";

/**
 * History paging. `getCardActionHistory` returns newest-first, so the scan stops
 * as soon as it reaches a row older than today; the page cap is a safety belt
 * against an unbounded loop, not an expected limit — it allows 500 executions of
 * a single action on a single card in one day.
 */
const HISTORY_PAGE_SIZE = 100;
const HISTORY_MAX_PAGES = 5;

// ─── Types ───────────────────────────────────────────────────────────────────

/** The half-day window an execution belongs to. */
export type InvitationSlot = "MORNING" | "AFTERNOON";

/**
 * What an execution did to the balance. Written to the log on every entry/exit
 * and read back to evaluate the R2 refund cap.
 *
 *   full_spent    — GUEST_ENTRY consumed one INVITATIONS unit (refundable).
 *   half_spent    — GUEST_ENTRY consumed one HALF_INVITATION (not refundable).
 *   half_refunded — GUEST_EXIT granted one HALF_INVITATION.
 *   none          — GUEST_EXIT that did not refund (cap already reached).
 */
export type InvitationSettlement =
  | "full_spent"
  | "half_spent"
  | "half_refunded"
  | "none";

/** A calendar day + slot in the tenant's timezone. */
export interface LocalMoment {
  /** Local calendar day as `YYYY-MM-DD` (lexicographically comparable). */
  date: string;
  /** The half-day window. */
  slot: InvitationSlot;
}

/** The card's two invitation counters. */
export interface InvitationBalances {
  invitations: number;
  halfInvitations: number;
}

/** How many refundable entries and granted refunds exist in the current slot. */
export interface SlotCounters {
  /** GUEST_ENTRY executions in this slot that consumed a full invitation. */
  spent: number;
  /** GUEST_EXIT executions in this slot that already granted a half. */
  refunded: number;
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
 * comparatively expensive and the counting pass formats every history row.
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
      // h23 rather than `hour12: false`: the latter renders midnight as "24"
      // in several locales, which would push it into the AFTERNOON slot.
      hourCycle: "h23",
      hour: "2-digit",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Map a local hour to its slot.
 *
 * @param localHour - Hour of day (0–23) in the tenant's timezone.
 * @returns MORNING before {@link AFTERNOON_START_HOUR}, AFTERNOON from it on.
 */
export function resolveSlot(localHour: number): InvitationSlot {
  return localHour < AFTERNOON_START_HOUR ? "MORNING" : "AFTERNOON";
}

/**
 * Convert an instant to the tenant's local calendar day + slot.
 *
 * @param instant  - The UTC instant (an execution timestamp).
 * @param timeZone - IANA timezone; defaults to the tenant's.
 * @returns The local day (`YYYY-MM-DD`) and its slot.
 */
export function resolveLocalMoment(
  instant: Date,
  timeZone: string = TENANT_TIME_ZONE,
): LocalMoment {
  const parts = localFormatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    slot: resolveSlot(Number(get("hour"))),
  };
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

/** Type guard for the settlement marker read back out of jsonb. */
function isSettlement(value: unknown): value is InvitationSettlement {
  return (
    value === "full_spent" ||
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
 * Count the records carrying a given settlement marker within one day + slot.
 *
 * Pure over the record list: the caller supplies whatever rows it fetched and
 * this re-derives each row's local moment, so the filter cannot disagree with
 * the moment the decision is being made for.
 *
 * @param records    - Decoded `action_logs` rows (any order).
 * @param settlement - The marker to count.
 * @param moment     - The day + slot to restrict to.
 * @param timeZone   - IANA timezone; defaults to the tenant's.
 * @returns How many records match.
 */
export function countSettlements(
  records: ActionHistoryRecord[],
  settlement: InvitationSettlement,
  moment: LocalMoment,
  timeZone: string = TENANT_TIME_ZONE,
): number {
  let total = 0;
  for (const record of records) {
    if (readSettlement(record) !== settlement) continue;
    const recordMoment = resolveLocalMoment(record.executedAt, timeZone);
    if (recordMoment.date === moment.date && recordMoment.slot === moment.slot) {
      total += 1;
    }
  }
  return total;
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
 * @param balances - Current counters.
 * @returns The settlement and the resulting balances.
 */
export function decideEntry(balances: InvitationBalances): SettlementDecision {
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
    settlement: "full_spent",
    next: {
      invitations: balances.invitations - ENTRY_COST,
      halfInvitations: balances.halfInvitations,
    },
  };
}

/**
 * R2 — decide whether a GUEST_EXIT refunds a half-invitation.
 *
 * The comparison IS the cap: one refund per full invitation consumed in the
 * same slot on the same day. An exit whose entry was paid with a half credit
 * (or that happened in the other slot) finds `spent` at 0 and refunds nothing.
 *
 * @param balances - Current counters.
 * @param counters - Same-slot entry/refund counts from the log.
 * @returns The settlement and the resulting balances.
 */
export function decideExit(
  balances: InvitationBalances,
  counters: SlotCounters,
): SettlementDecision {
  if (counters.refunded < counters.spent) {
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
 * Fetch this card's executions of one action definition that happened on the
 * given local day.
 *
 * Rows come back newest-first, so the walk stops at the first row belonging to
 * an earlier local day. Only `log_type = "action"` rows are requested —
 * lifecycle and scan rows carry no settlement and must never be counted.
 *
 * @param ctx                - The strategy context (card-scoped reader).
 * @param actionDefinitionId - Which action's executions to collect.
 * @param moment             - The local day to collect (slot ignored here).
 * @returns The matching rows, newest first.
 */
async function collectSameDayExecutions(
  ctx: ActionStrategyContext,
  actionDefinitionId: string,
  moment: LocalMoment,
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
      const rowDate = resolveLocalMoment(row.executedAt).date;
      if (rowDate < moment.date) {
        reachedPreviousDay = true;
        break;
      }
      if (rowDate === moment.date) collected.push(row);
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
 * TARGETING IS NOT MUTATING. Three of the four settlements leave INVITATIONS
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
  moment: LocalMoment,
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
      [SLOT_METADATA_KEY]: moment.slot,
      [DATE_METADATA_KEY]: moment.date,
    },
  };
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * R1 — GUEST_ENTRY: spend a half credit if there is one, otherwise a full
 * invitation.
 */
async function handleGuestEntry(
  ctx: ActionStrategyContext,
  moment: LocalMoment,
): Promise<ActionStrategyResult> {
  const balances = await readBalances(ctx);
  const decision = decideEntry(balances);
  return applyDecision(ctx, decision, balances, moment);
}

/**
 * R2 — GUEST_EXIT: refund one half-invitation while this slot still has
 * unrefunded full-invitation entries.
 */
async function handleGuestExit(
  ctx: ActionStrategyContext,
  moment: LocalMoment,
): Promise<ActionStrategyResult> {
  const [balances, entryRecords, exitRecords] = await Promise.all([
    readBalances(ctx),
    collectSameDayExecutions(ctx, INVITATION_CONFIG.guestEntryActionId, moment),
    collectSameDayExecutions(ctx, INVITATION_CONFIG.guestExitActionId, moment),
  ]);

  const counters: SlotCounters = {
    spent: countSettlements(entryRecords, "full_spent", moment),
    refunded: countSettlements(exitRecords, "half_refunded", moment),
  };

  const decision = decideExit(balances, counters);
  return applyDecision(ctx, decision, balances, moment);
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

    // One clock read per execution, shared by the decision and the marker, so a
    // single execution can never straddle the 15:00 boundary internally.
    //
    // Note: `action_logs.executed_at` defaults to the DB's now(), a few
    // milliseconds after this. An execution landing exactly on the boundary can
    // therefore be settled as MORNING but logged with an AFTERNOON timestamp,
    // making a later exit read it as a different slot. Sub-second window; the
    // alternative (a strategy-supplied executed_at) is a change to executeAction.
    const moment = resolveLocalMoment(new Date());

    return isEntry
      ? handleGuestEntry(ctx, moment)
      : handleGuestExit(ctx, moment);
  },
};

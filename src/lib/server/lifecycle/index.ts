/**
 * Card / card type lifecycle service — barrel export.
 *
 * Three-state model plus a reserved fourth:
 *   active   → operational
 *   inactive → switched off, kept forever, never in the trash
 *   expired  → cards only; reserved for future automatic expiry, behaves as
 *              `inactive` everywhere today
 *   archived → in the trash, counting down to physical deletion
 *
 * See ADR `docs/context/decisions/2026-07-17-card-lifecycle-archiving.md`.
 */

export {
  activateCard,
  deactivateCard,
  archiveCard,
  restoreCard,
  type LifecycleActor,
} from "./cards";

export {
  activateCardType,
  deactivateCardType,
  archiveCardType,
  restoreCardType,
  type CardTypeCascadeResult,
} from "./card-types";

export {
  getEffectiveRetentionDays,
  computePurgeDueAt,
  daysUntilPurge,
} from "./retention";

export {
  hardDeleteArchivedCard,
  hardDeleteArchivedCardType,
  hardDeleteAllArchived,
  purgeExpiredArchivedRecords,
  type EmptyTrashResult,
  type TenantPurgeSummary,
  type PurgeResult,
} from "./purge";

export {
  assertTransitionAllowed,
  assertCanRestore,
  targetStatus,
  isOff,
  isArchived,
  OFF_STATUSES,
  LIVE_STATUSES,
  type LifecycleTransition,
} from "./state-machine";

export {
  resolveLifecycleGate,
  buildLifecycleScanCheck,
  type LifecycleGateOutcome,
  type LifecycleGateResult,
} from "./scan-gate";

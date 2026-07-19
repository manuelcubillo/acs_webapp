/**
 * Lifecycle scan gate — pure logic, no I/O.
 *
 * Single source of truth for what a card's lifecycle status means the moment it
 * is scanned or acted upon. Reused by the operational scan pipeline, manual
 * action execution and the external device API so the semantics can never drift
 * between entry points. Testable without a database (status × flag matrix).
 *
 * See ADR `docs/context/decisions/2026-07-17-card-lifecycle-scan-behaviour.md`.
 */

import type { LifecycleStatus } from "@/lib/dal/types";
import type { ScanValidationCheck } from "@/lib/validation/scan-validator";
import {
  LIFECYCLE_SCAN_FIELD_LABEL,
  LIFECYCLE_SCAN_MESSAGES,
} from "@/lib/validation/messages";
import { isArchived, isOff } from "./state-machine";

/** The four verdicts the gate can reach. */
export type LifecycleGateOutcome =
  | "allowed"
  | "requires_override"
  | "blocked"
  | "denied_archived";

/** Result of evaluating the lifecycle gate for a card. */
export interface LifecycleGateResult {
  /** The verdict. */
  outcome: LifecycleGateOutcome;
  /** The status that produced the verdict (echoed for consumers / UI). */
  status: LifecycleStatus;
  /**
   * True only for `requires_override` — the operator may continue through the
   * override modal. Never true for `blocked` or `denied_archived`.
   */
  overridable: boolean;
  /**
   * Human-readable reason, null when `allowed`. Used as the scan-validation
   * message, the override audit reason, and the external API denial body.
   */
  reason: string | null;
}

/**
 * Resolve the lifecycle gate for a card being scanned or acted upon.
 *
 * Semantics:
 *   active            → allowed (normal flow)
 *   inactive/expired  → requires_override when the tenant allows overriding
 *                       error-level failures, otherwise blocked
 *   archived          → denied_archived (hard denial, never overridable)
 *
 * `expired` is treated exactly like `inactive` (see `OFF_STATUSES`).
 *
 * @param status               - The card's current lifecycle status.
 * @param allowOverrideOnError - The tenant `allow_override_on_error` flag.
 * @returns The gate verdict, the reason, and whether it is overridable.
 */
export function resolveLifecycleGate(
  status: LifecycleStatus,
  allowOverrideOnError: boolean,
): LifecycleGateResult {
  if (isArchived(status)) {
    return {
      outcome: "denied_archived",
      status,
      overridable: false,
      reason: LIFECYCLE_SCAN_MESSAGES.archived,
    };
  }

  if (isOff(status)) {
    const reason = LIFECYCLE_SCAN_MESSAGES[status as "inactive" | "expired"];
    return allowOverrideOnError
      ? { outcome: "requires_override", status, overridable: true, reason }
      : { outcome: "blocked", status, overridable: false, reason };
  }

  // active (and any future live status not grouped as "off")
  return { outcome: "allowed", status, overridable: false, reason: null };
}

/**
 * Build a synthetic error-level scan-validation check representing a card's
 * lifecycle status. Prepended to the real scan-validation results so the
 * existing override machinery (pause / block / audit) handles a switched-off
 * card without any special-casing in the auto-action loop.
 *
 * Only meaningful for non-active statuses; `active` has no reason to surface.
 * The synthetic check carries no `fieldDefinitionId` (it is not a real field)
 * and a distinctive `rule` / `scanValidationId` so consumers can recognise it.
 *
 * @param status - The card's lifecycle status (inactive | expired | archived).
 * @returns A failed, error-severity `ScanValidationCheck`.
 */
export function buildLifecycleScanCheck(
  status: LifecycleStatus,
): ScanValidationCheck {
  const message =
    LIFECYCLE_SCAN_MESSAGES[status as keyof typeof LIFECYCLE_SCAN_MESSAGES] ??
    LIFECYCLE_SCAN_MESSAGES.inactive;
  return {
    scanValidationId: `lifecycle:${status}`,
    fieldDefinitionId: "",
    fieldLabel: LIFECYCLE_SCAN_FIELD_LABEL,
    rule: "lifecycle_status",
    passed: false,
    severity: "error",
    message,
  };
}

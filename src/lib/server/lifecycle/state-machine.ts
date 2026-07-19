/**
 * Lifecycle state machine — pure logic, no I/O.
 *
 * Every transition rule lives here as a pure function so it can be unit-tested
 * without a database. The executors in `cards.ts` / `card-types.ts` own the SQL;
 * this module owns the rules.
 *
 * States (see `lifecycle_status` in the schema):
 *   active   → operational
 *   inactive → switched off, kept forever
 *   expired  → cards only; reserved for a future automatic expiry mechanism.
 *              Treated EXACTLY like `inactive` by every rule below.
 *   archived → in the trash, pending physical deletion by the purge job
 */

import { ValidationError } from "@/lib/dal/errors";
import type { LifecycleStatus } from "@/lib/dal/types";

/** The four transitions the lifecycle service exposes. */
export type LifecycleTransition =
  | "activate"
  | "deactivate"
  | "archive"
  | "restore";

/**
 * Statuses that behave as "switched off but alive".
 *
 * `expired` is grouped with `inactive` deliberately: nothing sets it today, and
 * until the automatic expiry mechanism exists it must not diverge in behaviour.
 */
export const OFF_STATUSES: readonly LifecycleStatus[] = ["inactive", "expired"];

/** Statuses a row may hold when it is not in the trash. */
export const LIVE_STATUSES: readonly LifecycleStatus[] = [
  "active",
  "inactive",
  "expired",
];

/** True when the status means "alive but switched off". */
export function isOff(status: LifecycleStatus): boolean {
  return OFF_STATUSES.includes(status);
}

/** True when the row is in the trash. */
export function isArchived(status: LifecycleStatus): boolean {
  return status === "archived";
}

/**
 * Source statuses accepted by each transition.
 *
 * `restore` is absent: its target is `status_before_archive`, not a constant,
 * so it is validated by {@link assertCanRestore} instead.
 */
const ALLOWED_SOURCES: Record<
  Exclude<LifecycleTransition, "restore">,
  readonly LifecycleStatus[]
> = {
  // Turning a switched-off row back on. Archived rows must be restored first.
  activate: ["inactive", "expired"],
  // Only an active row can be switched off; the others already are.
  deactivate: ["active"],
  // Anything alive can go to the trash.
  archive: ["active", "inactive", "expired"],
};

/** Human-readable status names for error messages. */
const STATUS_LABEL: Record<LifecycleStatus, string> = {
  active: "active",
  inactive: "inactive",
  expired: "expired",
  archived: "archived",
};

/**
 * Validate a transition's source status.
 *
 * @param transition - The transition being attempted.
 * @param current    - The row's current status.
 * @param entity     - Entity name used in the error message ("Card" | "CardType").
 * @throws {ValidationError} If the transition is not legal from `current`.
 */
export function assertTransitionAllowed(
  transition: Exclude<LifecycleTransition, "restore">,
  current: LifecycleStatus,
  entity: string,
): void {
  const allowed = ALLOWED_SOURCES[transition];
  if (allowed.includes(current)) return;

  // Archived rows get a more actionable message than a bare list of states.
  if (isArchived(current)) {
    throw new ValidationError(
      `Cannot ${transition} ${entity} because it is archived. ` +
        `Restore it from the trash first.`,
    );
  }

  throw new ValidationError(
    `Cannot ${transition} ${entity} from status "${STATUS_LABEL[current]}". ` +
      `Allowed source statuses: ${allowed.map((s) => STATUS_LABEL[s]).join(", ")}.`,
  );
}

/**
 * Validate a restore.
 *
 * @param current             - The row's current status; must be `archived`.
 * @param statusBeforeArchive - The status to return to.
 * @param entity              - Entity name used in the error message.
 * @returns The status the row must be restored to.
 * @throws {ValidationError} If the row is not archived, or its trash metadata is
 *   unusable (which the DB CHECK constraints should already prevent).
 */
export function assertCanRestore(
  current: LifecycleStatus,
  statusBeforeArchive: LifecycleStatus | null,
  entity: string,
): LifecycleStatus {
  if (!isArchived(current)) {
    throw new ValidationError(
      `Cannot restore ${entity} because it is not archived ` +
        `(current status: "${STATUS_LABEL[current]}").`,
    );
  }

  if (statusBeforeArchive === null || isArchived(statusBeforeArchive)) {
    throw new ValidationError(
      `Cannot restore ${entity}: its pre-archive status is missing or invalid. ` +
        `This indicates corrupted trash metadata.`,
    );
  }

  return statusBeforeArchive;
}

/**
 * Resolve the target status of a transition.
 * `restore` is excluded — its target comes from {@link assertCanRestore}.
 *
 * @param transition - The transition being applied.
 * @returns The status to write.
 */
export function targetStatus(
  transition: Exclude<LifecycleTransition, "restore">,
): LifecycleStatus {
  switch (transition) {
    case "activate":
      return "active";
    case "deactivate":
      return "inactive";
    case "archive":
      return "archived";
  }
}

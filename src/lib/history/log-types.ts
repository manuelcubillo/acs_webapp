/**
 * Log types as `/history` presents them.
 *
 * `/history` is the audit surface, so it shows every `log_type`: operational
 * scans, action executions, manual edits (`card_edit`, added by migration 0022)
 * and lifecycle transitions. The dashboard FEED is an operational surface and
 * deliberately shows only `scan` and `action` — see `getActivityFeed`.
 *
 * PURE and dependency-free: the filter panel (client), the table row (client)
 * and the CSV builder (server) all read from here, so a row's label and its
 * exported label cannot drift. That drift is exactly how a presence row once
 * read "Presencia" in the table and "Entrada" in the export.
 *
 * Spanish, not i18n-wrapped; i18n is out of scope project-wide.
 */

import { readBooleanAfterValue } from "@/lib/dal/metadata-keys";
import { presenceDirectionLabel } from "@/lib/presence/labels";
import { lifecycleStatusLabel } from "@/lib/cards/lifecycle-labels";
import type { LogType } from "@/lib/dal/types";

/** Every log type, in the order the filter panel offers them. */
export const HISTORY_LOG_TYPES: readonly LogType[] = [
  "scan",
  "action",
  "card_edit",
  "lifecycle",
] as const;

export const LOG_TYPE_LABEL: Record<LogType, string> = {
  scan: "Escaneo",
  action: "Acción",
  card_edit: "Edición",
  lifecycle: "Ciclo de vida",
};

/** The minimum a row must expose for its label to be derived. */
export interface LabelableRow {
  logType: LogType;
  actionName: string | null;
  isPresence: boolean;
  metadata: Record<string, unknown> | null;
}

/**
 * The text the "Acción" column shows for one row.
 *
 * Precedence, and the reasons for it:
 *   1. A presence toggle reads by DIRECTION — "Presencia" tells an operator
 *      nothing about which way the person went.
 *   2. Anything else with an action definition reads by that action's name.
 *   3. Everything else reads by its log type. A `card_edit` or `lifecycle` row
 *      has no action definition at all, so without this it would fall through
 *      to the scan label and claim to be something it is not.
 *
 * @param row - Any row carrying the four fields above.
 * @returns The column text.
 */
export function historyRowLabel(row: LabelableRow): string {
  if (row.isPresence) {
    const after = readBooleanAfterValue(row.metadata);
    // Falls back to the action name when the after-value is unreadable, or when
    // the tenant later disabled presence and the flag no longer derives.
    if (after !== null) return presenceDirectionLabel(after);
  }
  if (row.logType === "action" && row.actionName) return row.actionName;
  return LOG_TYPE_LABEL[row.logType];
}

/**
 * A lifecycle row's transition, spelled out: `Activo → Archivado`.
 *
 * Lifecycle rows carry no `card_snapshot_id` — a status change is not a field
 * change — so the Detail column reads their `metadata.from` / `metadata.to`
 * instead of a snapshot diff. See `LifecycleLogMeta` in
 * `src/lib/server/lifecycle/cards.ts`.
 *
 * @param metadata - The row's `action_logs.metadata`.
 * @returns The transition, or null when the keys are missing.
 */
export function lifecycleTransitionLabel(
  metadata: Record<string, unknown> | null,
): string | null {
  if (!metadata) return null;
  if (metadata.from === undefined && metadata.to === undefined) return null;
  return `${lifecycleStatusLabel(metadata.from)} → ${lifecycleStatusLabel(metadata.to)}`;
}

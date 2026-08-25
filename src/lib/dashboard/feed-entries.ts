/**
 * Client-side activity feed row construction.
 *
 * The dashboard does not poll. When the operator scans, the client appends the
 * rows that scan just produced, built from what the scan action already
 * returned — no extra round trip. Only the manual refresh button goes back to
 * the server, and it replaces the list wholesale with server-built rows, so
 * these never need reconciling.
 *
 * These rows MIRROR what `executeScanWithAutoActionsAction` writes to
 * `action_logs`. Keep them in step with `src/lib/actions/cards.ts` or a refresh
 * will visibly reshuffle the feed:
 *   - The scan row is always written, and written first.
 *   - One 'action' row per auto-action that SUCCEEDED. A failed one writes
 *     nothing: its log is emitted after the mutation, so a throw skips it.
 *   - Newest-first therefore reads: last action … first action, then the scan.
 *
 * Two deliberate divergences from server-built rows:
 *   - `id` is a client UUID. It is only ever React's list key — no row renders
 *     it, and a refresh swaps in rows carrying real log ids anyway.
 *   - `executedAt` comes from the client clock, which drifts from the server's.
 *     Rows are therefore PREPENDED in order, never sorted by `executedAt`.
 *
 * See ADR 2026-07-17-dashboard-feed-no-polling.md.
 */

import type {
  ActivityFeedEntry,
  ActivityFeedSummaryField,
  AutoActionResult,
  CardWithFields,
  FeedSummaryFieldConfig,
} from "@/lib/dal";
import { cardPhotoRoute } from "@/lib/storage/photo-routes";

/**
 * Static per-tenant data the client needs to build a row, sent once at page
 * load. See `getFeedSummaryFieldConfig`.
 */
export interface FeedBuilderConfig {
  /** cardTypeId → display name. A card carries only the id. */
  cardTypeNames: Record<string, string>;
  /** cardTypeId → ordered summary field config. */
  summaryFields: Record<string, FeedSummaryFieldConfig[]>;
  /**
   * cardTypeId → the card type's system presence action id, for card types
   * that have presence enabled.
   *
   * The server derives `isPresence` by comparing the action's TARGET FIELD to
   * the card type's designation; the client cannot see target fields, so it
   * compares action ids instead. Both identify the same row — see
   * `getPresenceActionIdsByCardType`, which is the single producer of this map
   * and derives it from the same designation.
   */
  presenceActionIds: Record<string, string>;
}

/** What the tenant's dashboard settings allow the feed to show. */
export interface FeedVisibility {
  showScanEntries: boolean;
  showActionEntries: boolean;
  feedLimit: number;
}

function buildSummaryFields(
  card: CardWithFields,
  config: FeedSummaryFieldConfig[],
): ActivityFeedSummaryField[] {
  const valueByFieldId = new Map(
    card.fields.map((f) => [f.fieldDefinitionId, f.value]),
  );

  return config.map((def) => ({
    fieldDefinitionId: def.fieldDefinitionId,
    label: def.label,
    fieldType: def.fieldType,
    // A field left empty has no value row, so it is absent from card.fields.
    // getActivityFeed emits null for it and the row renders "—" — match that
    // rather than dropping the field.
    value: valueByFieldId.get(def.fieldDefinitionId) ?? null,
  }));
}

interface MakeEntryArgs {
  logType: ActivityFeedEntry["logType"];
  card: CardWithFields;
  config: FeedBuilderConfig;
  executedAt: Date;
  action?: { id: string; name: string } | null;
  operatorOverride?: boolean;
  /**
   * The scan row this action belongs to. Mirrors `metadata.scanLogId`, which
   * the server writes and `groupFeedRows` groups on — without it a
   * just-scanned card would show ungrouped rows until the next Refrescar.
   */
  scanLogId?: string | null;
  /** The value a presence toggle settled on, from the execution result. */
  presenceAfterValue?: boolean | null;
}

function makeEntry({
  logType,
  card,
  config,
  executedAt,
  action = null,
  operatorOverride = false,
  scanLogId = null,
  presenceAfterValue = null,
}: MakeEntryArgs): ActivityFeedEntry {
  // A photo field's value is a signed URL by the time it reaches the client
  // (the scan action signs them), so its mere presence means the card has a
  // photo — the same condition getActivityFeed and the photo route apply.
  const hasPhoto = card.fields.some(
    (f) =>
      f.fieldType === "photo" &&
      typeof f.value === "string" &&
      f.value.length > 0,
  );

  return {
    id: crypto.randomUUID(),
    logType,
    cardId: card.id,
    cardCode: card.code,
    cardTypeId: card.cardTypeId,
    cardTypeName: config.cardTypeNames[card.cardTypeId] ?? "",
    actionDefinitionId: action?.id ?? null,
    actionName: action?.name ?? null,
    cardPhotoUrl: hasPhoto ? cardPhotoRoute(card.code) : null,
    executedAt,
    // Neither is rendered by ActivityFeedEntryRow. `operatorOverride` is the
    // only thing the server derives from metadata, and the client knows it
    // first-hand — it is the one that ran the override flow.
    executedBy: null,
    metadata: null,
    operatorOverride,
    // A scan row anchors its own group, so it never carries a correlation.
    scanLogId: logType === "scan" ? null : scanLogId,
    isPresence:
      action !== null && config.presenceActionIds[card.cardTypeId] === action.id,
    presenceAfterValue,
    summaryFields: buildSummaryFields(
      card,
      config.summaryFields[card.cardTypeId] ?? [],
    ),
  };
}

/** Successful auto-actions, newest first. Failures wrote no log row. */
function actionEntries(
  card: CardWithFields,
  autoActions: AutoActionResult[],
  config: FeedBuilderConfig,
  executedAt: Date,
  operatorOverride: boolean,
  scanLogId: string | null,
): ActivityFeedEntry[] {
  const presenceActionId = config.presenceActionIds[card.cardTypeId];

  return autoActions
    .filter((a) => a.success)
    .map((a) =>
      makeEntry({
        logType: "action",
        card,
        config,
        executedAt,
        action: { id: a.actionDefinitionId, name: a.actionName },
        operatorOverride,
        scanLogId,
        // The server reads this from metadata.after_value; the client already
        // holds the same number in the execution result it was handed.
        presenceAfterValue:
          a.actionDefinitionId === presenceActionId &&
          typeof a.result?.newValue === "boolean"
            ? a.result.newValue
            : null,
      }),
    )
    .reverse();
}

function applyVisibility(
  entries: ActivityFeedEntry[],
  visibility: FeedVisibility,
): ActivityFeedEntry[] {
  return entries.filter((e) =>
    e.logType === "scan"
      ? visibility.showScanEntries
      : visibility.showActionEntries,
  );
}

export interface ScanEntriesArgs {
  card: CardWithFields;
  autoActions: AutoActionResult[];
  config: FeedBuilderConfig;
  visibility: FeedVisibility;
  /**
   * `action_logs.id` of the scan row the server just wrote, from
   * `ScanWithAutoActionsResult.scanLogId`.
   *
   * Used BOTH as the scan row's own `id` and as each action row's `scanLogId`,
   * so the locally-built rows group exactly as the server-built ones will after
   * a Refrescar. Passing the real id also removes the old "client rows carry a
   * throwaway UUID" divergence for scan rows specifically.
   */
  scanLogId?: string | null;
  /** Injectable for tests; defaults to now. */
  executedAt?: Date;
}

/**
 * Rows produced by one operational scan, newest first: the auto-actions that
 * ran (last one first), then the scan itself.
 */
export function buildScanEntries({
  card,
  autoActions,
  config,
  visibility,
  scanLogId = null,
  executedAt = new Date(),
}: ScanEntriesArgs): ActivityFeedEntry[] {
  const scanRow = makeEntry({ logType: "scan", card, config, executedAt });
  // The scan row anchors the group, so its id must be what the action rows
  // point at. Fall back to the generated one when no id was supplied — the rows
  // then simply render ungrouped rather than grouping under the wrong anchor.
  if (scanLogId) scanRow.id = scanLogId;

  return applyVisibility(
    [
      ...actionEntries(card, autoActions, config, executedAt, false, scanRow.id),
      scanRow,
    ],
    visibility,
  );
}

export interface ActionEntriesArgs {
  card: CardWithFields;
  autoActions: AutoActionResult[];
  config: FeedBuilderConfig;
  visibility: FeedVisibility;
  /** True when the operator confirmed past error-level validation failures. */
  operatorOverride?: boolean;
  /**
   * The ORIGINAL scan's log id, for a resumed override run — so the resumed
   * rows join the group the scan already anchored instead of appearing as
   * strays beside it. Null for manual actions, whose lack of correlation is
   * exactly what marks them as manual.
   */
  scanLogId?: string | null;
  executedAt?: Date;
}

/**
 * Rows for actions executed outside a scan — a resumed auto-action run, or a
 * manual action button. Newest first. No scan row: no scan was logged.
 */
export function buildActionEntries({
  card,
  autoActions,
  config,
  visibility,
  operatorOverride = false,
  scanLogId = null,
  executedAt = new Date(),
}: ActionEntriesArgs): ActivityFeedEntry[] {
  return applyVisibility(
    actionEntries(card, autoActions, config, executedAt, operatorOverride, scanLogId),
    visibility,
  );
}

/**
 * Prepend newly built rows and trim to the raw-row budget.
 *
 * Prepends rather than sorts: `executedAt` is the client clock on new rows and
 * the server's on the rest, so sorting could file a fresh scan below older
 * entries. New rows are the newest by construction.
 *
 * `rawBudget` is `feedRawBudget(feedLimit)`, NOT the tenant's display limit —
 * these rows are ungrouped, and trimming them to the display limit is what made
 * a "×3" run cost three entries. `ActivityFeed` cuts to groups after grouping.
 *
 * @param rawBudget - Max ungrouped rows to keep. See `feedRawBudget`.
 */
export function prependEntries(
  current: ActivityFeedEntry[],
  incoming: ActivityFeedEntry[],
  rawBudget: number,
): ActivityFeedEntry[] {
  if (incoming.length === 0) return current;
  return [...incoming, ...current].slice(0, rawBudget);
}

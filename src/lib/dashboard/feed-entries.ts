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
}

function makeEntry({
  logType,
  card,
  config,
  executedAt,
  action = null,
  operatorOverride = false,
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
): ActivityFeedEntry[] {
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
  executedAt = new Date(),
}: ScanEntriesArgs): ActivityFeedEntry[] {
  return applyVisibility(
    [
      ...actionEntries(card, autoActions, config, executedAt, false),
      makeEntry({ logType: "scan", card, config, executedAt }),
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
  executedAt = new Date(),
}: ActionEntriesArgs): ActivityFeedEntry[] {
  return applyVisibility(
    actionEntries(card, autoActions, config, executedAt, operatorOverride),
    visibility,
  );
}

/**
 * Prepend newly built rows and trim to the tenant's feed limit.
 *
 * Prepends rather than sorts: `executedAt` is the client clock on new rows and
 * the server's on the rest, so sorting could file a fresh scan below older
 * entries. New rows are the newest by construction.
 */
export function prependEntries(
  current: ActivityFeedEntry[],
  incoming: ActivityFeedEntry[],
  feedLimit: number,
): ActivityFeedEntry[] {
  if (incoming.length === 0) return current;
  return [...incoming, ...current].slice(0, feedLimit);
}

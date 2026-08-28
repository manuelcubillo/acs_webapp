/**
 * Activity Feed DAL
 *
 * Retrieves the operational dashboard activity feed for a tenant.
 *
 * Each feed entry is a unified view of:
 *   - Scan-only log entries (log_type = "scan") — card was scanned, no field mutation.
 *   - Action log entries (log_type = "action") — a named action was executed.
 *
 * Field values configured as "summary fields" for the card's type come from the
 * FROZEN SNAPSHOT each log row points at, so a row keeps reading as it did when
 * it was written. The live `field_values` join remains for rows written before
 * migration 0022, which have no snapshot and are never backfilled.
 *
 * The projection is shared with the client mirror in
 * `src/lib/dashboard/feed-entries.ts` (`projectSnapshotFields`). That is not
 * tidiness: the feed has two producers, and the last time they each derived a
 * display value independently one said "Presencia" where the other said
 * "Entrada".
 *
 * The card CODE and card type name stay live here, unlike `/history`. The feed
 * is a twenty-row operational window answering "what is at the door now", and
 * the code is what the operator reads off the card in their hand.
 */

import { eq, and, desc, inArray, or, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  actionLogs,
  cards,
  cardTypes,
  actionDefinitions,
  cardTypeSummaryFields,
  fieldValues,
  fieldDefinitions,
} from "@/lib/db/schema";
import type { ActivityFeedEntry, ActivityFeedOptions, ActivityFeedSummaryField } from "./types";
import { extractValue } from "./field-values";
import { isPresenceRowSql } from "./presence";
import { readScanLogId, readBooleanAfterValue } from "./metadata-keys";
import { cardPhotoRoute } from "@/lib/storage/photo-routes";
import { loadSnapshotsForLogRows, projectSnapshotFields } from "@/lib/snapshots";
import type { SummaryFieldConfig } from "@/lib/snapshots";
import type { FieldType } from "./types";

/**
 * Get the activity feed for a tenant's operational dashboard.
 *
 * Returns unified log entries (scans + actions), newest first, enriched with:
 *   - card code and card type name (for display)
 *   - action name (for action entries)
 *   - summary field values (configured per card type)
 *   - a thumbnail route for cards that have a photo
 *
 * Called on dashboard page load and on manual refresh only — the feed does not
 * poll. See `src/components/dashboard/ActivityFeed.tsx`.
 *
 * @param tenantId - Tenant UUID.
 * @param options  - Filtering and limit options.
 * @returns Ordered array of activity feed entries.
 */
export async function getActivityFeed(
  tenantId: string,
  options: ActivityFeedOptions = {},
): Promise<ActivityFeedEntry[]> {
  const limit = options.limit ?? 20;
  const includeScan = options.includeScanEntries !== false;
  const includeAction = options.includeActionEntries !== false;

  // Build log_type filter.
  //
  // This is a positive WHITELIST — scan and/or action, never "everything except
  // X" — which is what excludes `lifecycle` and `card_edit` rows from the feed.
  //
  // For `card_edit` that exclusion is PERMANENT, not a staging step for A2: the
  // feed is an operational surface answering "what is happening at the door
  // right now", and an administrator correcting a phone number in the office is
  // not a door event. It belongs in `/history`, which is the audit surface.
  //
  // Adding a log type to the feed therefore means adding it here deliberately,
  // and mirroring it in `src/lib/dashboard/feed-entries.ts`.
  const logTypeConditions: ReturnType<typeof eq>[] = [];
  if (includeScan) logTypeConditions.push(eq(actionLogs.logType, "scan"));
  if (includeAction) logTypeConditions.push(eq(actionLogs.logType, "action"));

  if (logTypeConditions.length === 0) return [];

  const logTypeFilter =
    logTypeConditions.length === 1
      ? logTypeConditions[0]
      : or(...logTypeConditions)!;

  // ── Step 1: Fetch log rows joined with card + cardType + actionDefinition ──

  const rows = await db
    .select({
      id: actionLogs.id,
      logType: actionLogs.logType,
      cardId: actionLogs.cardId,
      cardCode: cards.code,
      cardTypeId: cards.cardTypeId,
      cardTypeName: cardTypes.name,
      actionDefinitionId: actionLogs.actionDefinitionId,
      actionName: actionDefinitions.name,
      executedAt: actionLogs.executedAt,
      executedBy: actionLogs.executedBy,
      metadata: actionLogs.metadata,
      // Derived from the join, not stored — see `isPresenceRowSql`.
      isPresence: isPresenceRowSql,
      // The frozen card state this row observed. Null before migration 0022.
      cardSnapshotId: actionLogs.cardSnapshotId,
    })
    .from(actionLogs)
    .innerJoin(cards, eq(actionLogs.cardId, cards.id))
    .innerJoin(cardTypes, eq(cards.cardTypeId, cardTypes.id))
    .leftJoin(
      actionDefinitions,
      eq(actionLogs.actionDefinitionId, actionDefinitions.id),
    )
    .where(
      and(
        eq(actionLogs.tenantId, tenantId),
        logTypeFilter,
      ),
    )
    .orderBy(desc(actionLogs.executedAt))
    .limit(limit);

  if (rows.length === 0) return [];

  // ── Step 2: Collect unique cardTypeIds and cardIds for enrichment ──────────

  const cardTypeIds = [...new Set(rows.map((r) => r.cardTypeId))];
  const cardIds = [...new Set(rows.map((r) => r.cardId))];

  // ── Step 2b: Work out which cards have a primary photo ─────────────────────
  // The photo identifies the card at a glance in the feed. The primary one is
  // the lowest-position active photo field of the card's type; photo fields
  // need not be configured as summary fields.
  //
  // We only resolve EXISTENCE here, not a URL: the thumbnail is served by the
  // stable /api/photos/cards/[code] route, which signs per request. Signing
  // here instead would hand the client a URL that both expires in 15 minutes
  // and busts its own browser cache on every load.

  const photoFieldDefs = await db
    .select({ id: fieldDefinitions.id })
    .from(fieldDefinitions)
    .where(
      and(
        inArray(fieldDefinitions.cardTypeId, cardTypeIds),
        eq(fieldDefinitions.fieldType, "photo"),
        eq(fieldDefinitions.isActive, true),
      ),
    );

  // "Has a photo" means: some active photo field of this card holds a key —
  // exactly the condition under which /api/photos/cards/[code] finds one to
  // serve. Do NOT narrow this to the lowest-position photo *definition*: a card
  // carries no value row for a field left empty, so a card type whose first
  // photo field is blank and whose second is filled would be marked photo-less
  // here while the route happily served the second one.
  const cardsWithPhoto = new Set<string>();
  const photoDefIds = photoFieldDefs.map((d) => d.id);

  if (photoDefIds.length > 0 && cardIds.length > 0) {
    const photoRows = await db
      .select({
        cardId: fieldValues.cardId,
        valueText: fieldValues.valueText,
      })
      .from(fieldValues)
      .where(
        and(
          inArray(fieldValues.cardId, cardIds),
          inArray(fieldValues.fieldDefinitionId, photoDefIds),
        ),
      );

    for (const row of photoRows) {
      if (typeof row.valueText === "string" && row.valueText.length > 0) {
        cardsWithPhoto.add(row.cardId);
      }
    }
  }

  // ── Step 3: Load configured summary field definitions per card type ─────────
  // Photo fields are excluded: a photo's value is an object key, which the row
  // would print as raw text. The card's photo is already shown as a thumbnail.
  // `getFeedSummaryFieldConfig` applies the same rule for the client-built
  // rows — the two must agree or a refresh will reshuffle the feed.

  const summaryFieldDefs = await db
    .select({
      cardTypeId: cardTypeSummaryFields.cardTypeId,
      fieldDefinitionId: cardTypeSummaryFields.fieldDefinitionId,
      label: fieldDefinitions.label,
      fieldType: fieldDefinitions.fieldType,
      position: cardTypeSummaryFields.position,
    })
    .from(cardTypeSummaryFields)
    .innerJoin(
      fieldDefinitions,
      eq(cardTypeSummaryFields.fieldDefinitionId, fieldDefinitions.id),
    )
    .where(
      and(
        eq(cardTypeSummaryFields.tenantId, tenantId),
        inArray(cardTypeSummaryFields.cardTypeId, cardTypeIds),
        ne(fieldDefinitions.fieldType, "photo"),
      ),
    )
    .orderBy(cardTypeSummaryFields.position);

  // Build map: cardTypeId → ordered summary field config. Same shape the client
  // mirror receives from `getFeedSummaryFieldConfig`, so both feed the SAME
  // `projectSnapshotFields`.
  const summaryDefsByCardType = new Map<string, SummaryFieldConfig[]>();
  for (const def of summaryFieldDefs) {
    const existing = summaryDefsByCardType.get(def.cardTypeId) ?? [];
    existing.push({
      fieldDefinitionId: def.fieldDefinitionId,
      label: def.label,
      fieldType: def.fieldType as FieldType,
    });
    summaryDefsByCardType.set(def.cardTypeId, existing);
  }

  // ── Step 3b: Resolve the frozen state of every row, in ONE query ───────────
  // Distinct snapshots, not one per row: a card scanned twenty times in this
  // window points at one snapshot, which is fetched once.
  const snapshots = await loadSnapshotsForLogRows(tenantId, rows);

  // ── Step 4: Load field values for all cards that have summary fields ────────

  // Collect all fieldDefinitionIds needed across all card types
  const allFieldDefIds = [...new Set(summaryFieldDefs.map((d) => d.fieldDefinitionId))];

  let cardFieldValues: {
    cardId: string;
    fieldDefinitionId: string;
    valueText: string | null;
    valueNumber: number | null;
    valueBoolean: boolean | null;
    valueDate: Date | null;
    valueJson: unknown;
  }[] = [];

  // Only the cards whose rows resolved NO snapshot — i.e. rows written before
  // migration 0022. On a feed built entirely after it, this query never runs.
  const fallbackCardIds = [
    ...new Set(
      rows
        .filter((r) => !r.cardSnapshotId || !snapshots.has(r.cardSnapshotId))
        .map((r) => r.cardId),
    ),
  ];

  if (allFieldDefIds.length > 0 && fallbackCardIds.length > 0) {
    cardFieldValues = await db
      .select({
        cardId: fieldValues.cardId,
        fieldDefinitionId: fieldValues.fieldDefinitionId,
        valueText: fieldValues.valueText,
        valueNumber: fieldValues.valueNumber,
        valueBoolean: fieldValues.valueBoolean,
        valueDate: fieldValues.valueDate,
        valueJson: fieldValues.valueJson,
      })
      .from(fieldValues)
      .where(
        and(
          inArray(fieldValues.cardId, fallbackCardIds),
          inArray(fieldValues.fieldDefinitionId, allFieldDefIds),
        ),
      );
  }

  // Build lookup map: "cardId:fieldDefId" → raw value row
  const fvMap = new Map<string, typeof cardFieldValues[0]>();
  for (const fv of cardFieldValues) {
    fvMap.set(`${fv.cardId}:${fv.fieldDefinitionId}`, fv);
  }

  // ── Step 5: Assemble ActivityFeedEntry array ──────────────────────────────

  return rows.map((row): ActivityFeedEntry => {
    const defs = summaryDefsByCardType.get(row.cardTypeId) ?? [];
    const resolved = row.cardSnapshotId
      ? (snapshots.get(row.cardSnapshotId) ?? null)
      : null;

    /** The live join, unchanged — the only thing serving pre-0022 rows. */
    const liveSummaryFields = (): ActivityFeedSummaryField[] =>
      defs.map((def) => {
        const fv = fvMap.get(`${row.cardId}:${def.fieldDefinitionId}`);
        const value = fv
          ? extractValue(
              {
                valueText: fv.valueText,
                valueNumber: fv.valueNumber,
                valueBoolean: fv.valueBoolean,
                valueDate: fv.valueDate,
                valueJson: fv.valueJson,
              } as Parameters<typeof extractValue>[0],
              def.fieldType as Parameters<typeof extractValue>[1],
            )
          : null;

        return {
          fieldDefinitionId: def.fieldDefinitionId,
          label: def.label,
          fieldType: def.fieldType as ActivityFeedSummaryField["fieldType"],
          value,
        };
      });

    // The values a SCAN row shows are the ones the operator's scan observed —
    // BEFORE the auto-actions it triggered ran, because `logScanEntry` freezes
    // the state first. The client mirror must do the same or the numbers will
    // change under the operator on the next Refrescar.
    const summaryFields: ActivityFeedSummaryField[] = resolved
      ? projectSnapshotFields(resolved.payload, defs)
      : liveSummaryFields();

    return {
      id: row.id,
      logType: row.logType,
      cardId: row.cardId,
      cardCode: row.cardCode,
      cardTypeName: row.cardTypeName,
      cardTypeId: row.cardTypeId,
      actionDefinitionId: row.actionDefinitionId,
      actionName: row.actionName ?? null,
      cardPhotoUrl: cardsWithPhoto.has(row.cardId)
        ? cardPhotoRoute(row.cardCode)
        : null,
      executedAt: row.executedAt,
      executedBy: row.executedBy,
      metadata: row.metadata,
      operatorOverride:
        (row.metadata as Record<string, unknown> | null)?.operator_override === true,
      // Projected out of metadata here so `groupFeedRows` reads a typed field
      // rather than casting jsonb at render time. The client mirror sets the
      // same three fields directly — see `feed-entries.ts`.
      scanLogId: readScanLogId(row.metadata),
      isPresence: row.isPresence === true,
      presenceAfterValue: row.isPresence === true
        ? readBooleanAfterValue(row.metadata)
        : null,
      summaryFields,
    };
  });
}

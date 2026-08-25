/**
 * Presence DAL — "who is currently inside the facility?"
 *
 * Presence is a STATE question, not an event query. `action_logs` cannot answer
 * it: a scan row carries no direction, so no amount of filtering over the log
 * tells you whether the last scan was an entry or an exit. The answer lives in
 * one designated boolean field per card type
 * (`card_types.presence_field_definition_id`), and this module reads it.
 *
 * See ADR 2026-08-24-presence-control.md.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cards,
  cardTypes,
  fieldDefinitions,
  fieldValues,
  actionDefinitions,
} from "@/lib/db/schema";
import { cardPhotoRoute } from "@/lib/storage/photo-routes";
import { extractValue } from "./field-values";
import { getFeedSummaryFieldConfig } from "./dashboard-settings";
import type { FieldType } from "./types";

/**
 * SQL predicate: is this `action_logs` row a presence toggle?
 *
 * Compares the action's target field against its card type's presence
 * designation. Deliberately derived at READ time rather than stamped into
 * `action_logs.metadata` at write time — stamping would mean teaching the
 * generic `executeAction` path what presence is, which is exactly what the
 * `metadataExtra` seam exists to avoid.
 *
 * The accepted cost: if a tenant later disables presence on a card type, the
 * designation goes NULL and that type's historical rows stop being flagged,
 * falling back to showing the action's name ("Presencia"). That is honest
 * degradation — the rows are still there, still correct, just no longer
 * labelled by direction — not a bug.
 *
 * Requires `action_definitions` and `card_types` to be in scope in the query.
 */
export const isPresenceRowSql = sql<boolean>`(
  ${actionDefinitions.targetFieldDefinitionId} IS NOT NULL
  AND ${actionDefinitions.targetFieldDefinitionId} = ${cardTypes.presenceFieldDefinitionId}
)`;

/** One summary field rendered on an occupant row. */
export interface PresenceSummaryField {
  fieldDefinitionId: string;
  label: string;
  fieldType: FieldType;
  value: unknown;
}

/** A card currently marked as inside. */
export interface PresenceOccupant {
  /**
   * Card UUID. Needed because `executeActionAction` addresses a card by id —
   * the same way `CardDetailClient` and `DashboardView` already do. The public
   * identifier stays `code`: nothing here builds a URL from the UUID.
   */
  cardId: string;
  code: string;
  cardTypeId: string;
  cardTypeName: string;
  /**
   * When the presence flag was last written, from the trigger-maintained
   * `field_values.updated_at`. The toggle always changes the value, so this is
   * the moment they came in.
   */
  insideSince: Date;
  /** Stable photo route, or null when the card holds no photo. */
  photoUrl: string | null;
  summaryFields: PresenceSummaryField[];
  /**
   * The card type's system toggle action, so the operator can force an exit
   * through the normal execution path. Null only if provisioning was somehow
   * left half-applied.
   */
  presenceActionDefinitionId: string | null;
}

/**
 * Cheap existence check: does ANY active card type of this tenant participate
 * in presence control?
 *
 * Drives the sidebar entry, so it runs on every dashboard page render. It reads
 * one small, tenant-scoped table and stops at the first hit.
 *
 * @param tenantId - Tenant UUID.
 * @returns true when at least one card type has a presence designation.
 */
export async function tenantHasPresenceEnabled(
  tenantId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: cardTypes.id })
    .from(cardTypes)
    .where(
      and(
        eq(cardTypes.tenantId, tenantId),
        sql`${cardTypes.presenceFieldDefinitionId} IS NOT NULL`,
      ),
    )
    .limit(1);

  return !!row;
}

/**
 * Every card of this tenant currently marked as inside.
 *
 * The join runs through `card_types.presence_field_definition_id`, so a card
 * type with presence turned off contributes nothing — its stored values are
 * still there, they are simply unreachable, which is exactly what disabling
 * should mean.
 *
 * Bounded by the nature of the domain (the people inside a facility right now),
 * so there is no pagination: the page filters client-side.
 *
 * @param tenantId - Tenant UUID.
 * @returns Occupants ordered by how long they have been inside (longest first).
 */
export async function getPresenceOccupants(
  tenantId: string,
): Promise<PresenceOccupant[]> {
  const rows = await db
    .select({
      cardId: cards.id,
      code: cards.code,
      cardTypeId: cardTypes.id,
      cardTypeName: cardTypes.name,
      insideSince: fieldValues.updatedAt,
    })
    .from(cards)
    .innerJoin(cardTypes, eq(cardTypes.id, cards.cardTypeId))
    .innerJoin(
      fieldValues,
      and(
        eq(fieldValues.cardId, cards.id),
        eq(fieldValues.fieldDefinitionId, cardTypes.presenceFieldDefinitionId),
      ),
    )
    .where(
      and(
        eq(cards.tenantId, tenantId),
        eq(cards.status, "active"),
        eq(fieldValues.valueBoolean, true),
      ),
    )
    .orderBy(fieldValues.updatedAt);

  if (rows.length === 0) return [];

  const cardIds = [...new Set(rows.map((r) => r.cardId))];
  const cardTypeIds = [...new Set(rows.map((r) => r.cardTypeId))];

  // The per-card-type summary field selection, reusing the config the dashboard
  // feed already ships (photo fields excluded — a photo's value is an object
  // key, and the thumbnail is addressed by route instead).
  const summaryConfig = await getFeedSummaryFieldConfig(tenantId);

  const summaryDefIds = [
    ...new Set(
      cardTypeIds.flatMap((ctId) =>
        (summaryConfig.get(ctId) ?? []).map((f) => f.fieldDefinitionId),
      ),
    ),
  ];

  // Which cards hold a photo. Existence only — the thumbnail is served by the
  // stable /api/photos/cards/[code] route, which signs per request. This page
  // is long-lived (an operator leaves it open), so an embedded signed URL would
  // expire in place. ADR 2026-07-17-stable-photo-routes.md.
  const photoDefs = await db
    .select({ id: fieldDefinitions.id })
    .from(fieldDefinitions)
    .where(
      and(
        inArray(fieldDefinitions.cardTypeId, cardTypeIds),
        eq(fieldDefinitions.fieldType, "photo"),
        eq(fieldDefinitions.isActive, true),
      ),
    );
  const photoDefIds = photoDefs.map((d) => d.id);

  // The card type's system toggle, used by the per-row "force exit" switch.
  const presenceActions = await db
    .select({
      cardTypeId: actionDefinitions.cardTypeId,
      id: actionDefinitions.id,
    })
    .from(actionDefinitions)
    .where(
      and(
        inArray(actionDefinitions.cardTypeId, cardTypeIds),
        eq(actionDefinitions.actionType, "toggle"),
        eq(actionDefinitions.isSystem, true),
        eq(actionDefinitions.isActive, true),
      ),
    );
  const actionByCardType = new Map(
    presenceActions.map((a) => [a.cardTypeId, a.id]),
  );

  // One pass over field_values for both the summary values and the photo flags.
  const wantedDefIds = [...new Set([...summaryDefIds, ...photoDefIds])];
  const valueRows =
    wantedDefIds.length > 0
      ? await db
          .select()
          .from(fieldValues)
          .where(
            and(
              inArray(fieldValues.cardId, cardIds),
              inArray(fieldValues.fieldDefinitionId, wantedDefIds),
            ),
          )
      : [];

  const photoDefIdSet = new Set(photoDefIds);
  const cardsWithPhoto = new Set<string>();
  const valueByKey = new Map<string, (typeof valueRows)[number]>();
  for (const row of valueRows) {
    valueByKey.set(`${row.cardId}:${row.fieldDefinitionId}`, row);
    // "Has a photo" means SOME active photo field of the card holds a key —
    // the same condition the photo route uses to find one to serve.
    if (
      photoDefIdSet.has(row.fieldDefinitionId) &&
      typeof row.valueText === "string" &&
      row.valueText.length > 0
    ) {
      cardsWithPhoto.add(row.cardId);
    }
  }

  return rows.map((row): PresenceOccupant => {
    const defs = summaryConfig.get(row.cardTypeId) ?? [];
    const summaryFields = defs.map((def): PresenceSummaryField => {
      const fv = valueByKey.get(`${row.cardId}:${def.fieldDefinitionId}`);
      return {
        fieldDefinitionId: def.fieldDefinitionId,
        label: def.label,
        fieldType: def.fieldType as FieldType,
        value: fv ? extractValue(fv, def.fieldType as FieldType) : null,
      };
    });

    return {
      cardId: row.cardId,
      code: row.code,
      cardTypeId: row.cardTypeId,
      cardTypeName: row.cardTypeName,
      insideSince: row.insideSince,
      photoUrl: cardsWithPhoto.has(row.cardId) ? cardPhotoRoute(row.code) : null,
      summaryFields,
      presenceActionDefinitionId: actionByCardType.get(row.cardTypeId) ?? null,
    };
  });
}

/**
 * Map of `cardTypeId → system presence action id` for every card type of this
 * tenant that has presence enabled.
 *
 * The dashboard ships it to the client so `feed-entries.ts` can flag a
 * locally-built row as a presence row, and so `ActiveCardZone` knows which
 * auto-action to represent with `PresenceControl` instead of listing in the
 * auto-action summary.
 *
 * Derived from the SAME designation the server-side `isPresenceRowSql`
 * predicate uses — an action is presence when it targets its card type's
 * `presence_field_definition_id` — so the client and server agree by
 * construction rather than by coincidence.
 *
 * @param tenantId - Tenant UUID.
 * @returns cardTypeId → actionDefinitionId. Empty when presence is unused.
 */
export async function getPresenceActionIdsByCardType(
  tenantId: string,
): Promise<Record<string, string>> {
  const rows = await db
    .select({
      cardTypeId: cardTypes.id,
      actionDefinitionId: actionDefinitions.id,
    })
    .from(actionDefinitions)
    .innerJoin(cardTypes, eq(actionDefinitions.cardTypeId, cardTypes.id))
    .where(
      and(
        eq(cardTypes.tenantId, tenantId),
        eq(actionDefinitions.isActive, true),
        sql`${actionDefinitions.targetFieldDefinitionId} = ${cardTypes.presenceFieldDefinitionId}`,
      ),
    );

  const map: Record<string, string> = {};
  for (const row of rows) map[row.cardTypeId] = row.actionDefinitionId;
  return map;
}

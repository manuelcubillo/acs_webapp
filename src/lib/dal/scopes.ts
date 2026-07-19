/**
 * Reusable Drizzle scopes for the card / card type lifecycle.
 *
 * These are opt-in query fragments, deliberately NOT baked into the DAL's
 * primary lookups. See the warning on {@link notArchived}.
 */

import { ne, eq, and, isNotNull, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { cards, cardTypes } from "@/lib/db/schema";

/**
 * Exclude archived (trashed) rows from a query.
 *
 * Archived rows are pending physical deletion and must not appear in normal
 * management lists or searches. `inactive` and `expired` rows are NOT excluded:
 * they are operationally switched off, not deleted, and stay visible.
 *
 * ⚠️ NEVER apply this to the scan lookup path (`getCardByCode` and friends).
 * Scanning an archived card must explicitly DENY it — a blind filter would turn
 * that denial into "card not found" and break the scan semantics. `getCardByCode`
 * is shared by the scan path, the card detail page and the external device API,
 * which is exactly why the filter lives here as opt-in rather than inside it.
 *
 * @param statusColumn - The `status` column of `cards` or `card_types`.
 *
 * @example
 * db.select().from(cards).where(and(eq(cards.tenantId, tenantId), notArchived(cards.status)))
 */
export function notArchived(statusColumn: PgColumn): SQL {
  return ne(statusColumn, "archived");
}

/**
 * Select only archived rows — the inverse of {@link notArchived}.
 * Used by the "Archived" trash view (phase 4) and the purge job (phase 5).
 *
 * @param statusColumn - The `status` column of `cards` or `card_types`.
 */
export function onlyArchived(statusColumn: PgColumn): SQL {
  return eq(statusColumn, "archived");
}

/**
 * Match the cards a given card type dragged into the trash with it.
 *
 * Restoring a card type must revive exactly these, leaving cards that were
 * archived individually (archived_via_type_id IS NULL) in the trash.
 *
 * @param cardTypeId - The card type whose cascade is being addressed.
 */
export function archivedViaType(cardTypeId: string): SQL {
  return and(
    isNotNull(cards.archivedViaTypeId),
    eq(cards.archivedViaTypeId, cardTypeId),
  )!;
}

/** Convenience: non-archived cards for a tenant. */
export function tenantCardsNotArchived(tenantId: string): SQL {
  return and(eq(cards.tenantId, tenantId), notArchived(cards.status))!;
}

/** Convenience: non-archived card types for a tenant. */
export function tenantCardTypesNotArchived(tenantId: string): SQL {
  return and(eq(cardTypes.tenantId, tenantId), notArchived(cardTypes.status))!;
}

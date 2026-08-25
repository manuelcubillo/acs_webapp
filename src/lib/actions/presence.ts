/**
 * Server Actions — Presence ("Recinto").
 *
 * Read-only. Flipping a card's presence goes through `executeActionAction`
 * (`src/lib/actions/actions.ts`) like any other action, so it is gated, logged
 * and attributed identically — there is deliberately no presence-specific
 * execution route.
 */

"use server";

import {
  actionHandler,
  requireOperator,
  type ActionResult,
} from "@/lib/api";
import { getPresenceOccupants, type PresenceOccupant } from "@/lib/dal";

/**
 * Re-read who is currently inside.
 *
 * Backs the "Refrescar" button. The page does NOT poll — same trade as the
 * dashboard feed (ADR 2026-07-17-dashboard-feed-no-polling.md): an idle page
 * costs nothing, and "Actualizado HH:MM" is what keeps that honest.
 *
 * @role operator
 */
export async function getPresenceOccupantsAction(): Promise<
  ActionResult<PresenceOccupant[]>
> {
  return actionHandler(async () => {
    const { tenantId } = await requireOperator();
    return getPresenceOccupants(tenantId);
  });
}

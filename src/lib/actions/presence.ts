/**
 * Server Actions — Presence ("Recinto").
 *
 * Flipping ONE card's presence goes through `executeActionAction`
 * (`src/lib/actions/actions.ts`) like any other action, so it is gated, logged
 * and attributed identically — there is deliberately no presence-specific
 * single-card execution route.
 *
 * The bulk close is the exception: closing a whole facility one `executeAction`
 * at a time is neither atomic nor fast enough, so it runs as one statement in
 * `src/lib/server/presence/close.ts`. See ADR `2026-08-27-presence-bulk-close.md`.
 */

"use server";

import {
  actionHandler,
  requireOperator,
  UnprocessableError,
  type ActionResult,
} from "@/lib/api";
import {
  getPresenceOccupants,
  tenantHasPresenceEnabled,
  type PresenceOccupant,
} from "@/lib/dal";
import {
  closeAllPresence,
  type ClosePresenceResult,
} from "@/lib/server/presence/close";

const TEXT = {
  ERR_PRESENCE_DISABLED:
    "El control de presencia no está activado en ningún tipo de carnet.",
} as const;

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

/**
 * Empty the facility: mark every card currently flagged as inside as out.
 *
 * One statement, one implicit transaction — see `closeAllPresence` for why this
 * is the single place presence writes `field_values` without going through
 * `executeAction`. Each closed card gets the same exit row a manual toggle would
 * have written, attributed to the operator who pressed the button (the
 * `SYSTEM_USER_ID` sentinel belongs to the scheduled auto-close, a later phase).
 *
 * Fails with an `UnprocessableError` when the tenant does not use presence at
 * all: returning 0 would be indistinguishable from "the recinto was already
 * empty", and the two mean very different things to an operator.
 *
 * @role operator
 */
export async function closePresenceAction(): Promise<
  ActionResult<ClosePresenceResult>
> {
  return actionHandler(async () => {
    const { tenantId, userId } = await requireOperator();

    if (!(await tenantHasPresenceEnabled(tenantId))) {
      throw new UnprocessableError(TEXT.ERR_PRESENCE_DISABLED);
    }

    return closeAllPresence({ tenantId, executedBy: userId });
  });
}

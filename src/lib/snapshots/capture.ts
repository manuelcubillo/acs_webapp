/**
 * `captureCardSnapshot` — load, build, dedupe, in one call.
 *
 * The four write paths (`logScanEntry`'s caller, `executeAction`, `createCard`,
 * `updateCard`) all want the same three steps, and doing them separately at
 * each site is how the payloads would drift apart. `ensureCardSnapshot` stays
 * separate underneath so it can be exercised with a hand-made payload.
 */

import { ensureCardSnapshot, type EnsureCardSnapshotResult } from "./ensure-snapshot";
import { buildCardSnapshotFromDb } from "./source";
import { NotFoundError } from "@/lib/dal/errors";

/**
 * Freeze a card's CURRENT state and return the snapshot a log row should point
 * at.
 *
 * Call it AFTER the value write it is meant to describe has completed. The
 * payload is read fresh from the database on purpose: with no interactive
 * transactions, patching a pre-write payload with the value just written would
 * record a state that may never have existed.
 *
 * @param tenantId - Tenant UUID, always from the session.
 * @param cardId   - Internal card UUID.
 * @returns The snapshot id to stamp, and whether this call created it.
 * @throws {NotFoundError} If the card does not exist within the tenant.
 */
export async function captureCardSnapshot(
  tenantId: string,
  cardId: string,
): Promise<EnsureCardSnapshotResult> {
  const built = await buildCardSnapshotFromDb(tenantId, cardId);
  if (!built) throw new NotFoundError("Card", cardId);

  return ensureCardSnapshot({ tenantId, cardId, payload: built.payload });
}

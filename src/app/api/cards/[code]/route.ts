/**
 * External REST API — GET /api/cards/[code]
 *
 * Public-facing endpoint for devices (scanners, kiosks) to fetch a card
 * by its tenant-scoped code.
 *
 * Authentication:
 *   The tenant is identified by the `x-tenant-id` request header.
 *   In production this should be replaced by API key / signed JWT validation.
 *
 * Response:
 *   200 { success: true,  data: CardWithFields }
 *   401 { success: false, error: "Missing x-tenant-id header" }
 *   403 { success: false, error: "El carnet está archivado", code: "CARD_ARCHIVED" }
 *   404 { success: false, error: "Card not found" }
 *
 * An archived card is denied by STATE (403), not reported as missing (404):
 * the resource exists but is in the trash. `inactive` / `expired` cards are
 * still readable — being switched off does not hide the record from a read.
 */

import type { NextRequest } from "next/server";
import { getCardByCode } from "@/lib/dal";
import { signCardPhotos } from "@/lib/dal/photo-urls";
import { isArchived } from "@/lib/server/lifecycle";
import { LIFECYCLE_SCAN_MESSAGES } from "@/lib/validation/messages";
import { getTenantFromHeader } from "@/lib/api/auth";
import { routeHandler, apiSuccess, apiError } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ code: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return routeHandler(async () => {
    const tenantId = getTenantFromHeader(request);
    const { code } = await params;

    const raw = await getCardByCode(code, tenantId);

    // Archived cards are denied by state, not returned as normal resources.
    if (isArchived(raw.status)) {
      return apiError(LIFECYCLE_SCAN_MESSAGES.archived, 403, "CARD_ARCHIVED");
    }

    // External readers receive presigned URLs (15 min TTL) in place of object keys.
    const card = await signCardPhotos(raw);
    return apiSuccess(card);
  });
}

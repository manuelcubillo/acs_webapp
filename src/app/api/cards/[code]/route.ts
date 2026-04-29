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
 *   404 { success: false, error: "Card not found" }
 */

import type { NextRequest } from "next/server";
import { getCardByCode, signCardPhotos } from "@/lib/dal";
import { getTenantFromHeader } from "@/lib/api/auth";
import { routeHandler, apiSuccess } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ code: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return routeHandler(async () => {
    const tenantId = getTenantFromHeader(request);
    const { code } = await params;

    const raw = await getCardByCode(code, tenantId);
    // External readers receive presigned URLs (15 min TTL) in place of object keys.
    const card = await signCardPhotos(raw);
    return apiSuccess(card);
  });
}

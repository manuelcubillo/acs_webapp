/**
 * External REST API — POST /api/cards/[code]/actions/[actionDefinitionId]/execute
 *
 * Records an action execution on a card (e.g. guest entry / guest exit).
 * Called by physical devices (scanners, kiosks, NFC readers) after they
 * scan a card and the operator confirms the action.
 *
 * Authentication:
 *   The tenant is identified by the `x-tenant-id` request header.
 *   The `executedBy` field in the body (optional) can carry a device or
 *   operator identifier — it is not validated against the user table here.
 *
 * Request body (JSON, optional):
 *   {
 *     "executedBy": "device-id-or-user-id",   // optional
 *     "metadata":   { "location": "Gate A" }   // optional, free-form
 *   }
 *
 * Response:
 *   201 { success: true,  data: ActionLog }
 *   400 { success: false, error: "Invalid request body" }
 *   401 { success: false, error: "Missing x-tenant-id header" }
 *   404 { success: false, error: "Card ... not found" | "ActionDefinition ... not found" }
 *   422 { success: false, error: "..." }
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCardByCode, executeAction } from "@/lib/dal";
import { getTenantFromHeader } from "@/lib/api/auth";
import { routeHandler, apiSuccess, apiError } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ code: string; actionDefinitionId: string }>;
}

const ExecuteBodySchema = z.object({
  executedBy: z.string().optional(),
}).optional();

export async function POST(request: NextRequest, { params }: RouteParams) {
  return routeHandler(async () => {
    const tenantId = getTenantFromHeader(request);
    const { code, actionDefinitionId } = await params;

    // Parse optional request body.
    let body: z.infer<typeof ExecuteBodySchema> = undefined;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return apiError("Invalid JSON in request body", 400, "BAD_REQUEST");
      }
      const parsed = ExecuteBodySchema.safeParse(raw);
      if (!parsed.success) {
        return apiError("Invalid request body", 400, "VALIDATION_ERROR");
      }
      body = parsed.data;
    }

    // Resolve card by code + tenant (verifies card exists and belongs to tenant).
    const card = await getCardByCode(code, tenantId);

    // Log the action execution.
    const log = await executeAction({
      cardId: card.id,
      actionDefinitionId,
      executedBy: body?.executedBy,
    });

    return apiSuccess(log, 201);
  });
}

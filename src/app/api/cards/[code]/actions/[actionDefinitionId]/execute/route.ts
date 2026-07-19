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
 * Lifecycle gate (phase 2): an archived card is denied (403); a switched-off
 * card (inactive/expired) is blocked (422). The external channel has no
 * interactive operator, so there is no override path here — the gate is
 * resolved with override disabled, collapsing off-states to a plain block.
 *
 * Response:
 *   201 { success: true,  data: ActionLog }
 *   400 { success: false, error: "Invalid request body" }
 *   401 { success: false, error: "Missing x-tenant-id header" }
 *   403 { success: false, error: "El carnet está archivado", code: "CARD_ARCHIVED" }
 *   404 { success: false, error: "Card ... not found" | "ActionDefinition ... not found" }
 *   422 { success: false, error: "El carnet está inactivo", code: "CARD_INACTIVE" }
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCardByCode, executeAction } from "@/lib/dal";
import { resolveLifecycleGate } from "@/lib/server/lifecycle";
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

    // Lifecycle gate. No interactive override on the device channel, so resolve
    // with override disabled: archived → hard denial, inactive/expired → block.
    const gate = resolveLifecycleGate(card.status, false);
    if (gate.outcome === "denied_archived") {
      return apiError(gate.reason ?? "El carnet está archivado", 403, "CARD_ARCHIVED");
    }
    if (gate.outcome === "blocked") {
      return apiError(gate.reason ?? "El carnet está inactivo", 422, "CARD_INACTIVE");
    }

    // Log the action execution.
    const log = await executeAction({
      cardId: card.id,
      actionDefinitionId,
      tenantId,
      executedBy: body?.executedBy,
    });

    return apiSuccess(log, 201);
  });
}

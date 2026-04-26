"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { user, departureFeedback } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { actionHandler, requireAdmin } from "@/lib/api";
import { countActiveMasters, deleteTenant, getTenantById } from "@/lib/dal";
import type { ActionResult } from "@/lib/api";

/**
 * Permanently delete the current user's account.
 *
 * Two paths:
 *   A) User is the only active master in the tenant
 *      → delete the tenant (cascades all tenant data)
 *   B) All other cases
 *      → delete the user row only (FK cascade removes tenant_members, sessions)
 *
 * A departure_feedback row is created before deletion to capture PII that would
 * otherwise be lost. Returns its id so the goodbye page can attach a reason.
 */
export async function deleteAccountAction(): Promise<ActionResult<{ feedbackId: string }>> {
  return actionHandler(async () => {
    const reqHeaders = await headers();
    const { tenantId, userId, role } = await requireAdmin();

    // Collect user and tenant data before any deletion occurs.
    const [session, tenant] = await Promise.all([
      auth.api.getSession({ headers: reqHeaders }),
      getTenantById(tenantId),
    ]);
    const userName = session?.user?.name ?? null;
    const userEmail = session?.user?.email ?? null;
    const tenantName = tenant.name;

    // Create the feedback row first. departure_feedback has no FK constraints,
    // so it survives both tenant and user deletion.
    const [feedbackRow] = await db
      .insert(departureFeedback)
      .values({ name: userName, email: userEmail, tenantName })
      .returning({ id: departureFeedback.id });

    if (role === "master") {
      const masterCount = await countActiveMasters(tenantId);
      if (masterCount === 1) {
        await deleteTenant(tenantId);
      }
    }

    // Invalidate session before deleting the user row so Better Auth can
    // find and revoke it cleanly.
    await auth.api.signOut({ headers: reqHeaders });

    // Hard-delete user row. Cascades: session, account, tenant_members.
    await db.delete(user).where(eq(user.id, userId));

    return { feedbackId: feedbackRow.id };
  });
}

// ─── Departure feedback ───────────────────────────────────────────────────────

const DepartureFeedbackSchema = z.object({
  feedbackId: z.string().uuid(),
  reason: z.string().max(100).nullable().optional(),
  comment: z.string().max(1000).nullable().optional(),
});

/**
 * Attach reason/comment to an existing departure_feedback row.
 * No auth required — user account is already deleted when this is called.
 * feedbackId comes from the deleteAccountAction response.
 */
export async function submitDepartureFeedbackAction(
  input: unknown,
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    const data = DepartureFeedbackSchema.parse(input);
    await db
      .update(departureFeedback)
      .set({ reason: data.reason ?? null, comment: data.comment ?? null })
      .where(eq(departureFeedback.id, data.feedbackId));
  });
}

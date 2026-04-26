/**
 * Dashboard area gate.
 *
 * Runs three checks before any (dashboard)/* page renders:
 * 1. Must have a valid Better Auth session.
 * 2. Must have a tenant (user.tenantId set — else bounce to onboarding).
 * 3. Membership must still be active and not removed — else sign out + redirect
 *    to /account-deactivated.
 *
 * Role checks remain page-level via requireOperator/Admin/Master.
 */

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getMemberByUserId } from "@/lib/dal/members";
import { NotFoundError } from "@/lib/dal/errors";

export const dynamic = "force-dynamic";

export default async function DashboardAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });

  if (!session?.user) {
    redirect("/login");
  }

  const tenantId = (session.user as { tenantId?: string | null }).tenantId;
  if (!tenantId) {
    redirect("/onboarding/create-tenant");
  }

  // Guard: deactivated or removed members cannot access the dashboard.
  try {
    await getMemberByUserId(tenantId, session.user.id);
  } catch (err) {
    if (err instanceof NotFoundError) {
      // Member is deactivated or removed. The /account-deactivated page handles
      // the sign-out client-side to avoid cookie-clearing race conditions.
      redirect("/account-deactivated");
    }
    // Any other error (DB connectivity etc.) — let it bubble to the error boundary.
    throw err;
  }

  return <>{children}</>;
}

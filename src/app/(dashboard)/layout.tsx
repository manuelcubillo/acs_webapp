/**
 * Dashboard area gate.
 *
 * Pass-through layout that runs a single check before any (dashboard)/* page
 * renders: the caller must have a session AND a tenant. Users mid-onboarding
 * (signed up but `user.tenantId` still null) are bounced to the create-tenant
 * step from any URL — not just /dashboard.
 *
 * Role checks remain page-level via requireOperator/Admin/Master.
 */

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const tenantId = (session.user as { tenantId?: string | null }).tenantId;
  if (!tenantId) {
    redirect("/onboarding/create-tenant");
  }

  return <>{children}</>;
}

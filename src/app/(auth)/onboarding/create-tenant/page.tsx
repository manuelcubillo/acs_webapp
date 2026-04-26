/**
 * /onboarding/create-tenant — Tenant bootstrap for a freshly signed-up user.
 *
 * Reachable only by an authenticated user whose `user.tenantId` is null.
 * Anyone already attached to a tenant is sent to the dashboard.
 */

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import CreateTenantClient from "./CreateTenantClient";

export const dynamic = "force-dynamic";

export default async function CreateTenantPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const tenantId = (session.user as { tenantId?: string | null }).tenantId;
  if (tenantId) {
    redirect("/dashboard");
  }

  return <CreateTenantClient userName={session.user.name} />;
}

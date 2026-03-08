/**
 * /settings/account — Account Settings
 *
 * Displays and allows editing of:
 *   - Tenant name (admin+)
 *   - User display name and profile info
 *
 * Auth is already enforced by the parent settings/layout.tsx.
 * This page additionally verifies the session to retrieve user details
 * and tenant data needed for the form initial values.
 *
 * Minimum role: admin (enforced by layout).
 */

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  requireAdmin,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/api";
import { getTenantById } from "@/lib/dal";
import AccountSettings from "@/components/settings/account/AccountSettings";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireAdmin();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/dashboard");
    redirect("/login");
  }

  const { tenantId, role } = context;

  // ── Data fetching ────────────────────────────────────────────────────────────
  const [tenant, session] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    auth.api.getSession({ headers: await headers() }),
  ]);

  if (!tenant) redirect("/dashboard");

  const user = {
    name: session?.user?.name ?? null,
    email: session?.user?.email ?? "",
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <AccountSettings
      tenant={{
        id: tenant.id,
        name: tenant.name,
        createdAt: tenant.createdAt,
      }}
      user={user}
      role={role}
    />
  );
}

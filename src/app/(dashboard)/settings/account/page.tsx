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
import { getTenantById, countActiveMasters } from "@/lib/dal";
import { signPhotoForReadOptional } from "@/lib/storage/read";
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
  const [tenant, session, masterCount] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    auth.api.getSession({ headers: await headers() }),
    countActiveMasters(tenantId),
  ]);

  if (!tenant) redirect("/dashboard");

  const userImageKey =
    (session?.user as { image?: string | null } | undefined)?.image ?? null;
  const userId = session?.user?.id ?? null;

  // Pre-sign avatar + logo for preview.
  const [userImageUrl, tenantLogoUrl] = await Promise.all([
    signPhotoForReadOptional(userImageKey),
    signPhotoForReadOptional(tenant.logoObjectKey),
  ]);

  const user = {
    id: userId,
    name: session?.user?.name ?? null,
    email: session?.user?.email ?? "",
    imageObjectKey: userImageKey,
    imageReadUrl: userImageUrl,
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <AccountSettings
      tenant={{
        id: tenant.id,
        name: tenant.name,
        createdAt: tenant.createdAt,
        logoObjectKey: tenant.logoObjectKey,
        logoReadUrl: tenantLogoUrl,
      }}
      user={user}
      role={role}
      masterCount={masterCount}
    />
  );
}

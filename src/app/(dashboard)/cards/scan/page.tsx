/**
 * /cards/scan — Scanner page
 *
 * Camera QR / barcode reader interface that navigates to the scanned card.
 */

import { redirect } from "next/navigation";
import { requireOperator, getCurrentUserProfile, AuthenticationError, AuthorizationError } from "@/lib/api";
import { getTenantById } from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import ScanClient from "./ScanClient";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  let context;
  try {
    context = await requireOperator();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/login");
    redirect("/login");
  }

  const { tenantId, role } = context;
  const [tenant, userProfile] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    getCurrentUserProfile(),
  ]);
  const scanMode = tenant?.scanMode ?? "both";

  return (
    <DashboardShell
      title="Escanear"
      role={role}
      userName={userProfile.name ?? undefined}
      userAvatarUrl={userProfile.avatarUrl}
    >
      <ScanClient scanMode={scanMode} />
    </DashboardShell>
  );
}

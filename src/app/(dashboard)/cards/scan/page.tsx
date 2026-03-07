/**
 * /cards/scan — Scanner page
 *
 * Camera QR / barcode reader interface that navigates to the scanned card.
 */

import { redirect } from "next/navigation";
import { requireOperator, AuthenticationError, AuthorizationError } from "@/lib/api";
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
  const tenant = await getTenantById(tenantId).catch(() => null);
  const scanMode = tenant?.scanMode ?? "both";

  return (
    <DashboardShell title="Escanear" role={role}>
      <ScanClient scanMode={scanMode} />
    </DashboardShell>
  );
}

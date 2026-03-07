/**
 * /settings — Tenant settings
 *
 * Configure scan mode and other tenant-level options.
 * Accessible to: master only
 */

import { redirect } from "next/navigation";
import { requireMaster, AuthenticationError, AuthorizationError } from "@/lib/api";
import { getTenantById } from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireMaster();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/dashboard");
    redirect("/login");
  }

  const { tenantId, role } = context;

  const tenant = await getTenantById(tenantId).catch(() => null);

  return (
    <DashboardShell title="Configuración" role={role}>
      <div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            fontFamily: "var(--font-heading)",
            color: "var(--color-dark)",
            margin: "0 0 6px",
          }}
        >
          Configuración
        </h1>
        <p
          style={{
            fontSize: 13.5,
            color: "var(--color-secondary)",
            marginBottom: 28,
          }}
        >
          Ajustes del tenant: {tenant?.name ?? ""}
        </p>

        <SettingsClient initialScanMode={tenant?.scanMode ?? "both"} />
      </div>
    </DashboardShell>
  );
}

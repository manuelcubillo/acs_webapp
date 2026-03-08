/**
 * /settings/reader — Reader Settings
 *
 * Configures the scan mode for the tenant (camera / external reader / both).
 * Minimum role: master (only master can change how scanning works).
 *
 * Auth is already enforced by the parent settings/layout.tsx (admin+).
 * This page additionally enforces the master-only restriction.
 */

import { redirect } from "next/navigation";
import {
  requireMaster,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/api";
import { getTenantById } from "@/lib/dal";
import ReaderSettings from "@/components/settings/reader/ReaderSettings";

export const dynamic = "force-dynamic";

export default async function ReaderSettingsPage() {
  // ── Auth (master only) ────────────────────────────────────────────────────
  let context;
  try {
    context = await requireMaster();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/settings/account");
    redirect("/login");
  }

  const { tenantId } = context;

  // ── Data ──────────────────────────────────────────────────────────────────
  const tenant = await getTenantById(tenantId).catch(() => null);
  const scanMode = tenant?.scanMode ?? "both";

  // ── Render ────────────────────────────────────────────────────────────────
  return <ReaderSettings initialScanMode={scanMode} />;
}

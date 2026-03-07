/**
 * /card-types/new — Create Card Type Wizard
 *
 * Full 4-step wizard to create a new card type.
 * Accessible to: master only
 */

import { redirect } from "next/navigation";
import {
  requireMaster,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/api";
import DashboardShell from "@/components/layout/DashboardShell";
import CardTypeWizard from "@/components/card-types/CardTypeWizard";

export const dynamic = "force-dynamic";

export default async function NewCardTypePage() {
  // ── Auth guard ────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireMaster();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/card-types");
    redirect("/login");
  }

  const { role } = context;

  return (
    <DashboardShell title="Nuevo tipo de tarjeta" role={role}>
      {/* Full-height wizard layout */}
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <CardTypeWizard />
      </div>
    </DashboardShell>
  );
}

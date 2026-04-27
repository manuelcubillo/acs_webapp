/**
 * /card-designs — Card Design List
 *
 * Visual design templates for card types.
 * Accessible to: master only.
 */

import { redirect } from "next/navigation";
import { requireMaster, AuthenticationError } from "@/lib/api";
import { listCardDesigns, getDesignLinkCounts } from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import CardDesignListClient from "@/components/card-designs/CardDesignListClient";

export const dynamic = "force-dynamic";

export default async function CardDesignsPage() {
  // ── Auth guard ──────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireMaster();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    redirect("/dashboard");
  }

  const { tenantId, role } = context;

  // ── Data fetching ───────────────────────────────────────────────────────────
  const [designs, linkCounts] = await Promise.all([
    listCardDesigns(tenantId).catch(() => []),
    getDesignLinkCounts(tenantId).catch(() => ({})),
  ]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <DashboardShell title="Diseños de Tarjeta" role={role}>
      <CardDesignListClient designs={designs} linkCounts={linkCounts} />
    </DashboardShell>
  );
}

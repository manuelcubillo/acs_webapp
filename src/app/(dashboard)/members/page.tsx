/**
 * /members — Member Management
 *
 * Lists all non-removed members of the tenant and pending invitations.
 * Accessible to: admin | master
 */

import { redirect } from "next/navigation";
import { requireAdmin, AuthenticationError } from "@/lib/api";
import { listMembers, listPendingInvitations } from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import MembersClient from "./MembersClient";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  // ── Auth guard ────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireAdmin();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    redirect("/dashboard");
  }

  const { tenantId, userId, role } = context;

  // ── Data fetching ─────────────────────────────────────────────────────────
  const [members, invitations] = await Promise.all([
    listMembers(tenantId).catch(() => []),
    listPendingInvitations(tenantId).catch(() => []),
  ]);

  // Resolve the current user's display name from the members list.
  const currentMember = members.find((m) => m.userId === userId);
  const userName = currentMember?.userName;

  return (
    <DashboardShell title="Miembros" role={role} userName={userName}>
      <MembersClient
        initialMembers={members}
        initialInvitations={invitations}
        currentUserId={userId}
        currentUserRole={role}
      />
    </DashboardShell>
  );
}

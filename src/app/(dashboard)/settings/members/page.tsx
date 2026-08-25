/**
 * /settings/members — Member Management
 *
 * Lists all non-removed members of the tenant and pending invitations.
 * Minimum role: admin (enforced by the parent settings/layout.tsx).
 *
 * The DashboardShell wrapper (and topbar user profile) is provided by
 * settings/layout.tsx — not here.
 */

import { redirect } from "next/navigation";
import { requireAdmin, AuthenticationError, AuthorizationError } from "@/lib/api";
import { listMembers, listPendingInvitations } from "@/lib/dal";
import { signPhotosForRead } from "@/lib/storage/read";
import MembersClient from "./MembersClient";

export const dynamic = "force-dynamic";

export default async function MembersSettingsPage() {
  // ── Auth guard ────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireAdmin();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/dashboard");
    throw e;
  }

  const { tenantId, userId, role } = context;

  // ── Data fetching ─────────────────────────────────────────────────────────
  const [members, invitations] = await Promise.all([
    listMembers(tenantId).catch(() => []),
    listPendingInvitations(tenantId).catch(() => []),
  ]);

  // Sign every member avatar key in one batch.
  const avatarUrls = await signPhotosForRead(members.map((m) => m.userImage));
  const memberAvatarReadUrls: Record<string, string> = {};
  for (const m of members) {
    if (m.userImage) {
      const url = avatarUrls.get(m.userImage);
      if (url) memberAvatarReadUrls[m.id] = url;
    }
  }

  return (
    <MembersClient
      initialMembers={members}
      initialInvitations={invitations}
      memberAvatarReadUrls={memberAvatarReadUrls}
      currentUserId={userId}
      currentUserRole={role}
    />
  );
}

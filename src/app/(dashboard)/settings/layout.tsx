/**
 * Settings Area Layout
 *
 * Shared layout for all /settings/* sub-pages.
 * Provides:
 *   1. Auth guard — minimum role: admin. Operators are redirected to /dashboard.
 *   2. DashboardShell — the outer shell (sidebar + topbar).
 *   3. Secondary settings nav (SettingsNav) rendered inside the content area,
 *      to the left of {children} on desktop, above on mobile.
 *
 * Individual sub-pages do NOT render DashboardShell themselves.
 * They only return their own content (SettingsSection + SettingsCard(s)).
 */

import { redirect } from "next/navigation";
import {
  requireAdmin,
  getCurrentUserProfile,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/api";
import DashboardShell from "@/components/layout/DashboardShell";
import SettingsNav from "@/components/settings/SettingsNav";

export const dynamic = "force-dynamic";

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export default async function SettingsLayout({ children }: SettingsLayoutProps) {
  // ── Auth guard ─────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireAdmin();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/dashboard");
    redirect("/login");
  }

  const { role } = context;

  // ── User name + avatar for the topbar ─────────────────────────────────────
  const userProfile = await getCurrentUserProfile();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DashboardShell
      title="Configuración"
      role={role}
      userName={userProfile.name ?? undefined}
      userAvatarUrl={userProfile.avatarUrl}
    >
      <div className="flex min-h-full flex-col sm:flex-row">
        {/* Secondary settings nav */}
        <SettingsNav role={role} />

        {/* Page content */}
        <div className="min-w-0 flex-1">
          {children}
        </div>
      </div>
    </DashboardShell>
  );
}

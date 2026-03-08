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
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  requireAdmin,
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

  // ── User name for the topbar avatar ───────────────────────────────────────
  const session = await auth.api.getSession({ headers: await headers() });
  const userName = session?.user?.name ?? undefined;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DashboardShell title="Configuración" role={role} userName={userName}>
      <div className="settings-layout">
        {/* Secondary settings nav */}
        <SettingsNav role={role} />

        {/* Page content */}
        <div className="settings-content">
          {children}
        </div>
      </div>
    </DashboardShell>
  );
}

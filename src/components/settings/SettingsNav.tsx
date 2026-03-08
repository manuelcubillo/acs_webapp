"use client";

/**
 * SettingsNav
 *
 * Secondary navigation rendered inside the settings content area.
 * On desktop: a narrow vertical sidebar to the left of the content.
 * On mobile (≤640 px): a horizontal scrollable tab bar above the content.
 *
 * The single source of truth for available settings sections is
 * SETTINGS_NAV_ITEMS. To add a new section:
 *   1. Add an entry to SETTINGS_NAV_ITEMS.
 *   2. Create the corresponding sub-page at src/app/(dashboard)/settings/<slug>/page.tsx.
 *
 * Role visibility: items with `requiredRole` are hidden for users whose role
 * is below the required level (uses the same hierarchy: master > admin > operator).
 */

import { usePathname } from "next/navigation";
import Link from "next/link";
import { User, LayoutDashboard, ScanLine } from "lucide-react";
import type { TenantRole } from "@/lib/api";

// ─── Nav config ───────────────────────────────────────────────────────────────

interface SettingsNavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  /**
   * Optional grouping label for future multi-group layouts.
   * Not rendered yet, reserved for scalability.
   */
  group?: string;
  /**
   * Minimum role required to see this item.
   * Defaults to "admin" (the minimum role to access /settings).
   */
  requiredRole?: TenantRole;
}

const ROLE_ORDER: Record<TenantRole, number> = {
  operator: 1,
  admin: 2,
  master: 3,
};

/** All sections shown in the settings secondary navigation. */
const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  {
    label: "Cuenta",
    href: "/settings/account",
    icon: User,
  },
  {
    label: "Dashboard",
    href: "/settings/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Lector",
    href: "/settings/reader",
    icon: ScanLine,
    requiredRole: "master",
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface SettingsNavProps {
  /** Current user's role — used to filter items with requiredRole. */
  role: TenantRole;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsNav({ role }: SettingsNavProps) {
  const pathname = usePathname();

  /** Filter items the user is allowed to see. */
  const visibleItems = SETTINGS_NAV_ITEMS.filter((item) => {
    if (!item.requiredRole) return true;
    return ROLE_ORDER[role] >= ROLE_ORDER[item.requiredRole];
  });

  return (
    <nav className="settings-nav-secondary" aria-label="Settings navigation">
      <span className="settings-nav-label">Configuración</span>

      <div className="settings-nav-items">
        {visibleItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`settings-nav-item${active ? " active" : ""}`}
            >
              <Icon size={15} strokeWidth={1.8} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

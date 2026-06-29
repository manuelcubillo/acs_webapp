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
import { cn } from "@/lib/utils";

const NAV_TITLE = "Configuración";

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
    <nav
      className="mb-5 w-full shrink-0 border-b pb-3 sm:mb-0 sm:mr-9 sm:w-50 sm:border-r sm:border-b-0 sm:pr-4 sm:pb-0"
      aria-label="Settings navigation"
    >
      <span className="mb-1.5 hidden px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:block">
        {NAV_TITLE}
      </span>

      <div className="flex gap-1 overflow-x-auto sm:flex-col sm:gap-0.5 sm:overflow-visible">
        {visibleItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent font-semibold text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
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

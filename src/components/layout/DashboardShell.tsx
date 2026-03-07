"use client";

/**
 * DashboardShell
 *
 * Shared layout for new dashboard pages (card-types, members, etc.).
 * Renders sidebar + topbar + main content area.
 * The existing prototype page (/dashboard) manages its own layout.
 *
 * Usage:
 *   <DashboardShell title="Tipos de Tarjeta" role="master">
 *     {children}
 *   </DashboardShell>
 */

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutGrid,
  CreditCard,
  IdCard,
  Users,
  Settings,
  Shield,
  LogOut,
} from "lucide-react";
import type { TenantRole } from "@/lib/api";

// ─── Nav items ────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  /** Minimum role required to see this item. */
  minRole?: TenantRole;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Vista Principal", icon: LayoutGrid },
  { href: "/card-types", label: "Tipos de Tarjeta", icon: CreditCard, minRole: "operator" },
  { href: "/cards", label: "Carnets", icon: IdCard, minRole: "operator" },
  { href: "/members", label: "Miembros", icon: Users, minRole: "master" },
];

const ROLE_ORDER: Record<TenantRole, number> = { operator: 1, admin: 2, master: 3 };

function canSee(userRole: TenantRole, minRole?: TenantRole): boolean {
  if (!minRole) return true;
  return ROLE_ORDER[userRole] >= ROLE_ORDER[minRole];
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DashboardShellProps {
  children: React.ReactNode;
  /** Page title shown in the topbar. */
  title: string;
  /** The current user's role (used to filter nav items). */
  role?: TenantRole;
  /** User display name for the avatar. */
  userName?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardShell({
  children,
  title,
  role = "operator",
  userName,
}: DashboardShellProps) {
  const pathname = usePathname();

  /** Determine if a nav href is "active" (current page or sub-page). */
  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  /** Initials for the avatar. */
  const initials = userName
    ? userName
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "?";

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: "var(--font-body)" }}>

      {/* ───── SIDEBAR ───── */}
      <aside style={{
        width: "var(--sidebar-width)",
        background: "#fff",
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        padding: "20px 14px",
        flexShrink: 0,
      }}>

        {/* Logo */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "4px 12px 24px",
          borderBottom: "1px solid var(--color-border-soft)",
          marginBottom: 20,
        }}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: "linear-gradient(135deg, #4f5bff, #7c3aed)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
          }}>
            <Shield size={18} strokeWidth={1.8} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--color-dark)", lineHeight: 1.2 }}>
              Veredillas
            </div>
            <div style={{ fontSize: 10.5, color: "var(--color-muted)", fontWeight: 500 }}>
              Control de Acceso
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.filter((item) => canSee(role, item.minRole)).map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-item${active ? " active" : ""}`}
              >
                <Icon size={18} strokeWidth={1.8} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: settings + logout */}
        <div style={{ borderTop: "1px solid var(--color-border-soft)", paddingTop: 12, marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
          <Link href="/settings" className="sidebar-item">
            <Settings size={18} strokeWidth={1.8} />
            Configuración
          </Link>
          <button
            className="sidebar-item"
            style={{ border: "none", background: "none", textAlign: "left", width: "100%", cursor: "pointer" }}
            onClick={async () => {
              const { authClient } = await import("@/lib/auth-client");
              await authClient.signOut();
              window.location.href = "/login";
            }}
          >
            <LogOut size={18} strokeWidth={1.8} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ───── MAIN ───── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Topbar */}
        <header style={{
          height: "var(--header-height)",
          background: "#fff",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 28px",
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}>
            {title}
          </div>
          {userName && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-dark)" }}>{userName}</div>
                <div style={{ fontSize: 11, color: "var(--color-muted)", textTransform: "capitalize" }}>{role}</div>
              </div>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "linear-gradient(135deg, #e0e7ff, #c7d2fe)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 13,
                color: "var(--color-primary)",
                fontFamily: "var(--font-heading)",
              }}>
                {initials}
              </div>
            </div>
          )}
        </header>

        {/* Content */}
        <main style={{
          flex: 1,
          overflow: "auto",
          padding: 24,
          background: "var(--color-page-bg)",
        }}>
          {children}
        </main>
      </div>
    </div>
  );
}

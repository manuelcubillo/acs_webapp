"use client";

/**
 * DashboardShell — sidebar + topbar app shell for dashboard pages.
 *
 * Token-driven (Layer 2 only). Zero hex, zero inline styles. Sidebar uses
 * surface-3 + accent for active state; the brand follows data-brand.
 *
 * Behavior preserved from the previous implementation:
 *   - Same NAV_ITEMS, same role gating.
 *   - Same sign-out flow (dynamic import of authClient → signOut → push /login).
 *   - Same tenantLogoUrl / userAvatarUrl props.
 *
 * Below the `md` breakpoint the sidebar is hidden, so the topbar carries a
 * `MobileNavMenu` dropdown with the very same entries.
 */

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutGrid,
  CreditCard,
  IdCard,
  Settings,
  Shield,
  LogOut,
  History,
  Palette,
  Trash2,
  DoorOpen,
  Menu,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { UserProfileProvider, useUserProfile } from "@/components/layout/UserProfileContext";
import { usePresenceEnabled } from "@/components/layout/PresenceNavContext";
import { PAGE_SCROLL_SLOT } from "@/lib/navigation/return-scroll";
import type { TenantRole } from "@/lib/api";

// ─── Constants ──────────────────────────────────────────────────────────────

const TEXT = {
  BRAND_FALLBACK:  "ACS",
  BRAND_SUBTITLE:  "Control de Acceso",
  NAV_DASHBOARD:   "Vista Principal",
  NAV_CARD_TYPES:  "Tipos de Tarjeta",
  NAV_CARDS:       "Carnets",
  NAV_HISTORY:     "Historial",
  NAV_PRESENCE:    "Recinto",
  NAV_ARCHIVED:    "Archivados",
  NAV_DESIGNS:     "Diseños de Tarjeta",
  NAV_SETTINGS:    "Configuración",
  NAV_SIGNOUT:     "Cerrar sesión",
  NAV_MENU:        "Menú",
  NAV_MENU_ARIA:   "Abrir menú de navegación",
} as const;

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  minRole?: TenantRole;
  /**
   * When set, the entry renders only if this tenant has presence control on
   * anywhere. A tenant that does not use it never sees a dead link.
   */
  requiresPresence?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",    label: TEXT.NAV_DASHBOARD,  icon: LayoutGrid },
  { href: "/presence",     label: TEXT.NAV_PRESENCE,   icon: DoorOpen,    minRole: "operator", requiresPresence: true },
  { href: "/cards",        label: TEXT.NAV_CARDS,      icon: IdCard,      minRole: "operator" },
  { href: "/history",      label: TEXT.NAV_HISTORY,    icon: History,     minRole: "operator" },
  { href: "/archived",     label: TEXT.NAV_ARCHIVED,   icon: Trash2,      minRole: "admin" },
  { href: "/card-types",   label: TEXT.NAV_CARD_TYPES, icon: CreditCard, minRole: "operator" },
  { href: "/card-designs", label: TEXT.NAV_DESIGNS,    icon: Palette,     minRole: "master" },
];

const ROLE_ORDER: Record<TenantRole, number> = { operator: 1, admin: 2, master: 3 };

function canSee(userRole: TenantRole, minRole?: TenantRole): boolean {
  if (!minRole) return true;
  return ROLE_ORDER[userRole] >= ROLE_ORDER[minRole];
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface DashboardShellProps {
  children: React.ReactNode;
  title: string;
  role?: TenantRole;
  userName?: string;
  userAvatarUrl?: string | null;
  tenantName?: string | null;
  tenantLogoUrl?: string | null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function DashboardShell({
  children,
  title,
  role = "operator",
  userName,
  userAvatarUrl,
  tenantName,
  tenantLogoUrl,
}: DashboardShellProps) {
  return (
    <UserProfileProvider initialUserName={userName} initialUserAvatarUrl={userAvatarUrl}>
      <DashboardShellBody title={title} role={role} tenantName={tenantName} tenantLogoUrl={tenantLogoUrl}>
        {children}
      </DashboardShellBody>
    </UserProfileProvider>
  );
}

interface DashboardShellBodyProps {
  children: React.ReactNode;
  title: string;
  role: TenantRole;
  tenantName?: string | null;
  tenantLogoUrl?: string | null;
}

/**
 * Reads userName/userAvatarUrl from UserProfileContext (not props) so that a
 * descendant client component — e.g. AccountSettings after saving a new
 * avatar — can update the topbar live without a full page reload.
 */
function DashboardShellBody({ children, title, role, tenantName, tenantLogoUrl }: DashboardShellBodyProps) {
  const pathname = usePathname();
  const { userName, userAvatarUrl } = useUserProfile();
  const presenceEnabled = usePresenceEnabled();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  const initials = userName
    ? userName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "?";

  const visibleNav = NAV_ITEMS.filter(
    (item) =>
      canSee(role, item.minRole) && (!item.requiresPresence || presenceEnabled),
  );
  const displayTenantName = tenantName ?? TEXT.BRAND_FALLBACK;

  return (
    <div className="flex h-screen overflow-hidden bg-background font-sans text-foreground">
      <Sidebar
        tenantName={displayTenantName}
        tenantLogoUrl={tenantLogoUrl}
        visibleNav={visibleNav}
        isActive={isActive}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          title={title}
          role={role}
          userName={userName}
          userAvatarUrl={userAvatarUrl}
          initials={initials}
          tenantName={displayTenantName}
          tenantLogoUrl={tenantLogoUrl}
          visibleNav={visibleNav}
          isActive={isActive}
        />

        {/* The dashboard's scroll container — the window itself never scrolls.
            Tagged so scroll restoration can find it (see `return-scroll.ts`). */}
        <main
          data-slot={PAGE_SCROLL_SLOT}
          className="flex-1 overflow-y-auto bg-background"
        >
          <div className="mx-auto w-full max-w-7xl px-6 py-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Sidebar ────────────────────────────────────────────────────────────────

interface SidebarProps {
  tenantName: string;
  tenantLogoUrl?: string | null;
  visibleNav: NavItem[];
  isActive: (href: string) => boolean;
}

function Sidebar({ tenantName, tenantLogoUrl, visibleNav, isActive }: SidebarProps) {
  return (
    <aside
      className={cn(
        "hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex",
      )}
      aria-label="Navegación principal"
    >
      <BrandHeader tenantName={tenantName} tenantLogoUrl={tenantLogoUrl} />

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4" aria-label="Páginas">
        {visibleNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>

      <Separator />

      <div className="flex flex-col gap-1 px-3 py-4">
        <NavLink
          item={{ href: "/settings", label: TEXT.NAV_SETTINGS, icon: Settings }}
          active={isActive("/settings")}
        />
        <SignOutButton />
      </div>
    </aside>
  );
}

/**
 * Height and bottom border must mirror Topbar so both dividers align.
 * px-6 keeps the logo on the same 24px inset as the nav icons below it
 * (nav px-3 + NavLink px-3).
 */
function BrandHeader({ tenantName, tenantLogoUrl }: { tenantName: string; tenantLogoUrl?: string | null }) {
  return (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-6">
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary text-primary-foreground shadow-sm">
        {tenantLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tenantLogoUrl} alt={tenantName} className="size-full object-cover" />
        ) : (
          <Shield className="size-5" strokeWidth={1.8} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-heading text-base font-bold leading-tight text-foreground">
          {tenantName}
        </div>
        <div className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {TEXT.BRAND_SUBTITLE}
        </div>
      </div>
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const { href, label, icon: Icon } = item;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.8} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

/**
 * Shared by the sidebar button and the mobile menu entry. The redirect is a
 * full page load, not a router push, so no client cache survives the session
 * change.
 */
async function signOutAndRedirect() {
  const { authClient } = await import("@/lib/auth-client");
  await authClient.signOut();
  window.location.href = "/login";
}

function SignOutButton() {
  return (
    <button
      type="button"
      onClick={signOutAndRedirect}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        "text-muted-foreground hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card",
      )}
    >
      <LogOut className="size-4 shrink-0" strokeWidth={1.8} />
      <span>{TEXT.NAV_SIGNOUT}</span>
    </button>
  );
}

// ─── Topbar ─────────────────────────────────────────────────────────────────

interface TopbarProps {
  title: string;
  role: TenantRole;
  userName?: string;
  userAvatarUrl?: string | null;
  initials: string;
  tenantName: string;
  tenantLogoUrl?: string | null;
  visibleNav: NavItem[];
  isActive: (href: string) => boolean;
}

function Topbar({
  title,
  role,
  userName,
  userAvatarUrl,
  initials,
  tenantName,
  tenantLogoUrl,
  visibleNav,
  isActive,
}: TopbarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNavMenu
          tenantName={tenantName}
          tenantLogoUrl={tenantLogoUrl}
          visibleNav={visibleNav}
          isActive={isActive}
        />
        <h1 className="truncate font-heading text-lg font-semibold text-foreground">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle />
        {userName && (
          <>
            <Separator orientation="vertical" className="h-6 hidden sm:block" />
            <div className="hidden flex-col text-right sm:flex">
              <span className="text-sm font-semibold leading-tight text-foreground">{userName}</span>
              <span className="text-xs capitalize text-muted-foreground">{role}</span>
            </div>
            <Avatar>
              {userAvatarUrl && <AvatarImage src={userAvatarUrl} alt={userName} />}
              <AvatarFallback className="bg-accent text-accent-foreground font-heading text-xs font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </>
        )}
      </div>
    </header>
  );
}

// ─── Mobile navigation ──────────────────────────────────────────────────────

interface MobileNavMenuProps {
  tenantName: string;
  tenantLogoUrl?: string | null;
  visibleNav: NavItem[];
  isActive: (href: string) => boolean;
}

/**
 * Mobile counterpart of `Sidebar` — below `md` the aside is hidden, so this
 * dropdown is the only way to reach the nav. It consumes the same already
 * role- and presence-filtered `visibleNav`, so visibility rules stay in one
 * place. Radix closes the menu on item select, which covers the Link entries.
 */
function MobileNavMenu({ tenantName, tenantLogoUrl, visibleNav, isActive }: MobileNavMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          aria-label={TEXT.NAV_MENU_ARIA}
          title={TEXT.NAV_MENU}
        >
          <Menu strokeWidth={1.8} />
        </Button>
      </DropdownMenuTrigger>

      {/* `md:hidden` on the content too: the portal outlives a resize that
          hides the trigger while the menu is open. */}
      <DropdownMenuContent align="start" className="w-60 md:hidden">
        <DropdownMenuLabel className="flex items-center gap-2.5 px-2 py-2">
          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary text-primary-foreground">
            {tenantLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenantLogoUrl} alt={tenantName} className="size-full object-cover" />
            ) : (
              <Shield className="size-4" strokeWidth={1.8} />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-heading text-sm font-bold leading-tight text-foreground">
              {tenantName}
            </span>
            <span className="block truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {TEXT.BRAND_SUBTITLE}
            </span>
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {visibleNav.map((item) => (
          <MobileNavItem key={item.href} item={item} active={isActive(item.href)} />
        ))}

        <DropdownMenuSeparator />

        <MobileNavItem
          item={{ href: "/settings", label: TEXT.NAV_SETTINGS, icon: Settings }}
          active={isActive("/settings")}
        />
        <DropdownMenuItem onClick={signOutAndRedirect}>
          <LogOut strokeWidth={1.8} />
          <span>{TEXT.NAV_SIGNOUT}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileNavItem({ item, active }: { item: NavItem; active: boolean }) {
  const { href, label, icon: Icon } = item;
  return (
    <DropdownMenuItem asChild className={cn(active && "bg-accent text-accent-foreground")}>
      <Link href={href} aria-current={active ? "page" : undefined}>
        {/* `text-current` opts the icon out of the item's default muted svg
            color so the active entry tints icon and label alike. */}
        <Icon className={cn("size-4", active && "text-current")} strokeWidth={1.8} />
        <span className="truncate">{label}</span>
      </Link>
    </DropdownMenuItem>
  );
}

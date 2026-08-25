"use client";

/**
 * Whether this tenant has presence control enabled anywhere.
 *
 * `DashboardShell`'s NAV_ITEMS is a static list in a client component, and the
 * shell is mounted independently by every dashboard page. Threading a prop
 * would mean editing all of them and paying the lookup once per page. Instead
 * `(dashboard)/layout.tsx` — which already runs on every dashboard request and
 * is `force-dynamic` — resolves it once and publishes it here.
 *
 * Defaults to `false` outside the provider, so a shell rendered anywhere else
 * simply omits the entry rather than throwing.
 */

import { createContext, useContext } from "react";

const PresenceNavContext = createContext(false);

export function PresenceNavProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <PresenceNavContext.Provider value={enabled}>
      {children}
    </PresenceNavContext.Provider>
  );
}

/** True when the "Recinto" nav entry should be rendered. */
export function usePresenceEnabled(): boolean {
  return useContext(PresenceNavContext);
}

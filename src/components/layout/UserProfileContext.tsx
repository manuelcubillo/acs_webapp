"use client";

/**
 * UserProfileContext
 *
 * Client-side mirror of the current user's display name + avatar URL,
 * seeded from the server-fetched values passed into DashboardShell.
 *
 * Exists so that a descendant client component (e.g. AccountSettings,
 * rendered inside DashboardShell's `children`) can push a fresh avatar/name
 * up into the topbar immediately after saving, without a full page reload.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface UserProfileValue {
  userName?: string;
  userAvatarUrl?: string | null;
}

interface UserProfileContextValue extends UserProfileValue {
  setUserProfile: (patch: Partial<UserProfileValue>) => void;
}

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

export function UserProfileProvider({
  initialUserName,
  initialUserAvatarUrl,
  children,
}: {
  initialUserName?: string;
  initialUserAvatarUrl?: string | null;
  children: ReactNode;
}) {
  const [profile, setProfile] = useState<UserProfileValue>({
    userName: initialUserName,
    userAvatarUrl: initialUserAvatarUrl,
  });

  const value = useMemo<UserProfileContextValue>(
    () => ({
      ...profile,
      setUserProfile: (patch) => setProfile((prev) => ({ ...prev, ...patch })),
    }),
    [profile],
  );

  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  );
}

/** Read + update the shared topbar user profile (name / avatar). */
export function useUserProfile(): UserProfileContextValue {
  const ctx = useContext(UserProfileContext);
  if (!ctx) {
    throw new Error("useUserProfile must be used within a UserProfileProvider (DashboardShell)");
  }
  return ctx;
}

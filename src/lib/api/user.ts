/**
 * API Layer - Current User Profile
 *
 * Resolves the logged-in user's display name and a signed avatar URL for
 * UI chrome (e.g. the dashboard topbar). Separate from the tenant/role
 * lookups in auth.ts: this is identity for display purposes, not authorization.
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { signPhotoForReadOptional } from "@/lib/storage/read";

export interface CurrentUserProfile {
  name: string | null;
  avatarUrl: string | null;
}

/**
 * Read the current Better Auth session and resolve `user.image` (an object
 * storage key, never a raw URL) into a short-lived signed URL.
 *
 * Returns nulls if there is no session — callers should already be behind
 * an auth guard, so this is a defensive fallback rather than the normal path.
 */
export async function getCurrentUserProfile(): Promise<CurrentUserProfile> {
  const session = await auth.api.getSession({ headers: await headers() });
  const imageKey =
    (session?.user as { image?: string | null } | undefined)?.image ?? null;

  const avatarUrl = await signPhotoForReadOptional(imageKey);

  return {
    name: session?.user?.name ?? null,
    avatarUrl,
  };
}

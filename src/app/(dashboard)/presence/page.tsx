/**
 * /presence — Recinto
 *
 * Who is inside the facility right now.
 *
 * This is a STATE view, not a log view. `action_logs` cannot answer the
 * question: a scan row carries no direction, because the deployment has one
 * attended reader per access point and no notion of reader identity. Direction
 * comes from toggle semantics instead — each operational scan flips a boolean
 * on the card — and this page reads that boolean.
 *
 * Accessible to: operator | admin | master
 * See ADR 2026-08-24-presence-control.md.
 */

import { redirect } from "next/navigation";
import {
  requireOperator,
  getCurrentUserProfile,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/api";
import { getPresenceOccupants, tenantHasPresenceEnabled } from "@/lib/dal";
import DashboardShell from "@/components/layout/DashboardShell";
import PresenceClient from "./PresenceClient";

export const dynamic = "force-dynamic";

const TEXT = {
  TITLE: "Recinto",
  DISABLED_TITLE: "Control de presencia desactivado",
  DISABLED_BODY:
    "Ningún tipo de carnet tiene el control de presencia activado. Actívalo desde el asistente de tipos de carnet para saber quién está dentro del recinto.",
} as const;

export default async function PresencePage() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let context;
  try {
    context = await requireOperator();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/login");
    throw e;
  }

  const { tenantId, role } = context;

  // ── Data ──────────────────────────────────────────────────────────────────
  // The page guards itself rather than relying on the sidebar hiding the link:
  // the route is reachable by URL whether or not the entry is rendered.
  const [enabled, userProfile] = await Promise.all([
    tenantHasPresenceEnabled(tenantId).catch(() => false),
    getCurrentUserProfile(),
  ]);

  const occupants = enabled
    ? await getPresenceOccupants(tenantId).catch(() => [])
    : [];

  return (
    <DashboardShell
      title={TEXT.TITLE}
      role={role}
      userName={userProfile.name ?? undefined}
      userAvatarUrl={userProfile.avatarUrl}
    >
      {enabled ? (
        <PresenceClient
          initialOccupants={occupants}
          /* The server render IS the first read, so the timestamp starts here
             rather than at hydration. Serialised as an ISO string: a Date
             crossing the RSC boundary arrives as one anyway. */
          initialRefreshedAt={new Date().toISOString()}
        />
      ) : (
        <div className="rounded-xl border bg-card px-6 py-16 text-center">
          <h2 className="font-heading text-lg font-bold text-foreground">
            {TEXT.DISABLED_TITLE}
          </h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">
            {TEXT.DISABLED_BODY}
          </p>
        </div>
      )}
    </DashboardShell>
  );
}

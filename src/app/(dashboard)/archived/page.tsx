/**
 * /archived — Trash (archived card types & cards)
 *
 * Lists archived card types and cards with restore + permanent-delete.
 * Accessible to: admin | master. Operators are redirected out (the nav item is
 * hidden for them and this guard blocks direct URL access). Permanent delete and
 * "empty trash" are master-only, gated in the client from `role`.
 */

import { redirect } from "next/navigation";
import {
  requireAdmin,
  getCurrentUserProfile,
  AuthenticationError,
} from "@/lib/api";
import { listArchivedCards, listArchivedCardTypes } from "@/lib/dal";
import {
  getEffectiveRetentionDays,
  computePurgeDueAt,
  daysUntilPurge,
} from "@/lib/server/lifecycle";
import DashboardShell from "@/components/layout/DashboardShell";
import ArchivedClient from "./ArchivedClient";

export const dynamic = "force-dynamic";

const TITLE = "Archivados";

export default async function ArchivedPage() {
  // ── Auth guard — admin+master only; operator is redirected out. ─────────────
  let context;
  try {
    context = await requireAdmin();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    redirect("/dashboard");
  }

  const { tenantId, role } = context;

  // ── Data ────────────────────────────────────────────────────────────────────
  const [archivedCardTypes, archivedCards, retentionDays, userProfile] =
    await Promise.all([
      listArchivedCardTypes(tenantId).catch(() => []),
      listArchivedCards(tenantId).catch(() => []),
      getEffectiveRetentionDays(tenantId).catch(() => 30),
      getCurrentUserProfile(),
    ]);

  // Compute the purge countdown on the server, from a single retention lookup.
  const now = new Date();
  const cards = archivedCards.map((c) => ({
    ...c,
    purgeDueAt: computePurgeDueAt(c.archivedAt, retentionDays),
    daysLeft: daysUntilPurge(c.archivedAt, retentionDays, now),
  }));
  const cardTypes = archivedCardTypes.map((t) => ({
    ...t,
    purgeDueAt: computePurgeDueAt(t.archivedAt, retentionDays),
    daysLeft: daysUntilPurge(t.archivedAt, retentionDays, now),
  }));

  return (
    <DashboardShell
      title={TITLE}
      role={role}
      userName={userProfile.name ?? undefined}
      userAvatarUrl={userProfile.avatarUrl}
    >
      <ArchivedClient
        archivedCardTypes={cardTypes}
        archivedCards={cards}
        role={role}
        retentionDays={retentionDays}
      />
    </DashboardShell>
  );
}

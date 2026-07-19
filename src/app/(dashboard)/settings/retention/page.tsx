/**
 * /settings/retention — Trash retention settings
 *
 * Lets the master set how many days archived cards / card types stay in the
 * trash before the daily purge job (`/api/cron/purge-archived`) physically
 * deletes them. The value is `tenants.archive_retention_days` (range 1–365).
 *
 * Minimum role: master. Auth is enforced by the parent settings/layout.tsx
 * (admin+); this page additionally restricts to master, matching the
 * master-only settings pattern used by /settings/reader.
 *
 * The numeric bounds live in the DB schema module (server-only). They are read
 * here and passed to the client as props so the client bundle never imports the
 * Drizzle schema. The server action re-validates them regardless.
 */

import { redirect } from "next/navigation";
import {
  requireMaster,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/api";
import { getTenantById } from "@/lib/dal";
import {
  MIN_ARCHIVE_RETENTION_DAYS,
  MAX_ARCHIVE_RETENTION_DAYS,
  DEFAULT_ARCHIVE_RETENTION_DAYS,
} from "@/lib/db/schema";
import RetentionSettings from "@/components/settings/retention/RetentionSettings";

export const dynamic = "force-dynamic";

export default async function RetentionSettingsPage() {
  // ── Auth (master only) ──────────────────────────────────────────────────────
  let context;
  try {
    context = await requireMaster();
  } catch (e) {
    if (e instanceof AuthenticationError) redirect("/login");
    if (e instanceof AuthorizationError) redirect("/settings/account");
    redirect("/login");
  }

  const { tenantId } = context;

  // ── Data ────────────────────────────────────────────────────────────────────
  const tenant = await getTenantById(tenantId).catch(() => null);
  const initialRetentionDays =
    tenant?.archiveRetentionDays ?? DEFAULT_ARCHIVE_RETENTION_DAYS;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <RetentionSettings
      initialRetentionDays={initialRetentionDays}
      minDays={MIN_ARCHIVE_RETENTION_DAYS}
      maxDays={MAX_ARCHIVE_RETENTION_DAYS}
    />
  );
}

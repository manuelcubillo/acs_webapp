/**
 * Trash retention.
 *
 * How long an archived card / card type stays in the trash before the purge job
 * (phase 5) physically deletes it.
 *
 * There is no platform-wide global: this app has no super-admin — `master` is a
 * per-tenant role — so a cross-tenant setting would have no coherent owner and
 * would let one tenant's master change another tenant's behaviour. The value is
 * therefore per tenant, seeded from DEFAULT_ARCHIVE_RETENTION_DAYS.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { NotFoundError } from "@/lib/dal/errors";

/**
 * Retention in days for a tenant's trash.
 *
 * Reusable by phase 4 (showing a card's deletion date) and phase 5 (the purge
 * job). The column is NOT NULL with a database default, so there is no
 * inheritance or fallback to resolve.
 *
 * @param tenantId - Tenant UUID.
 * @returns Retention window in days.
 * @throws {NotFoundError} If the tenant does not exist.
 */
export async function getEffectiveRetentionDays(
  tenantId: string,
): Promise<number> {
  const [row] = await db
    .select({ days: tenants.archiveRetentionDays })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!row) throw new NotFoundError("Tenant", tenantId);
  return row.days;
}

/**
 * The instant an archived row becomes eligible for physical deletion.
 *
 * @param archivedAt      - When the row entered the trash.
 * @param retentionDays   - The tenant's retention window.
 * @returns The purge deadline (UTC).
 */
export function computePurgeDueAt(
  archivedAt: Date,
  retentionDays: number,
): Date {
  const due = new Date(archivedAt.getTime());
  due.setUTCDate(due.getUTCDate() + retentionDays);
  return due;
}

/**
 * Days left before an archived row is purged. Negative once overdue.
 *
 * @param archivedAt    - When the row entered the trash.
 * @param retentionDays - The tenant's retention window.
 * @param now           - Reference instant (injectable for tests).
 */
export function daysUntilPurge(
  archivedAt: Date,
  retentionDays: number,
  now: Date = new Date(),
): number {
  const due = computePurgeDueAt(archivedAt, retentionDays);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((due.getTime() - now.getTime()) / msPerDay);
}

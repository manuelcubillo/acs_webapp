/**
 * Tenants DAL
 *
 * CRUD operations for tenant entities.
 * Deleting a tenant cascades to all its card types, cards, and associated data
 * thanks to the `onDelete: "cascade"` foreign key constraints.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { NotFoundError } from "./errors";
import type { Tenant, CreateTenantInput, UpdateTenantInput, UpdateTenantSettingsInput } from "./types";

/**
 * Create a new tenant.
 *
 * @param data - Tenant creation payload.
 * @returns The newly created tenant row.
 */
export async function createTenant(data: CreateTenantInput): Promise<Tenant> {
  const [tenant] = await db.insert(tenants).values(data).returning();
  return tenant;
}

/**
 * Get a tenant by its internal UUID.
 *
 * @param id - Tenant UUID.
 * @returns The tenant row.
 * @throws {NotFoundError} If no tenant matches the given id.
 */
export async function getTenantById(id: string): Promise<Tenant> {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);

  if (!tenant) {
    throw new NotFoundError("Tenant", id);
  }

  return tenant;
}

/**
 * Update a tenant's mutable fields.
 *
 * @param id   - Tenant UUID.
 * @param data - Partial update payload.
 * @returns The updated tenant row.
 * @throws {NotFoundError} If no tenant matches the given id.
 */
export async function updateTenant(
  id: string,
  data: UpdateTenantInput,
): Promise<Tenant> {
  const [tenant] = await db
    .update(tenants)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tenants.id, id))
    .returning();

  if (!tenant) {
    throw new NotFoundError("Tenant", id);
  }

  return tenant;
}

/**
 * List all tenants.
 * Intended for admin use — returns every tenant in the system.
 *
 * @returns Array of tenant rows ordered by creation date (newest first).
 */
export async function listTenants(): Promise<Tenant[]> {
  return db.select().from(tenants).orderBy(tenants.createdAt);
}

/**
 * Delete a tenant and all associated data.
 *
 * All card types, cards, field values, action definitions, and action logs
 * are removed via cascading foreign keys.
 *
 * @param id - Tenant UUID.
 * @throws {NotFoundError} If no tenant matches the given id.
 */
export async function deleteTenant(id: string): Promise<void> {
  // Verify the tenant exists before deleting.
  await getTenantById(id);
  await db.delete(tenants).where(eq(tenants.id, id));
}

/**
 * Update tenant-level settings (scan mode, etc.).
 *
 * @param id   - Tenant UUID.
 * @param data - Settings to update.
 * @returns The updated tenant row.
 * @throws {NotFoundError} If no tenant matches the given id.
 */
export async function updateTenantSettings(
  id: string,
  data: UpdateTenantSettingsInput,
): Promise<Tenant> {
  const [tenant] = await db
    .update(tenants)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tenants.id, id))
    .returning();

  if (!tenant) {
    throw new NotFoundError("Tenant", id);
  }

  return tenant;
}

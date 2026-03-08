/**
 * Server Actions — Tenants (admin)
 *
 * These actions are intended for super-admins / internal tooling.
 * Regular tenant users cannot create or delete other tenants.
 *
 * For now there is no role check beyond `requireAuth()`.
 * Add an `isSuperAdmin` guard once roles are introduced.
 */

"use server";

import { z } from "zod";
import {
  actionHandler,
  requireAuth,
  requireAdmin,
  requireMaster,
  type ActionResult,
} from "@/lib/api";
import {
  createTenant,
  getTenantById,
  updateTenant,
  updateTenantSettings,
  listTenants,
  deleteTenant,
} from "@/lib/dal";
import type { Tenant } from "@/lib/dal";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const CreateTenantSchema = z.object({
  name: z.string().min(1).max(200),
});

const UpdateTenantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
});

const UpdateTenantSettingsSchema = z.object({
  scanMode: z.enum(["camera", "external_reader", "both"]).optional(),
});

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Create a new tenant.
 */
export async function createTenantAction(
  input: unknown,
): Promise<ActionResult<Tenant>> {
  return actionHandler(async () => {
    await requireAuth();
    const data = CreateTenantSchema.parse(input);
    return createTenant({ name: data.name });
  });
}

/**
 * Get a tenant by ID.
 */
export async function getTenantAction(
  id: string,
): Promise<ActionResult<Tenant>> {
  return actionHandler(async () => {
    await requireAuth();
    return getTenantById(id);
  });
}

/**
 * List all tenants.
 */
export async function listTenantsAction(): Promise<ActionResult<Tenant[]>> {
  return actionHandler(async () => {
    await requireAuth();
    return listTenants();
  });
}

/**
 * Update a tenant's name.
 */
export async function updateTenantAction(
  id: string,
  input: unknown,
): Promise<ActionResult<Tenant>> {
  return actionHandler(async () => {
    await requireAuth();
    const data = UpdateTenantSchema.parse(input);
    return updateTenant(id, data);
  });
}

/**
 * Update tenant-level settings (e.g. scan mode).
 * Master only.
 */
export async function updateTenantSettingsAction(
  input: unknown,
): Promise<ActionResult<Tenant>> {
  return actionHandler(async () => {
    const { tenantId } = await requireMaster();
    const data = UpdateTenantSettingsSchema.parse(input);
    return updateTenantSettings(tenantId, data);
  });
}

/**
 * Update the name of the authenticated user's own tenant.
 * Requires admin or master role.
 */
export async function updateCurrentTenantNameAction(
  input: unknown,
): Promise<ActionResult<Tenant>> {
  return actionHandler(async () => {
    const { tenantId } = await requireAdmin();
    const data = z.object({ name: z.string().min(1, "Name is required").max(200) }).parse(input);
    return updateTenant(tenantId, { name: data.name });
  });
}

/**
 * Delete a tenant and cascade all associated data.
 * This is irreversible — use with caution.
 */
export async function deleteTenantAction(
  id: string,
): Promise<ActionResult<void>> {
  return actionHandler(async () => {
    await requireAuth();
    await deleteTenant(id);
  });
}

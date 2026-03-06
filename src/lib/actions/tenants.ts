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
import { actionHandler, requireAuth, type ActionResult } from "@/lib/api";
import {
  createTenant,
  getTenantById,
  updateTenant,
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

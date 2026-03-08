"use server";

/**
 * Dashboard Server Actions
 *
 * lookupCard: validates that a card code exists for the current tenant.
 * Used by QuickCodeInput to decide whether to navigate or show an error.
 */

import { requireOperator, AuthenticationError, AuthorizationError } from "@/lib/api";
import { getCardByCode } from "@/lib/dal";
import { NotFoundError } from "@/lib/dal";

export interface LookupCardResult {
  found: boolean;
  /** Exact code from DB (case-normalised) when found. */
  code?: string;
  error?: string;
}

/**
 * Check whether a card with the given code exists for the caller's tenant.
 *
 * @param rawCode - The code the user entered (may have leading/trailing spaces).
 * @returns LookupCardResult — { found: true, code } or { found: false, error }.
 */
export async function lookupCard(rawCode: string): Promise<LookupCardResult> {
  const code = rawCode.trim();
  if (!code) return { found: false, error: "Introduce un código" };

  let context;
  try {
    context = await requireOperator();
  } catch (e) {
    if (e instanceof AuthenticationError) return { found: false, error: "Sesión no válida" };
    if (e instanceof AuthorizationError) return { found: false, error: "Sin permiso" };
    return { found: false, error: "Error de autenticación" };
  }

  try {
    const card = await getCardByCode(code, context.tenantId);
    return { found: true, code: card.code };
  } catch (e) {
    if (e instanceof NotFoundError) return { found: false, error: "Carnet no encontrado" };
    return { found: false, error: "Error al buscar" };
  }
}

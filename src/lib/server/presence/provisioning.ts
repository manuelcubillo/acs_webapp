/**
 * Presence control — provisioning.
 *
 * Enabling presence on a card type is a single checkbox in the wizard. Everything
 * it needs — a boolean field to hold the state and an auto-executed toggle action
 * to flip it — is created here, flagged `is_system = true`, and is invisible in
 * every configuration surface (see `src/lib/fields/system.ts`).
 *
 * ## Atomicity
 *
 * Each function is ONE data-modifying CTE, following the lifecycle precedent
 * (ADR 2026-07-17-card-lifecycle-archiving.md). One statement is one implicit
 * Postgres transaction, so a field with no action, or a designation pointing at
 * a field that was never created, cannot be left behind — which the best-effort
 * sequential alternative (ADR 2026-04-25-tenant-bootstrap-best-effort.md) could
 * not guarantee on a driver with no interactive transactions.
 *
 * The find-or-reactivate-or-create shape works inside one statement because
 * every CTE reads the SAME snapshot: `existing_*` is evaluated once, the UPDATE
 * branch keys off it, and the INSERT branch is guarded by `WHERE NOT EXISTS`
 * against the same CTE. Exactly one of the two produces a row.
 *
 * ## Idempotency, both directions
 *
 * Enabling twice is a no-op. Disabling twice is a no-op. Enabling after a
 * disable REUSES the same field and action rows — which is the whole point:
 * `field_values` survive a disable (constraint #6 forbids hard-deleting a field
 * definition, and the stored values are audit-relevant), so re-enabling restores
 * the card's history rather than starting a second, parallel one.
 *
 * ## Authorization
 *
 * These are service functions and do NOT check roles. The Server Actions in
 * `src/lib/actions/card-types.ts` run `requireMaster()` first, per the project
 * convention that guards live at the action boundary.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/dal/errors";
import {
  PRESENCE_ACTION_NAME,
  PRESENCE_FIELD_LABEL,
  PRESENCE_FIELD_NAME,
} from "./constants";

/** What provisioning resolved to, for logging and tests. */
export interface PresenceProvisioningResult {
  /** The system boolean field holding "inside". */
  fieldDefinitionId: string;
  /** The system toggle action that flips it. */
  actionDefinitionId: string;
  /** True when this call created or reactivated something. */
  changed: boolean;
}

/**
 * Turn on presence control for a card type.
 *
 * Provisions (or revives) the `__presence` boolean field and the `Presencia`
 * toggle action, then designates the field on `card_types`.
 *
 * @param tenantId   - Tenant UUID, always from the session.
 * @param cardTypeId - Card type UUID.
 * @returns The resolved system row ids and whether anything changed.
 * @throws {NotFoundError} If the card type does not exist in the tenant.
 */
export async function enablePresenceControl(
  tenantId: string,
  cardTypeId: string,
): Promise<PresenceProvisioningResult> {
  const result = await db.execute<{
    field_id: string | null;
    action_id: string | null;
    changed: boolean;
    found: number;
  }>(sql`
    WITH target AS (
      SELECT id FROM card_types
      WHERE id = ${cardTypeId}::uuid AND tenant_id = ${tenantId}::uuid
    ),
    -- The system presence field for this card type, ACTIVE OR NOT. Matching a
    -- retired one is what makes disable → re-enable reuse the same row, so the
    -- card's stored values and history carry over instead of a second, parallel
    -- history starting.
    existing_field AS (
      SELECT fd.id, fd.is_active, fd.label
      FROM field_definitions fd, target t
      WHERE fd.card_type_id = t.id
        AND fd.is_system = true
        AND fd.field_type = 'boolean'
        AND fd.name = ${PRESENCE_FIELD_NAME}
      ORDER BY fd.created_at
      LIMIT 1
    ),
    inserted_field AS (
      INSERT INTO field_definitions
        (card_type_id, name, label, field_type, is_required, position, is_system, is_active)
      SELECT
        t.id,
        ${PRESENCE_FIELD_NAME},
        ${PRESENCE_FIELD_LABEL},
        'boolean',
        false,
        COALESCE(
          (SELECT MAX(fd.position) + 1 FROM field_definitions fd WHERE fd.card_type_id = t.id),
          0
        ),
        true,
        true
      FROM target t
      WHERE NOT EXISTS (SELECT 1 FROM existing_field)
      RETURNING id
    ),
    -- Exactly one row when the card type exists: the branches are mutually
    -- exclusive by construction (inserted_field is guarded on existing_field).
    resolved_field AS (
      SELECT id FROM existing_field
      UNION ALL SELECT id FROM inserted_field
    ),
    -- Repair only. Fires when re-enabling a retired field, or when something
    -- drifted; a steady-state enable matches nothing and reports no change.
    revived_field AS (
      UPDATE field_definitions SET
        is_active  = true,
        label      = ${PRESENCE_FIELD_LABEL},
        updated_at = now()
      WHERE id IN (SELECT id FROM existing_field)
        AND (is_active = false OR label <> ${PRESENCE_FIELD_LABEL})
      RETURNING id
    ),
    existing_action AS (
      SELECT ad.id
      FROM action_definitions ad, target t
      WHERE ad.card_type_id = t.id
        AND ad.is_system = true
        AND ad.action_type = 'toggle'
      ORDER BY ad.created_at
      LIMIT 1
    ),
    inserted_action AS (
      INSERT INTO action_definitions
        (card_type_id, name, action_type, target_field_definition_id, config,
         position, is_auto_execute, is_operator_visible, is_system, is_active)
      SELECT
        t.id,
        ${PRESENCE_ACTION_NAME},
        'toggle',
        (SELECT id FROM resolved_field),
        NULL,
        COALESCE(
          (SELECT MAX(ad.position) + 1 FROM action_definitions ad WHERE ad.card_type_id = t.id),
          0
        ),
        true,
        true,
        true,
        true
      FROM target t
      WHERE NOT EXISTS (SELECT 1 FROM existing_action)
      RETURNING id
    ),
    resolved_action AS (
      SELECT id FROM existing_action
      UNION ALL SELECT id FROM inserted_action
    ),
    -- Repair only, same rule as revived_field.
    revived_action AS (
      UPDATE action_definitions SET
        is_active                  = true,
        is_auto_execute            = true,
        is_operator_visible        = true,
        name                       = ${PRESENCE_ACTION_NAME},
        target_field_definition_id = (SELECT id FROM resolved_field),
        updated_at                 = now()
      WHERE id IN (SELECT id FROM existing_action)
        AND (
          is_active = false
          OR is_auto_execute = false
          OR is_operator_visible = false
          OR name <> ${PRESENCE_ACTION_NAME}
          OR target_field_definition_id IS DISTINCT FROM (SELECT id FROM resolved_field)
        )
      RETURNING id
    ),
    designated AS (
      UPDATE card_types SET
        presence_field_definition_id = (SELECT id FROM resolved_field),
        updated_at                   = now()
      WHERE id IN (SELECT id FROM target)
        AND presence_field_definition_id IS DISTINCT FROM (SELECT id FROM resolved_field)
      RETURNING id
    )
    SELECT
      (SELECT id FROM resolved_field)    AS field_id,
      (SELECT id FROM resolved_action)   AS action_id,
      (SELECT count(*) FROM target)::int AS found,
      (
        EXISTS (SELECT 1 FROM inserted_field)
        OR EXISTS (SELECT 1 FROM revived_field)
        OR EXISTS (SELECT 1 FROM inserted_action)
        OR EXISTS (SELECT 1 FROM revived_action)
        OR EXISTS (SELECT 1 FROM designated)
      ) AS changed
  `);

  const row = result.rows[0];
  if (!row || Number(row.found) === 0 || !row.field_id || !row.action_id) {
    // `target` matched nothing → the card type is not this tenant's.
    throw new NotFoundError("CardType", cardTypeId);
  }

  return {
    fieldDefinitionId: row.field_id,
    actionDefinitionId: row.action_id,
    changed: row.changed === true,
  };
}

/**
 * Turn off presence control for a card type.
 *
 * Clears the designation and soft-deletes the system field and action. It does
 * NOT delete `field_values`: hard-deleting a field definition is forbidden
 * (constraint #6) and the stored values are audit-relevant. They simply become
 * unreachable — `getPresenceOccupants` joins through the now-null designation —
 * which is the correct outcome, and is what lets a re-enable pick up exactly
 * where this left off.
 *
 * @param tenantId   - Tenant UUID, always from the session.
 * @param cardTypeId - Card type UUID.
 * @returns Whether anything changed (false when presence was already off).
 * @throws {NotFoundError} If the card type does not exist in the tenant.
 */
export async function disablePresenceControl(
  tenantId: string,
  cardTypeId: string,
): Promise<{ changed: boolean }> {
  const result = await db.execute<{ found: number; changed: boolean }>(sql`
    WITH target AS (
      SELECT id FROM card_types
      WHERE id = ${cardTypeId}::uuid AND tenant_id = ${tenantId}::uuid
    ),
    cleared AS (
      UPDATE card_types SET
        presence_field_definition_id = NULL,
        updated_at                   = now()
      WHERE id IN (SELECT id FROM target)
        AND presence_field_definition_id IS NOT NULL
      RETURNING id
    ),
    retired_field AS (
      UPDATE field_definitions fd SET
        is_active  = false,
        updated_at = now()
      FROM target t
      WHERE fd.card_type_id = t.id
        AND fd.is_system = true
        AND fd.name = ${PRESENCE_FIELD_NAME}
        AND fd.is_active = true
      RETURNING fd.id
    ),
    retired_action AS (
      UPDATE action_definitions ad SET
        is_active  = false,
        updated_at = now()
      FROM target t
      WHERE ad.card_type_id = t.id
        AND ad.is_system = true
        AND ad.action_type = 'toggle'
        AND ad.is_active = true
      RETURNING ad.id
    )
    SELECT
      (SELECT count(*) FROM target)::int AS found,
      (
        EXISTS (SELECT 1 FROM cleared)
        OR EXISTS (SELECT 1 FROM retired_field)
        OR EXISTS (SELECT 1 FROM retired_action)
      ) AS changed
  `);

  const row = result.rows[0];
  if (!row || Number(row.found) === 0) {
    throw new NotFoundError("CardType", cardTypeId);
  }

  return { changed: row.changed === true };
}

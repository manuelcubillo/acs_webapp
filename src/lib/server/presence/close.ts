/**
 * Presence control — bulk close ("Vaciar recinto").
 *
 * Marks every card of a tenant that is currently flagged as inside as out, and
 * writes one exit row to `action_logs` per card actually changed — exactly what
 * a manual toggle would have written, one row at a time.
 *
 * ## Why this bypasses `executeAction`
 *
 * `modules/presence.md` states that presence never writes `field_values`
 * directly. This function is the single, deliberate exception, and the reason is
 * arithmetic: `executeAction` costs ~5 round trips per card (action definition,
 * current value, tenant strategy, card row, upsert, log). Closing a facility of
 * 50 occupants that way is hundreds of sequential HTTP round trips against the
 * Neon driver — well past a serverless function's timeout budget — and it is not
 * atomic at any granularity above one card, so a timeout halfway through leaves
 * the recinto half-closed with no way to tell which half.
 *
 * ## Atomicity
 *
 * ONE data-modifying CTE, following `purgeExpiredArchivedRecords`
 * (`src/lib/server/lifecycle/purge.ts`) and the provisioning CTEs in
 * `./provisioning.ts`. One statement is one implicit Postgres transaction, so
 * the whole close is atomic on a driver with no interactive transactions: every
 * value is flipped and every log written, or nothing is.
 *
 * The log rows are derived from the UPDATE's `RETURNING`, never from a second
 * read of `field_values`, so there is exactly one `action_logs` row per row that
 * actually changed — no row is logged twice and no flip goes unlogged.
 *
 * ## Authorization
 *
 * A service function: it does NOT check roles, and `tenantId` is a parameter.
 * `closePresenceAction` (`src/lib/actions/presence.ts`) runs `requireOperator()`
 * and supplies both values from the session, per the project convention that
 * guards live at the action boundary.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/** Input for a bulk close. Both values come from the caller's session. */
export interface ClosePresenceInput {
  /** Tenant UUID — always from `getCurrentTenant()`, never from the client. */
  tenantId: string;
  /**
   * The `user.id` stamped on every log row as `executed_by`.
   *
   * For the manual close this is the operator who pressed the button. The
   * `SYSTEM_USER_ID` sentinel belongs to the scheduled auto-close, which is a
   * separate, later phase.
   */
  executedBy: string;
}

/** Outcome of a bulk close. */
export interface ClosePresenceResult {
  /** Cards flipped from inside to outside — one `action_logs` row each. */
  closed: number;
}

/**
 * Mark every card of this tenant that is currently inside as out.
 *
 * ## What it reaches, and what it deliberately does not
 *
 * - **No `status` filter, unlike the read path.** `getPresenceOccupants` filters
 *   to `cards.status = 'active'` so the page lists only live cards. A card that
 *   expired or was archived while inside keeps `value_boolean = true`
 *   invisibly, and would walk back in still flagged as inside the moment it is
 *   reactivated. The close must reach those ghosts, so it filters on the
 *   designation alone.
 * - **Only card types whose `presence_field_definition_id IS NOT NULL`.** A card
 *   type with presence disabled keeps its stored values on purpose (see
 *   `disablePresenceControl`) — those values are audit-relevant and are what a
 *   re-enable restores. Reaching through a null designation would destroy them.
 * - **The presence action is resolved exactly as `getPresenceActionIdsByCardType`
 *   resolves it**: the active action whose `target_field_definition_id` equals
 *   its card type's designation. One shared rule, so the log rows can never
 *   point at a different action definition than the read path attributes them to.
 *   `DISTINCT ON` with the same `created_at` tie-break provisioning uses keeps it
 *   to one action per card type even if a second one ever matched.
 *
 * `field_values.updated_at` is left alone: the `field_values_touch` trigger
 * (migration 0021) owns it, and it is what supplies "inside since".
 *
 * ## Log shape
 *
 * Byte-compatible with what `executeAction` writes for a presence toggle —
 * `log_type='action'`, the card type's presence `action_definition_id`, and
 * metadata `{ action_type, target_field, before_value, after_value }` in the
 * snake_case convention that path uses. That is what makes `isPresenceRowSql`
 * classify these rows as presence rows and `presenceDirectionLabel` resolve them
 * to "Salida" in the feed, `/history`, the CSV export and the history filter.
 * `before_value` is `true` unconditionally because the target set is defined by
 * `value_boolean = true`.
 *
 * ## Idempotence
 *
 * A second run finds nothing still flagged inside, updates nothing, logs nothing
 * and returns `{ closed: 0 }`. Safe to invoke repeatedly / retry.
 *
 * @param input - Tenant and the acting user, both from the session.
 * @returns How many cards were marked out.
 */
export async function closeAllPresence(
  input: ClosePresenceInput,
): Promise<ClosePresenceResult> {
  const { tenantId, executedBy } = input;

  const result = await db.execute<{ closed: number }>(sql`
    WITH presence_types AS (
      -- One row per participating card type: its designation, the field's name
      -- (what executeAction logs as target_field) and its presence action.
      SELECT DISTINCT ON (ct.id)
        ct.id                              AS card_type_id,
        ct.presence_field_definition_id    AS field_definition_id,
        fd.name                            AS field_name,
        ad.id                              AS action_definition_id,
        ad.action_type::text               AS action_type
      FROM card_types ct
      JOIN field_definitions fd
        ON fd.id = ct.presence_field_definition_id
      JOIN action_definitions ad
        ON ad.card_type_id = ct.id
       AND ad.is_active = true
       AND ad.target_field_definition_id = ct.presence_field_definition_id
      WHERE ct.tenant_id = ${tenantId}::uuid
        AND ct.presence_field_definition_id IS NOT NULL
      ORDER BY ct.id, ad.created_at
    ),
    targets AS (
      -- Everyone currently inside. No status filter: a ghost (expired or
      -- archived while inside) is invisible to the page but must still be
      -- closed, or it comes back flagged as inside on reactivation.
      SELECT
        fv.id                     AS field_value_id,
        c.id                      AS card_id,
        pt.action_definition_id   AS action_definition_id,
        pt.action_type            AS action_type,
        pt.field_name             AS field_name
      FROM presence_types pt
      JOIN cards c
        ON c.card_type_id = pt.card_type_id
      JOIN field_values fv
        ON fv.card_id = c.id
       AND fv.field_definition_id = pt.field_definition_id
      WHERE fv.value_boolean = true
    ),
    updated AS (
      -- updated_at is NOT written here: the field_values_touch trigger owns it.
      UPDATE field_values fv
      SET value_boolean = false
      WHERE fv.id IN (SELECT field_value_id FROM targets)
      RETURNING fv.id
    ),
    logged AS (
      -- Driven by the UPDATE's RETURNING, so exactly one row per value that
      -- actually changed.
      INSERT INTO action_logs
        (tenant_id, card_id, action_definition_id, log_type, executed_by, metadata)
      SELECT
        ${tenantId}::uuid,
        t.card_id,
        t.action_definition_id,
        'action',
        ${executedBy}::text,
        jsonb_build_object(
          'action_type',  t.action_type,
          'target_field', t.field_name,
          'before_value', true,
          'after_value',  false
        )
      FROM updated u
      JOIN targets t ON t.field_value_id = u.id
      RETURNING id
    )
    SELECT (SELECT count(*)::int FROM logged) AS closed
  `);

  return { closed: Number(result.rows[0]?.closed ?? 0) };
}

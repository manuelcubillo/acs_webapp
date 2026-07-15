/**
 * Invitation Action Strategy — STUB
 *
 * Custom action strategy for the single tenant whose `scan_strategy` is set to
 * `"invitation"`. This file is intentionally a SCAFFOLD: the signature, types,
 * and helper wiring are in place, but `handleAction` is a no-op placeholder.
 *
 * Fill in the invitation accounting logic in `handleAction`. Until then it is
 * SAFE if accidentally enabled: it returns the target field's current value
 * unchanged, so no field is mutated and the audit log records a no-op.
 *
 * ─── What you have to work with (see ./types for full docs) ───────────────────
 *
 * `ctx.action` — the invoked ActionDefinition (the TRIGGER). Branch on
 *   `ctx.action.actionType` and/or `ctx.action.id` to tell which button the
 *   operator pressed (e.g. an "Entrada" vs "Salida" action). `ctx.action.config`
 *   holds the action's jsonb config; `ctx.action.targetField` describes the
 *   field this action writes.
 *
 * `ctx.card` — the card being acted on (base row: id, code, cardTypeId,
 *   tenantId, status). Its `code` is the public identifier.
 *
 * `ctx.currentValue` — the current value of the target field (null when unset).
 *
 * `ctx.tenantId` / `ctx.executedBy` — tenant and acting user for this execution.
 *
 * Helpers (scoped to this card):
 *   - `ctx.getCardActionHistory(opts?)` → prior action_logs, newest first, with
 *     decoded before/after values + timestamps. Use it to reconstruct temporal
 *     facts (e.g. "when was the last entry?", "is there an open visit?").
 *   - `ctx.readField(fieldDefinitionId)` → current value of another field on the
 *     same card.
 *   - `ctx.setFieldValue(fieldDefinitionId, value)` → write an AUXILIARY field
 *     directly (note the non-transactional / non-logged caveat in its doc).
 *
 * ─── What to return ───────────────────────────────────────────────────────────
 *
 * Return `{ newValue }` for the TARGET field — `executeAction` persists it via
 * the standard typed upsert and records before/after in the audit log. Add
 * `metadata` to annotate the log with WHY the strategy computed that value
 * (e.g. `{ metadata: { discount_applied: true } }`). Use `setFieldValue` only
 * for side-effect writes to OTHER fields.
 */

import type {
  ActionStrategyContext,
  ActionStrategyResult,
  TenantActionStrategy,
} from "./types";

import { computeNewValue } from "./compute-new-value";

export const InvitationActionStrategy: TenantActionStrategy = {
  key: "invitation",

  async handleAction(
    ctx: ActionStrategyContext,
  ): Promise<ActionStrategyResult> {

    let newValue = ctx.currentValue; // default to no-op
    
    if (ctx.action.targetField.name=="accesos"){
        ctx.getCardActionHistory().then((history)=>{
          //process history to compute new value for "accesos" field
          //this is a stub, implement your logic here
          newValue = history.length; //example: count of actions as new value
        });

        //TODO en este codigo calcular el nuevo valor de amount
        // tener medias invitaciones e invitaciones enteras y ver de cual se va descontando en esta logica
        
    }else{
      //default proccessing for other fields
      const cfg = ctx.action.config as { amount?: number } | null;
      const amount = cfg?.amount ?? 1;
      newValue = computeNewValue(
      ctx.action.actionType,
      ctx.currentValue,
      amount,
    );
    }
    return { newValue };
  },
};

/**
 * Current on/off state of the boolean field a `toggle` action targets.
 *
 * A toggle renders as a switch, so it has to show the value it would flip. The
 * value lives on the card, the target field id lives on the action, and only
 * the parent holds both — hence a pure helper the parents call, rather than a
 * lookup inside the button/switch renderers.
 *
 * Dependency-free so both the dashboard (client) and the card detail (client)
 * can use it without pulling in the DAL.
 */

/** The minimum an action must expose to have its toggle state resolved. */
interface ToggleActionLike {
  id: string;
  actionType: string;
  targetFieldDefinitionId: string;
}

/** The minimum a card's enriched value must expose. */
interface FieldValueLike {
  fieldDefinitionId: string;
  value: unknown;
}

/**
 * Build a map of `actionDefinitionId → current boolean` for every toggle action.
 *
 * Non-toggle actions are omitted — they render as buttons and have no state to
 * show. A missing `field_values` row (or a null value) reads as `false`, which
 * matches `computeNewValue`'s `!(current ?? false)`: a card that has never been
 * toggled is off, and its first toggle turns it on.
 */
export function buildToggleStates(
  actions: ToggleActionLike[],
  fields: FieldValueLike[],
): Record<string, boolean> {
  const byFieldId = new Map(fields.map((f) => [f.fieldDefinitionId, f.value]));
  const states: Record<string, boolean> = {};
  for (const action of actions) {
    if (action.actionType !== "toggle") continue;
    states[action.id] = byFieldId.get(action.targetFieldDefinitionId) === true;
  }
  return states;
}

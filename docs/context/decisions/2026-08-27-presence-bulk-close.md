# ADR: Presence bulk close — one CTE, not N executions

**Date**: 2026-08-27
**Status**: accepted
**Modules affected**: presence, actions, dashboard, history

## Context

Presence drifts. The flag is wrong whenever a physical passage happens without a
scan — tailgating, a door held open, someone leaving through a fire exit — and
ADR `2026-08-24-presence-control.md` named that honestly and deferred the
mitigation. The concierge needs a way to say "everyone is out now" at the end of
the day without touching 40 cards one at a time.

The obvious implementation is to iterate `executeAction` over
`getPresenceOccupants`. That is what every other presence write does, and it
would give byte-identical logs for free. It does not survive contact with the
numbers: `executeAction` costs roughly five round trips per card (action
definition + field value + tenant strategy + card row + upsert, then the log
insert), the Neon HTTP driver has no interactive transactions, and the calls are
sequential because auto-actions must be. Fifty occupants is hundreds of
sequential HTTP round trips inside one serverless invocation, and a timeout
halfway through leaves the recinto half-closed with no record of where it
stopped.

The read path is also not the right target set. `getPresenceOccupants` filters to
`status = 'active'`, but a card archived or expired *while inside* keeps
`value_boolean = true` invisibly.

## Decision

The bulk close is **one data-modifying CTE** (`closeAllPresence`,
`src/lib/server/presence/close.ts`): resolve the participating card types →
collect every `value_boolean = true` row → `UPDATE … RETURNING` → insert the
`action_logs` rows driven by that `RETURNING` → count. It is the **single,
deliberate exception** to "presence never writes `field_values` directly", and
its log rows are hand-written to be byte-compatible with what `executeAction`
writes for a presence toggle.

It is exposed as `closePresenceAction` (**operator**), attributed to the session
user, and reached from a neutral "Vaciar recinto" button on `/presence`.

## Consequences

- **Positive:** one statement is one implicit Postgres transaction, so the close
  is genuinely atomic on a driver that has no interactive transactions — the same
  trick `purgeExpiredArchivedRecords` and the provisioning CTEs already use.
  Constant round trips regardless of occupancy. Idempotent by construction: a
  second run matches nothing. Because the log rows reproduce `executeAction`'s
  shape, nothing downstream changed — `isPresenceRowSql` classifies them and
  `presenceDirectionLabel` renders them as "Salida" in the feed, `/history`, the
  CSV export and the history filter, with no code touched in any of the four.
- **Negative / trade-offs:** the log shape is now duplicated in two places. It is
  written once by TypeScript in `executeAction` and once by hand in SQL, and the
  coupling is silent if broken — a renamed metadata key would degrade the rows to
  showing "Presencia" instead of "Salida" with nothing failing loudly. This is
  pinned by an integration test asserting the metadata object exactly, and
  flagged in `modules/actions.md`.
- **Follow-ups:** the scheduled auto-close (a later phase) is now a thin wrapper
  — it needs `tenants.timezone`, a closing-time setting and a cron endpoint, but
  the write primitive already exists and only its `executedBy` changes, to
  `SYSTEM_USER_ID`.

## Alternatives considered

**Iterate `executeAction` per occupant.** Rejected: N × ~5 sequential round
trips, no atomicity above a single card, and a real function-timeout risk at
realistic occupancy. It would have given identical logs for free — that is the
only reason it was considered, and reproducing the log shape by hand is the price
paid for dropping it.

**Correlate the close's rows under a `bulkCloseId`**, the way `metadata.scanLogId`
already correlates a scan's auto-actions, so the feed groups them into one entry.
Deferred, with the consequence named rather than hidden: a bulk close emits one
ungrouped feed entry per occupant, and with `feedRawBudget(n) = min(n*3, 100)`
and the display limit counting groups, a close of 30 clears everything else off
the dashboard feed for that period. The mechanism exists and the fix is cheap if
it turns out to matter; building it now would be speculative. Recorded in
`modules/presence.md` → `Open TODOs`.

**Admin or master instead of operator.** Rejected: the concierge is who closes the
facility, and the concierge is an operator. The action is also correctable —
registering an entry again undoes it — so it does not carry the weight that
justifies a higher guard. Every other presence write is already OPERATOR+.

**Filter by `cards.status = 'active'`, matching the read path.** Rejected: that is
exactly the set that leaves ghosts behind. A card archived or expired while
inside keeps `value_boolean = true`, invisible to the page, and walks back in
still flagged as inside the moment it is reactivated. The close filters on the
designation alone and is commented as a deliberate divergence from
`getPresenceOccupants`. It still refuses to reach through a **NULL** designation:
a card type with presence disabled keeps its stored values on purpose, and those
values are what a re-enable restores.

**A red / `destructive` button.** Rejected for the same reason the "Salida"
segment is neutral rather than red: on an access-control surface red means
*denied access*, and `--state-denied` is reserved for scan / action / validation
outcomes (constraint #18). The button is `secondary`, confirmed through the light
`ConfirmDialog` rather than the typed-phrase variant — a close is correctable, so
a typed phrase would be theatre.

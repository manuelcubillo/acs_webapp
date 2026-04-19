# ADR: Tenant-level `allow_override_on_error` with confirmation modal

**Date**: 2026-03-15
**Status**: accepted
**Modules affected**: actions, auth-tenants, scanning

## Context

Following the ADR on sequential auto-actions with hard stop on failure, a real-world need emerged: in some tenants, an operator must be able to continue despite a failure (e.g. the scan validation warns that a card is expired, but the community's operational policy is to let residents in anyway while the issue is resolved).

A permanent "always continue" would erase the safety of the hard stop. A case-by-case operator override with explicit acknowledgement preserves auditability while granting flexibility.

## Decision

Add a tenant-level boolean setting `allow_override_on_error` (default `false`) stored on `tenants`.

- When `false`: auto-action failures halt execution, error is shown to the operator, no override UI.
- When `true`: on failure, a confirmation modal appears. The operator can:
  - Cancel — execution halts as if the setting were `false`.
  - Override — the failed action is re-attempted with an override flag; the attempt is logged as an override in `action_logs`.

Only `master` can toggle the setting.

## Consequences

- **Positive:**
  - Preserves safety-by-default while allowing per-tenant relaxation.
  - Every override is explicit, attributable, and logged.
  - Auditable: "who overrode what, when" can be reconstructed from `action_logs`.
- **Negative / trade-offs:**
  - UI complexity: both operators and the ActiveCardZone/CardActions components must handle the override path.
  - Risk of operator override fatigue if many actions fail routinely — indicates a schema design problem elsewhere, not an override flow problem.
- **Follow-ups:**
  - Future audit/reporting features should surface override counts per tenant per period.
  - Consider a per-action-definition override permission if tenants want finer granularity (not needed yet).

## Alternatives considered

- **Always continue on failure** — rejected: removes the safety of sequential-with-stop.
- **Per-action-type override flag** — deferred: adds configuration surface without current demand. Revisit if a tenant asks.
- **Role-based override (only admin can override)** — rejected for now: operators are the ones on the scan surface in real time; introducing a role gate would block the flow.

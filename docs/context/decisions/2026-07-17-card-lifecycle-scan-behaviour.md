# ADR: Card lifecycle scan / action behaviour (phase 2)

**Date**: 2026-07-17
**Status**: accepted
**Modules affected**: scanning, actions, cards, validations, dashboard

## Context

Phase 1 (`2026-07-17-card-lifecycle-archiving.md`) added the `lifecycle_status` model but left `getCardByCode` deliberately unfiltered, so the scan path, the card detail page and the external device API all still resolve inactive/expired/archived cards. Phase 2 must make the status actually condition scanning and action execution, without duplicating the rule across those entry points and without blurring the operational-vs-informational separation (constraint #10) or the "scan validations never block" rule (constraint #9).

## Decision

Introduce one pure gate, `resolveLifecycleGate(status, allowOverrideOnError)` in `src/lib/server/lifecycle/scan-gate.ts`, returning `allowed | requires_override | blocked | denied_archived`, and reuse it everywhere. `active` runs normally; `inactive`/`expired` are treated as an **error-level scan-validation failure** (a synthetic check is prepended to `validateScan`'s results) so the *existing* override machinery pauses (override on) or blocks (override off) with no new branch; `archived` is a hard denial that never enters the override flow. The gate is genuinely blocking server-side (unlike scan validations) and is enforced in the operational pipeline, `resumeAutoActionsAction`, the manual `executeActionAction`, and the external API. The operational scan is still logged for an archived card — the denial is a real physical event.

## Consequences

- **Positive:** one source of truth; `inactive`/`expired` ride the already-built pause/override/audit path; the override reason (`El carnet está …`) lands in `action_logs.metadata.override_validation_errors`. Colourblind-safe surfaces: off = orange (`--state-override`), archived = red (`--state-denied`), each with icon + label; the detail-page status indicator stays a **neutral** badge (not a reserved state colour).
- **Negative / trade-offs:** lifecycle now blocks action execution while scan validations still do not — two adjacent mechanisms with opposite "blocking" semantics, kept distinct on purpose (gate vs `validateScan`). The external `execute` endpoint has no interactive override, so off-states there collapse to a plain 422 block (see A1).
- **Follow-ups:** phases 3–5 (edit controls, archived view, purge) are unaffected by this gate. If external devices ever need an override, add an explicit flag behind `TODO: API_AUTH` rather than reusing `allow_override_on_error`.

## Alternatives considered

- **Re-derive the verdict in each consumer from `card.status` + the flag.** Rejected: four copies of the same rule drift; the shared gate keeps them identical and unit-testable (4×2 matrix).
- **Filter archived out of `getCardByCode`.** Rejected (already by phase 1): it would turn an explicit denial into "not found" and hide the red archived surface.
- **A dedicated non-overridable "blocked" surface colour for `inactive`/`expired` when override is off.** Rejected: inactive/expired is one lifecycle condition; it stays orange whether override is on (with a continue path) or off (blocked), and only archived is red — mixing a third hue would blur the two-state message.
- **Support an `override` parameter on the external execute endpoint (A1).** Rejected as the default: no interactive operator exists on the device channel, so a silent bypass flag would defeat the "card is off" guarantee.

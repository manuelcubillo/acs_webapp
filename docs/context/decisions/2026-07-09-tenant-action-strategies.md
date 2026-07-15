# ADR: Per-tenant action strategies behind executeAction

**Date**: 2026-07-09
**Status**: accepted
**Modules affected**: actions, auth-tenants, infrastructure

## Context

One tenant needs bespoke action-execution logic (an invitation accounting rule) while every other tenant must keep the built-in behavior unchanged. Until now, `executeAction` (`src/lib/dal/actions.ts`) computed the new field value inline via a private `computeNewValue` switch hardcoded to the four action types (increment / decrement / check / uncheck), with no per-tenant behavior configuration anywhere — `tenants` carried no behavior column. The `actions` module already anticipated this under "Future considerations: plugin/handler registry for `executeAction` extensibility." A branch/fork per client was rejected outright; the real question was how to route ONE tenant to custom code without risking regressions for the others. `executeAction` is the single chokepoint for all execution paths (manual `executeActionAction`, the operational scan pipeline `executeScanWithAutoActionsAction` / `resumeAutoActionsAction`, and the external API route), which makes it the natural and only seam.

## Decision

Introduce a **strategy pattern selected by tenant config**: a new `TenantActionStrategy` interface with a single `handleAction(ctx)` hook, resolved from a new gating column `tenants.scan_strategy` (`text NOT NULL DEFAULT 'standard'`) inside `executeAction`. The `StandardActionStrategy` (the column default) delegates to the relocated `computeNewValue` and reproduces the historical path byte-for-byte; custom strategies (e.g. `InvitationActionStrategy`) are registered in a resolver and apply only to the tenant whose column value selects them, developer-configured via migration/seed. The strategy's returned `newValue` is persisted through the existing typed upsert + `action_logs` write — the surrounding execution contract, the operational-vs-informational separation (ADR `2026-03-20-operational-vs-informational.md`), and sequential auto-action semantics (ADR `2026-03-09-auto-actions-sequential.md`) are unchanged.

## Consequences

- **Positive:**
  - Blast radius is contained: non-routed tenants resolve to `StandardActionStrategy` and their persisted values, logs, and results are byte-identical to the pre-seam behavior.
  - Custom logic lives in an isolated, independently testable module (`src/lib/action-strategies/`) with a clean, documented context (card history reader, field read/write helpers) instead of leaking `if (tenant === X)` branches into the DAL.
  - Extensible: adding a future custom behavior is a new strategy file + a registry entry + a `scan_strategy` value, no changes to `executeAction`.
- **Negative / trade-offs:**
  - `executeAction` now performs two extra indexed PK lookups per call (the tenant's `scan_strategy` and the card row for the strategy context). Output is unaffected; only two harmless reads are added. A follow-up can thread `card` + `scanStrategy` through `ExecuteActionInput` to drop them.
  - Strategy selection is developer-configured (no UI); assigning a tenant to a custom strategy is a deliberate migration/seed step.
  - Inherits the existing non-atomic execution limitation (Neon HTTP has no interactive transactions); a strategy's auxiliary `setFieldValue` writes are standalone and unlogged, as documented on the helper.
- **Follow-ups:**
  - The `InvitationActionStrategy` ships as a **safe no-op stub** (`// TODO: implement`, returns the current value unchanged). The invitation accounting logic — and any new tables it requires — is a separate change and should be captured in its own ADR when designed.
  - `tenants.scan_strategy` is the extension point for any future per-tenant behavior divergence; new keys must be added to both the resolver and the `ScanStrategyKey` union.

## Alternatives considered

- **Per-client branch/fork of the codebase** — rejected: unmaintainable, divergent history, and every shared fix must be cherry-picked; the opposite of the single-codebase multi-tenant model.
- **Feature flag + hardcoded `if (tenant)` logic inside `executeAction`** — rejected: pollutes the shared hot path, couples unrelated tenant behavior, and grows unbounded as more custom rules appear; poor testability and blast-radius control.
- **A new `action_type` enum value** — rejected: `computeNewValue` is a pure `(value, amount) → value` function with no access to card identity, history, or time, so it structurally cannot express the invitation rule. The seam has to be at the execution/orchestration layer, not the value-type layer.
- **A rule/DSL engine driven by data** — rejected as premature: far more surface area and runtime complexity than a single custom tenant warrants; the strategy interface can be backed by a DSL later if multiple tenants ever need configurable rules.

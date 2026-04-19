# ADR: Auto-actions execute sequentially, stopping on first failure

**Date**: 2026-03-09
**Status**: accepted
**Modules affected**: actions, scanning

## Context

During an operational scan, a card type may have multiple auto-actions configured (e.g. decrement a counter, flip a boolean, log an event). A decision was needed on execution semantics: parallel, best-effort (all run regardless of individual failures), or sequential with hard stop.

The system is used in physical access-control scenarios where actions have real-world effects (opening a turnstile, updating a balance). Silent partial execution would be dangerous — an operator needs to know exactly what happened and what didn't.

## Decision

Auto-actions execute **sequentially, in their configured order**. Execution stops on the first failure. Actions already executed before the failure remain applied; subsequent actions are not attempted.

If the tenant has `allow_override_on_error = true`, the UI surfaces an override modal — see the companion ADR on the override flow.

## Consequences

- **Positive:**
  - Predictable, auditable execution — the log always reflects what was tried, in order.
  - Operators see the exact point of failure.
  - Simplifies reasoning for future features that build on action execution.
- **Negative / trade-offs:**
  - No parallelism; slower than "fire and forget" for multi-action scans. Acceptable because action counts per card type are low (typically 1–3).
  - Partial state is possible (N actions ran, N+1 failed). Acceptable because each action is independently logged.
- **Follow-ups:**
  - The override flow is essential for operational UX — see companion ADR.
  - If action types that require true atomicity are added later, a batched/transactional handler variant may be warranted (blocked by Neon HTTP driver limitation).

## Alternatives considered

- **Parallel execution** — rejected: non-deterministic ordering in logs, harder to reason about failures.
- **Best-effort (continue on failure)** — rejected: an operator needs explicit acknowledgement when any action fails; silently skipping is unsafe in a physical-access domain.

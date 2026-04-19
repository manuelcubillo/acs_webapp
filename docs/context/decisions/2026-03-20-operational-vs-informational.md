# ADR: Separation of operational scans and informational consultations

**Date**: 2026-03-20
**Status**: accepted
**Modules affected**: scanning, actions, cards, dashboard

## Context

Two distinct user intents converged on the same route (`/cards/[code]`):

1. An **operational scan** — a physical event where a card is presented to a reader. Must be logged, must trigger auto-actions, must appear in the activity feed.
2. An **informational consultation** — an admin looking up a card to verify data, answer a resident's question, or prepare a change. Must not log, must not trigger actions, must not pollute the feed.

Conflating these had two concrete problems:
- The feed was noisy with admin lookups during investigations.
- Auto-actions (e.g. decrement a balance) fired when an admin was simply browsing, corrupting data.

A hard separation was needed, enforced at the route/entry layer so downstream code cannot accidentally log or fire actions on the wrong path.

## Decision

The distinction lives at the **entry path**, not as a user toggle:

- **Operational path** — entry via `DashboardSearchBar` (manual code input in the dashboard) or `useExternalScanner` mounted in `DashboardView`. Calls `executeScanWithAutoActionsAction(code)`, which: logs `log_type='scan'` in `action_logs`, fires `is_auto_execute` actions sequentially, and returns the full result for display in `ActiveCardZone`. The resume continuation (`resumeAutoActionsAction`) also belongs to this path.
- **Informational path** — reached via the `/cards/scan` camera/reader page, direct URL, card list click, search bar, or any other navigation to `/cards/[code]`. The card detail page (`/cards/[code]/page.tsx`) explicitly does **not** log a scan entry and does **not** run auto-actions. Read-only scan-validation alerts are shown (advisory only).

Scan validations render in both contexts. Nothing else crosses the line.

> **Note on `/cards/scan`**: the dedicated scan page (camera / external reader) navigates to `/cards/[code]` directly, making it an **informational** surface. Only the dashboard input surfaces are operational. This may be counterintuitive — see the `scanning` module for full explanation.

## Consequences

- **Positive:**
  - Clean mental model: the app answers "did this card get scanned for real, or is someone just looking at it?" unambiguously.
  - Feed integrity preserved.
  - Action safety preserved: no accidental mutations from browsing.
- **Negative / trade-offs:**
  - Routing logic must carry context (via a distinct route segment, query param, or component composition). Any new entry point must declare which path it represents.
  - Future features that sit on top of card detail (e.g. bulk ops, reporting) must pick the path deliberately.
- **Follow-ups:**
  - Any new entry surface that lands on a card must be explicitly categorized as operational or informational during design.
  - The `scanning` module documentation enumerates current entry points and must be kept current.

## Alternatives considered

- **User-toggleable mode** (e.g. a "browse mode" switch) — rejected: error-prone, operators would leave it in the wrong position.
- **Role-based behavior** (admin browsing doesn't log, operator browsing does) — rejected: conflates "who is doing it" with "what is happening", and master/admin still need to perform real operational scans.
- **Always log, filter in feed** — rejected: logs have real-world semantics (turnstile opened, balance decremented); filtering them post-hoc would lose those guarantees.

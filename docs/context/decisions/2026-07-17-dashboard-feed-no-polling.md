# ADR: The activity feed stops polling; the client builds its own rows

**Date**: 2026-07-17
**Status**: accepted
**Modules affected**: dashboard

## Context

`ActivityFeed` polled `getActivityFeedAction` every 15s. Each poll re-ran five
sequential Neon HTTP queries and re-serialised the full feed — the complete
`feedLimit` rows, never a delta — whether or not anything had changed. Per open
dashboard that is 20 queries/min at idle; ten open dashboards cost 200
queries/min doing nothing. Scan volume was never the driver: the unconditional
polling floor dominated real activity.

The polling was also masking a bug rather than serving a need. `DashboardView`
passed `key={feedKey}` and bumped it after each scan, intending a refresh. A
changed `key` remounts: state reset to `initialFeedEntries` — the props frozen at
the server render, since nothing calls `router.refresh()` — and restarted the
interval. So a scan reverted the feed to page-load data and waited 15s to
recover, and scanning faster than every 15s starved it indefinitely.

Everything a feed row needs is already in the scan's response. Field values ride
along on `card.fields`; only the summary-field selection and card type names had
to be shipped, and both are small and static per tenant.

Tenants run one dashboard at a time, occasionally two.

## Decision

The feed does not poll. Server-built rows arrive at page load and on the manual
Refrescar button; in between, `DashboardView` appends the rows each mutation just
logged, built client-side by `src/lib/dashboard/feed-entries.ts`.

## Consequences

- **Positive:** an idle dashboard costs nothing. A scan's rows appear instantly
  instead of up to 15s later, and the remount bug is gone with `feedKey`.
- **Negative — the real trade:** rows from OTHER dashboards only appear on
  refresh. With two posts scanning, each sees its own activity plus a snapshot
  from page load. "Actualizado HH:MM" is what keeps that honest. If concurrent
  dashboards become normal, revisit — the cheap version is polling only
  `MAX(executed_at)` (index-only on `action_logs_tenant_executed_at_idx`) and
  surfacing "3 eventos nuevos — refrescar" rather than reloading.
- **Negative:** the client now mirrors server logging rules — scan row first,
  one row per SUCCEEDED auto-action, failures write nothing — and re-applies the
  `showScanEntries` / `showActionEntries` / `feedLimit` filters the DAL applies.
  Duplicated knowledge that can drift.
- **Follow-ups:** a new `log_type` (e.g. `lifecycle`) now needs a client mirror,
  not just a DAL branch and a row variant. Optimising the feed query is no longer
  worth much — it runs twice a session.
- Depends on `2026-07-17-stable-photo-routes.md`: without it, thumbnails from the
  initial load would 403 after 15 minutes, because polling was what kept
  re-signing them.

## Alternatives considered

- **Keep polling, fix the `key` bug.** Fixes the visible bug, keeps the cost.
- **Cheap change-detection poll** (`MAX(executed_at)`, fetch only on change).
  Preserves multi-client freshness for ~1 trivial query per tick. Rejected for
  now because a tenant runs one dashboard; kept as the documented way back.
- **SSE / WebSocket push.** The honest answer at scale, awkward on Vercel
  serverless + Neon HTTP, and unjustified at one client.
- **Reconcile locally-built rows with server ids.** Unnecessary: refresh replaces
  the list wholesale, and the server rows already contain those scans. This is
  why a client-generated `id` is safe — nothing reads it but React's list key.

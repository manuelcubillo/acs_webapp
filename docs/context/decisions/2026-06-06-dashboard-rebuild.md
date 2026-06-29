# ADR: Dashboard rebuild on shadcn primitives + design tokens

**Date**: 2026-06-06
**Status**: accepted
**Modules affected**: dashboard, scanning, cards (presentation), history (read-only consumer)

## Context

Phase 1 shipped the OKLCH token system, the shadcn primitive layer (`src/components/ui/`), `next-themes` for light/dark, and the brand swap (`data-brand`). The dashboard remained on its pre-system implementation: ~95% inline `style={{...}}`, scattered hex literals (200+ across the surface), no dark mode, no brand awareness, and override + warning rendered with identical amber styling — operationally ambiguous.

Phase 2's mandate was presentation-layer only: rebuild every dashboard file on shadcn primitives consuming the semantic tokens, with byte-identical behavior in the scan pipeline (`executeScanWithAutoActionsAction` / `resumeAutoActionsAction`), `useExternalScanner` integration, the activity-feed polling, and the history DAL.

## Decision

**Every dashboard file is rebuilt on shadcn primitives and Tailwind utilities.** Zero `style={{...}}` blocks, zero hex literals, zero `oklch()` literals, zero references to the deprecated `--color-*` aliases survive in any of the rebuilt files. State surfaces (granted / warning / denied / override / info) consume the reserved Layer 2 state tokens; brand-tinted surfaces consume `--primary` / `--accent` / `--ring`.

**Override and warning are now visually distinct.** The two override flows (`AutoActionConfirmModal`, `ConfirmActionModal`) frame the operator decision with `--state-override` (orange, hue 48) in the header and primary CTA. Error details inside each modal still render with `--state-denied` (red) — they are the underlying failures the operator is being asked to override. A warning banner (e.g. "Errores de validación detectados — las acciones requieren confirmación") in `ActiveCardZone` uses `--state-warning` (amber, hue 80) only when override is allowed AND blocking errors exist.

**Scan-log feed icon switches to `--state-info`** (neutral slate). A scan event is not a granted-access decision; the previous grant-green icon implied access success and was misleading. Action-log entries continue to use brand-tinted accents (`--accent` / `--primary`). The override badge on a feed row uses `--state-override`.

**A KPI row is added.** Four read-only cards at the top of the dashboard derived entirely from existing DAL queries — `getActionHistory` for scans-today and actions-today counts (cheap `pageSize=1` calls that exploit the existing cap-at-10001 COUNT), `listCardTypes` for active-types, and the first feed entry's `executedAt` for last-activity. No new DAL functions, no metric invention. The two `getActionHistory` calls plus `listCardTypes` execute in parallel with the existing settings/tenant/feed fetches in `page.tsx`.

**Shell additions.** A `ThemeToggle` icon button lives in the topbar, exposing the dark/light dimension of the design system to the operator. The avatar moves to the shadcn `Avatar` primitive (image with initials fallback). The brand-tinted logo gradient is removed in favor of `bg-primary text-primary-foreground` — it now follows `data-brand`.

**`--color-card-bg` legacy alias is removed.** No remaining consumers. The other nine legacy aliases stay marked `@deprecated` until the un-migrated screens (history, cards, members, settings, card-types, card-designs, auth) are also migrated.

## Consequences

- **Positive:**
  - Dashboard now reacts to `.dark` and `data-brand` without any component edits. Phase 2 in three brand variants × two modes = six combinations from one codebase.
  - All inline styling and scattered hex are eliminated in the rebuilt surface. Future visual changes hit Layer 2 tokens or component variants, not 30 hardcoded values per file.
  - Override flow is now visually distinct from warning. Operator audit clarity is improved without any change to logging semantics (`operator_override=true` continues to flag the action log entry).
  - The migration pattern is now concrete: copy a screen's visual contract; replace every literal with a token; replace every primitive with the shadcn equivalent; ship. History / cards / members / settings / card-types follow this pattern next.
  - KPI strip surfaces real operational signal (scans-today, actions-today, types active, last activity) without inventing any new query.
- **Negative / trade-offs:**
  - Three extra DB calls on `page.tsx` load (two `getActionHistory` with `pageSize=1` + `listCardTypes`). Each is cheap and parallelizable; net page-load impact is negligible against the existing feed query, but it IS more work than before.
  - The `Avatar` primitive uses a Radix portal — slightly heavier than the previous `<img>`, but standard now.
  - Activity-feed entry "Escaneado" badge was previously grant-green; some operators may notice it is now neutral. This is the corrected semantics, not a regression. Documented above.
- **Follow-ups:**
  - Migrate `/history` (`HistoryTable`, `HistoryFilters`, `HistoryTableRow`, `HistoryPagination`) to the same pattern. The export button (`HistoryExportButton`) is a small first step.
  - Migrate `/cards` list + detail surfaces. `CardDetailClient` and `CardList` are the highest-impact targets.
  - Migrate `/settings`, `/members`, `/card-types`, `/card-designs` in subsequent commits.
  - When the last consumer of each `--color-*` alias is removed, drop the alias from `globals.css`. `--color-card-bg` already gone in this commit.
  - The dashboard `QuickCodeInput` (informational lookup widget) still uses inline styles — a Phase 3 target since it lives on the same page.
  - Phase 3 should also add a `Skeleton` loading state for the `ActivityFeed` initial fetch on slow networks. Currently SSR'd, but cold dev cache shows brief muted block.

## Alternatives considered

1. **Migrate dashboard files in-place without shadcn primitives.** Would have moved hex → tokens but kept the inline-style approach. Rejected: would have needed re-migration later anyway when shadcn pattern landed elsewhere; consolidating means one PR per screen, not two.
2. **Big-bang migrate every screen in one PR.** Would have removed all `--color-*` aliases in this commit. Rejected: review surface too large; risk of visual regressions in screens not actively being designed; staged migration keeps each PR small.
3. **Use shadcn `Toast` for `AutoActionFeedback`.** Considered briefly — Toast lives at the screen root with stacking and dismiss. Rejected: feedback needs to render inline below `ActiveCardZone` because it's part of the scan-result composition, not a floating notice. Kept as an inline component.
4. **Build a custom `<StateSurface>` component to encapsulate the bg/border/text/icon trio for each state token.** Considered — would have DRY'd the four-token combo at every state-themed div. Rejected for now: the inline shape is short and varies enough across uses (sometimes border-2, sometimes border-l-4, sometimes bg-card with state-colored icon) that a wrapper would have leaked variant props. Revisit if a fifth state surface appears.

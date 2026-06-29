# ADR: Three-layer OKLCH design token architecture

**Date**: 2026-06-06
**Status**: accepted (paired with `2026-06-06-adopt-shadcn-ui.md`)
**Modules affected**: dashboard, cards, card-types, history, fields, validations, actions, auth-tenants, scanning, card-designs

## Context

The codebase ships ~30 hardcoded hex values per screen, ad-hoc and inconsistent (`#dc2626` vs `#b91c1c` for the same "denied" surface in different files; `#fef2f2` vs `#fef3c7` for backgrounds with the same intent). There is no theming layer, no dark mode, no brand attribute, no separation between primitive color and semantic role. Validation states currently use the same amber for both "warning" and "override", which violates the requirement that operator override and validation warning be visually distinguishable — they are different decisions with different audit consequences (override is recorded as `operator_override=true` in `action_logs`; a warning is informational).

The product is also entering a brand-rename window: the company name is undecided, so any one accent color we commit to today is wrong by next month. We need the brand to be a swappable attribute, not a hardcoded value, and we need to pre-ship the three brand candidates (indigo, cobalt, violet) so the rename is a one-attribute change.

## Decision

**Three layers.**

**Layer 1 — Primitives (OKLCH ramps).** Raw, perceptually-uniform color steps 50 → 950 expressed in `oklch()`. One ramp per intent: `--neutral-*` (hue 250, slate-leaning), `--green-*` (hue 145), `--red-*` (hue 25), `--amber-*` (hue 80, warm yellow), `--orange-*` (hue 48, perceptually distinct from amber), `--slate-*` (hue 240, used for info), and three brand ramps `--indigo-*` (hue 265), `--cobalt-*` (hue 240), `--violet-*` (hue 295). Primitives are written once in `:root` and never overridden by mode or brand. Components must NEVER reference a primitive directly — only Layer 2 may.

**Layer 2 — Semantic.** Maps primitives to roles. Two kinds of roles:
- **shadcn roles** (consumed by every primitive in `src/components/ui/`): `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--border`, `--input`, `--ring`, `--destructive`, `--destructive-foreground`.
- **Access-control state roles** (RESERVED — never used decoratively): `--state-granted`, `--state-denied`, `--state-warning`, `--state-override`, `--state-info`, each with `-foreground`, `-border`, and `-icon` variants.
- **Surface elevation**: `--surface-1` (page), `--surface-2` (card), `--surface-3` (overlay/sidebar).
Layer 2 has a `:root` definition (light mode) and a `.dark` override. The brand swap is achieved by referencing `--brand-{50..950}` (an alias namespace) in semantic tokens; the `--brand-*` namespace is itself overridden by `[data-brand="cobalt|violet"]` selectors. Indigo is the default in `:root`.

**Layer 3 — Density / radius / typography / spacing.** Centralized so adding a "compact" mode later is a single set of overrides. Comfortable density is the default: control height 38–44 px, control padding-y 12 px, card padding 20–24 px, line-height 1.5. Radius scale `--radius-sm/md/lg/xl/2xl`, spacing scale `--space-1..16`, typography `--text-xs..4xl`. A future `[data-density="compact"]` selector overrides only Layer 3.

**OKLCH only.** No hex inside the token files. WCAG AA verified at the semantic-foreground / semantic-background pairings: every `*-foreground` over its background passes 4.5:1 for text and 3:1 for UI in both light and dark.

**State color separation.** Access-control state colors (`--state-*`) are reserved for scan / action / validation outcomes. The brand accent CANNOT be green, red, amber, or orange. Indigo (hue 265), cobalt (hue 240), and violet (hue 295) are the only brand options and are all blue-violet — clearly separated from the state hues 25 / 80 / 48 / 145.

**Override is orange, not amber.** Override (`hue 48`) and warning (`hue 80`) are now perceptually distinct. This fixes the current ambiguity where override and warning render identically.

**`--state-info` exists.** Used for neutral "this happened" surfaces — most importantly the scan-log icon in the activity feed, which previously was grant-green (misleadingly implying access granted). The feed icon now uses `--state-info`.

**Brand swap mechanism.**
```css
:root { --brand-50: var(--indigo-50); /* ...etc to 950 */ }
[data-brand="cobalt"] { --brand-50: var(--cobalt-50); /* ... */ }
[data-brand="violet"] { --brand-50: var(--violet-50); /* ... */ }
```
Semantic tokens reference `--brand-*` (`--primary: var(--brand-600)`), so flipping `data-brand` on `<html>` propagates everywhere without touching any component or any other token.

**Dark mode.** Class strategy via `next-themes` (`<html class="dark">`). Layer 2 alone changes; Layers 1 and 3 are mode-invariant.

**Legacy `--color-*` aliases.** The existing CSS variables (`--color-primary`, `--color-dark`, `--color-secondary`, `--color-muted`, `--color-border`, `--color-border-soft`, `--color-page-bg`, `--color-card-bg`, `--color-subtle-bg`) are retained as `/* @deprecated */` aliases pointing to Layer 2 tokens. This is a temporary bridge for screens not yet migrated (history, cards, members, settings, card-types, card-designs). New code must NOT use the deprecated aliases. They are removed as each screen migrates to shadcn primitives.

## Consequences

- **Positive:**
  - One source of truth for color. A new screen consumes Layer 2; a new component variant uses Layer 2; nothing hardcodes hex.
  - Dark mode is free — every primitive already reads CSS variables.
  - Brand rename is a single attribute change on `<html>` plus the localStorage seed.
  - Override and warning are now visually distinct — operator intervention is no longer confusable with system-detected warning.
  - WCAG AA is enforced at the semantic boundary, not per-component — every primitive inherits compliant pairings.
  - Future density mode (compact for HID-reader-driven turnstile operators) requires Layer 3 overrides only; component code stays untouched.
- **Negative / trade-offs:**
  - Migration of every inline-style block is real work. Phase 1 ships the system; subsequent phases migrate screens. Until a screen is migrated it keeps reading legacy `--color-*` aliases — visually unchanged.
  - The Layer 1 OKLCH ramps must be tuned by hand if a new brand candidate is added; this is a small but explicit operation.
  - Browsers ≥ Chrome 111 / Firefox 113 / Safari 16.4 support `oklch()`. Older Safari (< 16.4) falls back to the literal string, which renders as transparent — practical floor for the app per the existing stack assumptions.
- **Follow-ups:**
  - `foundation/00-overview.md` updated to document the token system in the stack.
  - `foundation/02-conventions.md` gets a "Color usage" section: semantic over primitive over hardcoded; primitives never appear in component code; `--state-*` reserved for access-control outcomes only.
  - `foundation/04-constraints.md` adds: state color reservation (granted=green / denied=red / warning=amber / override=orange / info=slate), brand MUST NOT be a state hue, every color in components is `var(--*)` reference.
  - Once Phase 2 ships, the dashboard files (`DashboardView`, `DashboardSearchBar`, `ActiveCardZone`, `ActivityFeed`, `ActivityFeedEntryRow`, `AutoActionConfirmModal`, `ScanAlerts`) have ZERO hex values and ZERO inline styles.
  - A future ADR will introduce `[data-density="compact"]` when the turnstile-operator UX needs it; nothing has to change in Layer 1 or Layer 2 to support that.

## Alternatives considered

1. **Flat CSS variables (current).** Cheapest to ship, but no separation between primitive and semantic means every theme change is a search-and-replace. Rejected: doesn't scale to dark mode + three brand variants.
2. **HSL instead of OKLCH.** Wider browser support, simpler hand-tuning. Rejected: HSL is not perceptually uniform — equal lightness steps in HSL produce visually-uneven ramps. OKLCH ramps are predictable, which matters for the 11-step scales and for keeping AA contrast at the same lightness slot across hues.
3. **Tailwind CSS color palette directly (no semantic layer).** Tempting because Tailwind ships color utilities, but it forces every component to know "this state means bg-red-50 not bg-red-100" — the exact ad-hocery we're trying to leave.
4. **Single brand, change later.** Defer the brand attribute. Rejected: the brand rename is a known event in the product timeline; pre-shipping the three options costs ~150 lines of CSS and removes a future migration entirely.
5. **CSS-in-JS theme (Emotion / styled-components).** Runtime cost, conflicts with Tailwind v4, no SSR hydration story we want to maintain. Rejected.

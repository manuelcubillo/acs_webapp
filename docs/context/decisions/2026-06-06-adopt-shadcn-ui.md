# ADR: Adopt shadcn/ui as the component primitive layer

**Date**: 2026-06-06
**Status**: accepted (supersedes constraint `04-constraints.md` §16 "No shadcn/ui")
**Modules affected**: dashboard, cards, card-types, history, fields, validations, actions, auth-tenants, scanning, card-designs

## Context

The codebase styles ~95% of its UI through inline `style={{...}}` plus a handful of bespoke CSS classes in `globals.css`. Hex values are scattered across components — `ActiveCardZone.tsx` alone holds 20+ literal hex colors for scan-state surfaces, and `AutoActionConfirmModal.tsx` repeats the pattern. There is no theming layer, no dark mode, no shared `Button` / `Input` / `Card` / `Dialog` / `Badge` primitive, and every screen reinvents focus rings, disabled states, and modal stacking. The original constraint #16 ("No shadcn/ui. UI is custom Tailwind.") was set when the codebase was small enough that a bespoke design was tractable. It is no longer. We are now starting a design-system overhaul (see the companion ADR `2026-06-06-design-system-tokens.md`) and we need a primitive layer that consumes our tokens consistently across dashboard, cards, history, members, settings, card-types, and card-designs.

Two paths were considered: keep writing inline-style primitives ourselves, or adopt shadcn/ui. shadcn ships unstyled, copy-in components that wrap Radix UI for accessibility (focus management, keyboard nav, ARIA roles, escape/click-outside, portal semantics) and reads its colors entirely from CSS variables defined by the host project. Critically for us, shadcn is **not** a runtime dependency — the components are emitted into our own `src/components/ui/` and edited freely. This sidesteps the lock-in concern that originally motivated constraint #16. shadcn v4 also targets Tailwind v4 with a CSS-first config (no `tailwind.config.js`), aligning with our existing setup.

## Decision

**Adopt shadcn/ui as the primitive layer.** Constraint #16 of `foundation/04-constraints.md` is superseded by this ADR.

**Primitives are owned by us, not by shadcn.** All components land in `src/components/ui/` via the shadcn CLI (`pnpm dlx shadcn@latest add <name>`) and are then maintained as project source — same review/edit policy as any other file. shadcn is a one-shot scaffolder, not a runtime dependency.

**The OKLCH token system defined in the companion ADR is the single source of truth for color.** shadcn primitives consume `--background`, `--foreground`, `--primary`, `--card`, `--popover`, `--secondary`, `--muted`, `--accent`, `--border`, `--input`, `--ring`, `--destructive` (and their `-foreground` pairs) from our `:root` / `.dark` definitions. Primitives must NOT hardcode hex or OKLCH values; if a primitive needs a state color not covered by shadcn's roles (granted/denied/warning/override/info), it consumes our `--state-*` semantic tokens instead.

**Runtime dependencies added.** `next-themes` (class-strategy dark mode + FOUC-safe hydration), `class-variance-authority` (variant typing for primitives), `clsx` (className composition), `tailwind-merge` (utility de-duplication). `lucide-react` is already present and is shadcn's default icon source. `tailwindcss-animate` powers the animation utilities shadcn primitives expect.

**Helper module.** `cn()` lives at `src/lib/utils.ts` and is the canonical className composer. No primitive defines its own.

**Initial primitive set installed in Phase 1.** `button`, `card`, `badge`, `input`, `label`, `dialog`, `alert`, `separator`, `tabs`. Additional primitives (`select`, `dropdown-menu`, `popover`, `tooltip`, `table`, `toast`, `form`) are added as Phase 2 / Phase 3 needs them — one CLI call per primitive, no batch installation.

**Inline styles are deprecated.** Every new component must use shadcn primitives + our token-driven Tailwind utilities. The remaining legacy `style={{...}}` blocks in dashboard / cards / history / members / settings / card-types are migrated module-by-module in subsequent commits; this ADR does not require a big-bang rewrite, but the new rule applies immediately to any file touched after this date.

## Consequences

- **Positive:**
  - One copy of every primitive across the app — focus, hover, disabled, error, and dark variants are defined once.
  - Accessibility (Radix-backed): keyboard nav, ARIA, focus traps, portal semantics, escape-to-close — all of which the bespoke modals currently re-implement (inconsistently).
  - Dark mode falls out of the token system: every primitive reads `var(--*)` which the `.dark` override flips.
  - Brand swap (indigo / cobalt / violet) propagates through every primitive with zero component edits — `data-brand` on `<html>` swaps `--brand-*`, which `--primary` / `--ring` / `--accent` reference.
  - Removes 200+ literal hex values from components; reduces visual-regression surface significantly.
- **Negative / trade-offs:**
  - Bundle size: Radix primitives are tree-shakable but each adds a few KB. Acceptable for an internal tool; would matter more for public-facing landing pages.
  - Initial migration is meaningful work — every screen using inline styles needs a pass. Phase 1 ships only the design system; Phase 2 redoes the dashboard; the rest follows.
  - The `src/components/ui/` directory is generated code that should NOT be edited by hand on a whim — edits there change every consumer. Treat them like editable but versioned generated code.
- **Follow-ups:**
  - `foundation/04-constraints.md` §16 is rewritten by this ADR. New constraints around token usage are added (see the companion token ADR).
  - `foundation/00-overview.md` stack table updated to include `shadcn/ui` (primitives), `next-themes`, `class-variance-authority`.
  - `foundation/02-conventions.md` gets a new section on primitive usage rules: "shadcn primitives are imported from `@/components/ui/*`. Do not duplicate them. Do not hardcode color values."
  - Once a screen is migrated, its hardcoded hex values are removed and `--color-*` deprecated aliases (see token ADR) are not re-introduced.

## Alternatives considered

1. **Keep hand-rolling primitives.** Lowest bundle cost, full control. Rejected: every screen has already shown the cost — focus and dark-mode inconsistencies, duplicated modal stacking logic, no theming hook, accessibility regressions on every new feature.
2. **Radix UI directly, no shadcn.** Buys the accessibility but not the variant scaffolding, the icon convention, or the `cn()` composition idiom. We would write the variant layer ourselves. Rejected: shadcn IS that variant layer over Radix; building it again would be net-negative time.
3. **Headless UI / Ariakit / Park UI.** Each is a viable primitives library, but shadcn's "copy into your repo" model is the single biggest reason to choose it for this codebase — it eliminates the lock-in argument that originally motivated constraint #16 and lets us evolve primitives without forking.
4. **Material UI / Mantine / Chakra.** Heavyweight themable component frameworks. Rejected: they own theming, contradict our token system, and ship runtime CSS-in-JS that conflicts with Tailwind v4.

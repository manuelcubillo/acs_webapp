# ADR: Phase 3 — inline-style migration, alias retirement, and decorative-color policy

**Date**: 2026-06-07
**Status**: accepted (builds on `2026-06-06-design-system-tokens.md` and `2026-06-06-adopt-shadcn-ui.md`)
**Modules affected**: cards, card-types, history, dashboard (settings), card-designs, auth-tenants, fields, validations, actions

## Context

Phases 1 (OKLCH token system + shadcn/ui) and 2 (dashboard rebuild) shipped the design
system but left every other screen reading the legacy `--color-*` aliases and legacy
component classes (`.card`, `.btn*`, `.form-input`, `.settings-*`, `.sidebar-item`) via
hardcoded inline `style={{…}}` and hex literals. Phase 3 brings the remaining surfaces —
cards (route pages), members, card-types, history, settings (+sub-pages), card-designs,
and auth — up to the Phase 2 standard: shadcn primitives + Layer 2 semantic tokens, zero
theme/chrome inline styles, zero hex in migrated files. Behavior was kept byte-identical
(presentation-only). Two recurring questions had to be answered consistently: (1) how to
colour things that are decorative categories with no semantic token (member roles, field
types, action types, design kinds), and (2) which inline styles are legitimately
*data-driven* and must be preserved.

## Decision

1. **Migrate every target surface to shadcn primitives + Layer 2 tokens.** Hand-rolled
   modals → `Dialog`; native `<select>` → `Select`; hand-rolled toggles → `Switch` /
   `Checkbox`; buttons → `Button`; the card-design action menu → `DropdownMenu`.
2. **Decorative category colours use the Tailwind palette, never the reserved `--state-*`
   tokens.** Field types / action types / design kinds use `emerald|rose|amber|violet|pink|sky`
   utilities (+ brand/neutral), matching the approved `CardActions.tsx` precedent. Reserved
   `--state-granted|denied|warning|override|info` remain exclusively for scan/action/validation
   *outcomes* (e.g. scan-validation severity, operator override).
3. **New `--role-*` Layer 2 tokens** (`--role-master|admin|operator` + `-foreground`, light+dark,
   registered in `@theme`) back member-role badges. They intentionally do **not** reference
   `--brand-*` so role identity stays constant across brand swaps.
4. **Generic CRUD success → neutral `Alert`; generic error → `Alert variant="destructive"`.**
   Entity active/inactive status → neutral `Badge`. None of these consume reserved state tokens.
5. **Data-driven inline styles are preserved** and are the only allowed inline-style/hex
   exceptions (see list below).
6. **Alias-retirement policy: an alias/legacy class is removed only when it has zero
   consumers.** After migration, all legacy `--color-*` aliases and all legacy component
   classes were orphaned and removed from `globals.css`. The `@theme inline` `--color-*`
   registrations (which generate Tailwind utilities) are unrelated and stay.
7. **Auth chrome was extracted** to `components/auth/AuthShell.tsx` (page background +
   brand-aware gradient blobs + glass card). Blob gradients reference `--brand-*` so they
   follow `data-brand`; they remain inline `style` because a radial-gradient has no utility.

## Consequences

- **Positive:** one consistent token-based styling layer across the whole app; dark mode and
  brand swap now work on every screen; `globals.css` shed its deprecated bridge; future
  density/brand changes need no per-screen edits.
- **Negative / trade-offs:** decorative category colours use Tailwind palette utilities rather
  than semantic tokens — acceptable per the Phase 2 precedent, but they don't follow a future
  re-theme automatically. Some entity-status surfaces lost their green/amber tint (now neutral)
  to honour the state-token reservation.
- **Data-driven exceptions (preserved inline styles / literals, by design):**
  `card-designs/editor/EditorCanvas.tsx` (all Konva `fill`/`stroke`/stage bg — Konva cannot
  consume CSS tokens), `editor/nodeFactory.ts` (node default colours written into layout data),
  `editor/TextEditOverlay.tsx` (screen-space position + node font/colour mirror), `editor/PropertiesPanel.tsx`
  (font-family preview + native colour-swatch value), `CardDesignEditor.parseLayout` default
  canvas background, `TemplatePicker` thumbnail `aspectRatio`, `HistoryTableRow` action-accent
  colour (configured action colour, mapped to OKLCH vars), `AuthShell` blob gradients (`--brand-*`).
- **Follow-ups:** a future ADR could promote the decorative palette to named `--category-*`
  tokens if re-theming of category colours is ever required.

## Alternatives considered

1. **Use `--state-*` tokens for decorative categories.** Rejected — violates the reservation
   in `2026-06-06-design-system-tokens.md`; would make operator-override orange indistinguishable
   from a decorative accent.
2. **Tokenize the Konva canvas colours.** Rejected — Konva renders to canvas and takes literal
   colour strings; reading CSS vars per-frame is fragile and would desync the DOM backdrop from
   the stage. Treated as the documented canvas exception instead.
3. **Keep the legacy `--color-*` aliases as a permanent bridge.** Rejected — they had zero
   consumers post-migration; keeping them invites regressions and contradicts the deprecation note.

# ADR: Card lifecycle edit controls, search status filter, and flash confirmations

**Date**: 2026-07-17
**Status**: accepted
**Modules affected**: cards, card-types

## Context

Phase 3 of 5 of the card lifecycle feature needs UI to change a card/card-type
status and to filter the card search by status. Two placement/tooling questions
had no obvious answer:

1. **Where do the card-type controls live?** The card-type "edit" surface is a
   5-step draft→submit wizard; embedding an immediate side-effecting archive
   button inside a wizard step risks the master losing unsaved wizard state and
   is semantically confusing. The card "edit" surface, by contrast, is a plain
   form.
2. **How do we confirm a redirect action?** The spec asked for a "toast", but the
   codebase has no toast system, and adding `sonner` means adding another
   component library — which CLAUDE.md forbids without a preceding ADR.

## Decision

1. **Controls placement (A1):** card lifecycle controls (activate / deactivate /
   archive) live in a dedicated section of the card **edit page**
   (`cards/[code]/edit`, already ADMIN-gated). Card-type controls live on the
   card-type **detail page** (`card-types/[id]`, MASTER-only section), *not* in
   the edit wizard. The asymmetry is deliberate: each set of controls sits on the
   simplest management surface for its entity.
2. **Confirmations (A2):** archiving redirects with a `?flash=<code>` (and `&n=`
   for the cascade size) query param; the destination list page resolves it to a
   message rendered by the shared `FlashMessage` component on the existing
   `Alert` primitive, which strips the param via `history.replaceState` and
   auto-dismisses. No toast library is introduced.
3. **Primitives:** no new `src/components/ui/` primitive. Confirmations reuse the
   `Dialog` primitive (via a shared `ConfirmDialog`); the status filter reuses
   the established `CardViewToggle` segmented-button pattern (`CardStatusFilter`).

## Consequences

- **Positive:** no new dependency; confirmations and segmented controls are
  consistent with existing patterns; wizard state is never endangered by a
  lifecycle side effect.
- **Negative / trade-offs:** flash messages ride the URL, so they are one-shot
  and page-scoped (no stacking, no cross-page queue like a real toaster).
- **Follow-ups:** if a global toast becomes genuinely necessary, it needs its own
  ADR + `sonner` (or equivalent) and a root `<Toaster>`; until then, `FlashMessage`
  is the sanctioned confirmation channel. Restore/trash UI is phase 4.

## Alternatives considered

- **Card-type controls inside the edit wizard** — rejected: mixing an immediate
  archive with a draft/submit flow is confusing and can discard wizard edits.
- **Add `sonner` for real toasts** — rejected for phase 3: it is another
  component library, which requires its own ADR per CLAUDE.md; the flash pattern
  covers the need with zero new dependencies.
- **`AlertDialog` / `ToggleGroup` shadcn primitives** — rejected: the existing
  `Dialog` and the `CardViewToggle` button pattern already serve, so no new
  primitive was added.

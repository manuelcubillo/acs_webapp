# Architecture Decision Records

ADRs capture non-trivial decisions that affect future work: deliberate trade-offs, reversals of prior choices, and constraints that future features must respect.

## When to add one

Add an ADR when the change involves:

- A deliberate trade-off between two or more reasonable options.
- A reversal of a previous decision (the new ADR must cite the superseded one).
- A constraint or pattern that will affect future features.

**Do not** add an ADR for: bug fixes, refactors without behavior change, cosmetic UI edits, dependency bumps, or trivial configuration changes.

## File naming

`YYYY-MM-DD-short-kebab-title.md`

Examples:

- `2026-03-09-auto-actions-sequential.md`
- `2026-03-15-allow-override-on-error.md`
- `2026-03-20-operational-vs-informational.md`

## Template

See `TEMPLATE.md` in this folder.

## Relationship with modules

Each ADR should list the modules it affects. The affected module's `Recent changes` entry can reference the ADR filename.

Once an ADR is `superseded`, update its front-matter but keep the file — history stays navigable.

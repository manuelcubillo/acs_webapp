# Update Protocol

This document is executed when the user says **"update context"** (or equivalent) at the end of a feature or fix.

## Goals

1. Keep module documents in sync with real code.
2. Capture non-trivial decisions as ADRs.
3. Preserve foundation/ stability — only touch it when fundamentals change.
4. Minimize future token cost by keeping entries concise.

## Execution steps

### 1. Identify scope of changes

Run, in this order:

1. `git diff --name-only <last-commit-before-session>..HEAD` to list touched files.
2. If that's not available, list files modified or created during the session.
3. Map touched files → affected modules using this rule:
   - `src/lib/dal/<x>.ts` → look up `<x>` in each module's `Key files`.
   - `src/lib/actions/<x>.ts` → same.
   - `src/components/<x>/` → same.
   - `src/app/(dashboard)/<route>/` → same.
   - `src/lib/db/schema/` → affects `infrastructure` + every domain module using the modified tables.

Produce an internal list of modules to update. Do not proceed until this list is explicit.

### 2. Update each affected module

For each module file, update only the sections where content actually changed:

- **`Last updated`** — today's date in `YYYY-MM-DD`.
- **`Last feature`** — one-line description of the feature that triggered the update.
- **`Key files`** — add new files, remove deleted ones. Keep one-line descriptions.
- **`Data model`** — only if schema changed. Keep it minimal; full schema lives in `foundation/01-architecture.md`.
- **`Main flows`** — update only if the behavior of an existing flow changed or a new flow was added.
- **`Extension points`** — update if extension surface changed.
- **`Module interactions`** — update only if the module now reads from / writes to / triggers something new.
- **`Open TODOs`** — add new TODOs introduced; remove TODOs resolved by this feature.
- **`Recent changes`** — prepend a new dated entry. Keep max 5 entries. Prune older ones.

Do **not** rewrite sections that did not change. Consistency beats prose polish.

### 3. Foundation updates (rare)

Modify a `foundation/` file **only if** one of these happened:

- A non-negotiable constraint changed → `04-constraints.md`.
- A new code pattern was adopted project-wide → `02-conventions.md`.
- A new domain term was introduced → `03-glossary.md`.
- A new table was added or an architectural pattern changed → `01-architecture.md`.
- A stack component was upgraded/replaced or a new scope was added to the project → `00-overview.md`.

If none of the above applies, **do not touch `foundation/`**.

### 4. Create an ADR when warranted

Create a new file in `decisions/` when the change involves:

- A deliberate trade-off between two or more reasonable options.
- A reversal of a previous decision (the new ADR must cite the superseded one).
- A constraint or pattern that will affect future features.

ADRs are **not** needed for: bug fixes, refactors without behavior change, cosmetic UI edits, dependency bumps.

File naming: `decisions/YYYY-MM-DD-short-kebab-title.md`.

Use the template in `decisions/TEMPLATE.md`.

### 5. Never create a new module without asking

If the feature introduces a genuinely new domain, stop and ask the user before creating `modules/<new-module>.md`. Suggest a name and a short responsibility statement, then wait for confirmation.

### 6. Final report to the user

After updating, reply with exactly this structure — nothing else:

```
Context updated:
- modules/<file>.md — <one-line reason>
- modules/<file>.md — <one-line reason>
- decisions/<date>-<slug>.md — <one-line reason>   (if any)
- foundation/<file>.md — <one-line reason>          (if any)

TODOs resolved: <count>. TODOs added: <count>.
```

Do not add prose, apologies, or commentary. The user wants a diff, not a narrative.

## Token-cost hygiene

- Recent changes section: max 5 entries per module. Prune aggressively.
- Module interactions: only list interactions that affect extensibility. Trivial ones (all DAL files use `db` from `src/lib/db`) do not belong here.
- If a module grows past ~4 KB, propose splitting it rather than continuing to add.

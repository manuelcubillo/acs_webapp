# Context Documentation

Purpose: give any new chat session (human or AI) the minimum context needed to work on this project without re-explaining it from scratch.

## How it's organized

- **`foundation/`** — Stable documents. Rarely change. Read once per session.
- **`modules/`** — One file per business domain. Read only the ones relevant to the current task.
- **`decisions/`** — Architecture Decision Records (ADRs). One file per non-trivial decision, dated.
- **`INDEX.md`** — Router. Maps task keywords to the modules that must be read.
- **`UPDATE-PROTOCOL.md`** — Recipe followed by Claude Code when the user says "update context".

## Reading order for a new session

1. Read `INDEX.md` to identify which modules apply to the task.
2. Read `foundation/` once (00 → 04).
3. Read the identified modules from `modules/`.
4. Check `decisions/` only if a module's `Recent changes` references an ADR.

## Updating after a feature

Follow `UPDATE-PROTOCOL.md` strictly. Do not improvise — consistency matters more than completeness here.

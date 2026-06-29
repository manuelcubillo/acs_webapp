# 00 · Project Overview

**Last updated**: 2026-06-06

## What this is

Web-based access control system primarily for residential communities. Multi-tenant and schema-flexible: each tenant defines its own card types (badge templates) with custom fields, actions, and scan validations. The system dynamically renders forms, views, and actions based on those schemas.

## Core value proposition

Clients configure their own data schemas without code changes. A new card type, a new field, a new action rule — all are data, not code.

## Scope boundaries

In scope:
- CardType definition (wizard) and Card CRUD.
- QR/barcode scanning via camera and USB/Bluetooth HID readers.
- Per-tenant role-based access control.
- Dashboard with activity feed and summary fields.
- Operational scans (logged, auto-actions) vs informational consultations (read-only).

Out of scope (for now):
- Hardware integration beyond HID-class readers.
- Billing, subscription, or tenant provisioning UI.
- Native mobile apps (responsive web only).

## Stack

| Layer          | Choice                                                      |
| -------------- | ----------------------------------------------------------- |
| Framework      | Next.js (App Router, Turbopack)                             |
| UI runtime     | React 19, TypeScript                                        |
| Styling        | Tailwind CSS 4 (CSS-first config, no `tailwind.config.js`)  |
| Design system  | 3-layer OKLCH tokens (primitives → semantic → density); brand swap via `data-brand` on `<html>` (indigo / cobalt / violet); dark mode via `.dark` class |
| Primitives     | shadcn/ui in `src/components/ui/` (Radix-backed, copy-in, edited freely) |
| Theming        | `next-themes` for mode, custom Brand context for `data-brand` |
| Variants       | `class-variance-authority` + `clsx` + `tailwind-merge` (via `cn()` in `src/lib/utils.ts`) |
| Auth           | Better Auth (email + password + username)                   |
| ORM            | Drizzle ORM                                                 |
| Database       | PostgreSQL on Neon (HTTP driver, no interactive tx)         |
| Validation     | Zod at Server Action boundary + custom TS engines           |
| Scanner        | html5-qrcode (camera), native keydown timing (HID reader)   |
| Drag & drop    | @dnd-kit (field reordering)                                 |
| Package mgr    | pnpm                                                        |
| Deploy         | Vercel                                                      |
| Tests          | Vitest                                                      |

## Runtime requirements

- **Node.js v20 ONLY.** Node 22 (Homebrew default on macOS) is broken due to an `icu4c` ABI mismatch. Use `/opt/homebrew/opt/node@20/bin/node` or prefix with `PATH="/opt/homebrew/opt/node@20/bin:$PATH"`.

## Non-negotiable conventions

All detailed in `04-constraints.md`. Summary:

- All code comments and JSDoc in English.
- Modular, maintainable, single-responsibility files.
- `tenant_id` always from auth session, never from client input.
- UUID never exposed to the client; `code` is the public Card identifier.
- Soft delete everywhere — `isActive = false`.
- Validation on both frontend and backend (backend is source of truth).
- Responsive-first (operators use tablets and phones).

## Audience

This documentation is read by Claude Code (primary), by the developer at session start, and by any future maintainer. Keep it dense, actionable, and free of storytelling.

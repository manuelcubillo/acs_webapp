# Architecture Review — Documentation-Only Pass

**Date**: 2026-07-19
**Reviewer**: independent architecture review (Claude, documentation-only pass)
**Scope**: everything under `docs/context/` — 5 foundation files, 11 module files, 22 ADRs, `INDEX.md`, `README.md`, `UPDATE-PROTOCOL.md`. **No application source code was read.**

---

## Caveats (read first)

- This review is based on **documentation only**. Every finding below is a **hypothesis to be confirmed against the code** in a follow-up pass. Where the documentation is explicit and internally consistent, confidence is marked **High**; where a finding depends on implementation details the docs don't fully pin down, it is marked **Medium** or **Low** and lists the specific files to read to confirm it.
- Where the documentation contradicts itself, I say so explicitly rather than guessing which side is true. Contradictions are themselves findings — this project's docs are the primary onboarding artifact, and they are read by AI agents that will faithfully reproduce whatever they say.
- Opinions are labeled as opinions. Several flagged items were deliberate, ADR-recorded decisions; I flag them anyway when the recorded trade-off has costs the ADR under-weighted, but I distinguish "this is wrong" from "I would have chosen differently."

---

## 1. Executive summary of the app

**What it is.** A multi-tenant, web-based access control system, primarily for residential communities (working name: Veredillas / ACS). Each tenant (an organization) defines its own **card types** — badge templates with custom fields, actions, and scan-time validation rules — entirely as data, with no code changes. The system dynamically renders forms, card views, action buttons, and validation alerts from those per-tenant schemas. Operators scan physical cards (QR/barcode via camera, or USB/Bluetooth HID readers detected by keystroke timing) at the dashboard.

**Who it's for.** Three per-tenant roles: `operator` (scan, view, execute actions), `admin` (+ card CRUD, member management), `master` (+ card type definition, tenant settings). There is deliberately no super-admin; every setting is per-tenant.

**Core data model.** `tenants` → `tenant_members` (roles) → `card_types` → { `field_definitions`, `action_definitions`, `scan_validations`, `card_type_summary_fields`, linked `card_designs` } → `cards` → `field_values` (EAV variant with type-specific columns: `value_text/_number/_boolean/_date/_json`). A unified `action_logs` table records scans, action executions, and card lifecycle transitions (`log_type: scan | action | lifecycle`). Cards are publicly identified by `code` (unique per tenant), never by UUID. Photos live in R2/MinIO object storage behind a `CardPhotoStorage` interface; the DB stores object keys, not URLs.

**Primary lifecycle / flow.** A master defines a CardType in a 5-step wizard → an admin creates Cards of that type → an operator performs an **operational scan** on the dashboard: the scan is logged, a lifecycle gate is evaluated (active / inactive / archived), scan validations run (they *inform but never block*), and auto-actions execute *sequentially, stopping on first failure* — with a per-tenant override-on-error modal flow. Everything lands in the activity feed and the `/history` audit view. A hard invariant separates this from **informational consultation** (any navigation to `/cards/[code]`), which never logs and never fires actions. Cards and card types have a full lifecycle (`active | inactive | archived | expired`) with a trash view, per-tenant retention (default 30 days), and a daily cron purge that performs the system's only hard deletes.

**Stack.** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 + shadcn/ui + a three-layer OKLCH token system · Better Auth · Drizzle ORM · PostgreSQL on Neon (HTTP driver, **no interactive transactions** — a constraint that shapes much of the write-path design) · Vercel + Docker/self-hosted · Konva for a visual card-design editor with PNG export.

---

## 2. Architecture assessment

### 2.1 Is the overall architecture sound?

**Yes, fundamentally — with two structural reservations.** (Confidence: High on the "yes", the reservations are individually marked.)

The core shape is right for the stated goals:

- **Schema flexibility** is achieved with the FieldDefinition/FieldValue pattern using *typed* value columns rather than a jsonb blob. This is the correct call: it keeps field values indexable and queryable, which is what makes the 14-operator field-level filtering in `/history` and card search possible with correlated `EXISTS` subqueries instead of jsonb path gymnastics.
- **Multi-tenancy** is enforced consistently at the DAL boundary (`tenantId` as an explicit parameter everywhere, derived only from the session) and extended into object storage (tenant-prefixed keys as the security primitive). The model is conventional (no RLS) but coherent.
- **The domain semantics are unusually well thought through** for a system of this size: operational vs. informational entry paths, inform-don't-block scan validations, sequential-stop-on-failure auto-actions with audited overrides, and a lifecycle gate with a single pure decision function. These are real domain decisions, recorded in ADRs with genuine alternatives analysis.
- **The Neon HTTP no-transactions constraint is handled maturely**: single data-modifying CTEs for anything that must be atomic (lifecycle transitions, cascading archive, purge), documented best-effort-with-compensation where atomicity was judged not worth a driver swap (tenant bootstrap).

**Reservation 1 — the external API is an open door.** `/api/cards/[code]` (GET) and `/api/cards/[code]/actions/[id]/execute` (POST) authenticate by a raw, unauthenticated `x-tenant-id` header (`TODO: API_AUTH`, open since the early docs). As documented, anyone who learns a tenant UUID can read any card and **execute actions** — mutate field values, decrement balances — on that tenant's cards from the internet. Every other part of the security model (session-derived tenant, guards on every Server Action, tenant-prefixed storage keys) is undermined by this one tree. For a project described as "close to finished," this is the single most important open item. (Confidence: High that the gap exists — the docs state it plainly in three places. Verify: `src/lib/api/auth.ts` `getTenantFromHeader`, `src/app/api/cards/[code]/route.ts`, `.../execute/route.ts` — check whether anything else limits exposure, e.g. deploy-level network restrictions.)

**Reservation 2 — concurrency is unaddressed in the hottest write path.** `executeAction` is documented as read current value → compute new value → write → log. Every atomicity discussion in the docs (constraint #13, `modules/actions.md`, the strategy ADR) is about *crash* partial-state, but none mentions *concurrent* execution: two operators (or two turnstiles, or the external API plus a dashboard) scanning the same card at the same time is a classic lost-update race — two reads of `5`, two writes of `4`, one decrement lost. In a physical access-control domain where the canonical example is decrementing a balance, this matters. Notably, the fix does not require transactions: a single-statement atomic update (`SET value_number = value_number - 1 ... RETURNING`) is fully compatible with the Neon HTTP driver — the same single-statement trick the lifecycle service already uses. The read-compute-write shape appears to be accidental, not essential (the strategy pattern complicates but does not preclude it — an optimistic `WHERE value = <read value>` compare-and-set would preserve the strategy contract). (Confidence: **Medium — needs code verification**: `src/lib/dal/actions.ts` `executeAction`, `src/lib/action-strategies/`, and whether any locking/versioning exists that the docs don't mention.)

### 2.2 Is it well decoupled?

**Mostly yes at the data layer; the seams blur exactly where the docs say they blur.**

**Clean seams (verified as consistently described across modules):**

- **auth-tenants → everything**: guards and `getCurrentTenant()` are a one-way dependency; nothing reaches back into auth internals.
- **validations**: two pure, framework-agnostic TypeScript engines with a narrow, well-typed result surface (`ScanValidationResult`). Consumed, never consuming.
- **storage/infrastructure**: the `CardPhotoStorage` interface + `getPhotoStorage()` factory is a textbook seam — R2 ↔ MinIO is config, not code. `photo-routes.ts` being deliberately dependency-free so both DAL and client can import it shows real boundary awareness.
- **The three `/api` trees** (header-authed device, session-authed browser, secret-authed cron) are kept deliberately separate with an explicit "one route tree, one auth model" rule. This is good discipline (the *content* of the device tree's auth is the problem, not its separation).
- **card-designs**: self-contained (own tables, own rendering pipeline), touching other modules only through the field-definition intersection and a preview button.

**Leaky seams:**

1. **The operational scan pipeline has no home.** It is the single most important flow in the system, and four modules describe overlapping ownership: `actions.md` says the pipeline "lives here, not in actions.ts" (i.e., in `src/lib/actions/cards.ts` but conceptually owned by actions); `cards.md` says cards "owns `executeScanWithAutoActionsAction`"; `scanning.md` says the "operational pipeline [is] owned by `cards`"; `dashboard.md` calls itself "the primary operational scan surface." The code reportedly sits in a file named after a different domain (`lib/actions/cards.ts`). The four-way boundary description (scanning = input, cards = resolution, actions = execution, dashboard = display) is conceptually clean, but the pipeline that crosses all four is smeared rather than being a named thing. This is the strongest signal of the incremental build path in the whole doc set. (Confidence: High that the *documentation* ownership is smeared; Medium on how bad the code entanglement actually is. Verify: `src/lib/actions/cards.ts`.)

2. **The dashboard now mirrors the actions module's logging semantics client-side.** Per the no-polling ADR, `src/lib/dashboard/feed-entries.ts` must replicate exactly what `executeScanWithAutoActionsAction` logs (scan row first, one row per *succeeded* auto-action, DAL feed filters re-applied). The ADR honestly names this "duplicated knowledge that can drift" — it is coupling across a module boundary, accepted to buy zero idle cost. Acceptable at one-dashboard-per-tenant scale, but it converts every future change to logging semantics into a two-sided change, and the failure mode (feed silently disagrees with history) is invisible. (Confidence: High — the ADR states it.)

3. **Lifecycle piggybacks on the scan-validation channel while inverting its core invariant.** The lifecycle gate *does* block (server-side), while scan validations *never* block (constraint #9) — yet an inactive/expired card is surfaced as a synthetic error-level `ScanValidationCheck` prepended to `validateScan`'s results so the existing override machinery drives it. The reuse is clever and the docs flag it with a ⚠️ in `validations.md`, but the result is two adjacent mechanisms with opposite blocking semantics sharing one result stream. Constraint #9 is now true only with an asterisk a future contributor must know about. (Opinion: the reuse was probably the right call versus building a parallel modal flow, but this is the most fragile invariant in the system and deserves a regression test at the boundary.)

4. **Tenant "settings" are split across two tables with no placement rule.** `scan_mode`, `archive_retention_days`, `scan_strategy` live on `tenants`; `allow_override_on_error` — a **server-side execution policy** that gates action execution including the external API — lives in `dashboard_settings`, a table otherwise described as "per-tenant dashboard configuration: feed limits, entry visibility." The original override ADR (2026-03-15) even says the flag is "stored on `tenants`"; the current docs say `dashboard_settings`, and no ADR records the move. Consequence today: the operational scan pipeline must read `dashboard_settings` to make an execution decision — a presentation-named table on the hot path of a security-relevant decision. (Confidence: High — three docs state the current location explicitly and the ADR contradicts them.)

### 2.3 Is it over-engineered or excessively complex anywhere?

Separating **essential** complexity (inherent to multi-tenant, schema-flexible access control) from **accidental** complexity (byproduct of the incremental build):

**Essential — keep:** typed-column EAV; dual validation engines; operational/informational split; role hierarchy; lifecycle + trash + retention; scan-mode plumbing; the CTE-atomicity discipline. None of this should be simplified; each carries real capability.

**Accidental — candidates to merge, collapse, or simplify:**

1. **Two representations of "which tenant does this user belong to."** The glossary says "Users can belong to multiple tenants via `tenant_members`" (a many-to-many join with roles), but the documented flows enforce strict 1:1: `createTenantWithMasterAction` refuses if `user.tenantId` is set; `createAndAddMemberAction` rejects an email that exists in *any* tenant ("one user per tenant invariant"); a custom `user.tenantId` column on the Better Auth table is the session's source of tenant identity, and it must be manually kept in sync with `tenant_members` in at least four flows (bootstrap, invitation accept, member add, member removal). **These are two expressions of the same concept**, and the docs contradict each other about which model is real. Either commit to 1:1 (fine — then document it as the invariant, fix the glossary, and treat `tenant_members` as the role-carrying detail record) or make `tenant_members` the single source of truth and derive the session tenant from it. The dual-write is a standing sync-bug generator. (Confidence: Medium-High. Verify: `src/lib/api/auth.ts` `getCurrentTenant`, `src/lib/db/schema/auth.ts`, the four sync sites in `src/lib/actions/{tenants,members,invitations}.ts`.)

2. **The `expired` lifecycle status is a dead value threaded through every consumer.** Nothing sets it; a CHECK constraint exists solely to forbid it on `card_types`; the scan gate, the search filter ("Inactivos groups inactive + expired"), the state machine, and the docs all must special-case it to say "behaves exactly like `inactive`." The phase-1 ADR records that keeping it was the user's explicit request — so this is a flagged deliberate choice, not a mistake — but it is textbook speculative generality: cost in every consumer today, benefit only if a future auto-expiry feature both arrives and wants precisely this enum value. (Opinion; effort to remove is small, and re-adding an enum value later is also small.)

3. **The per-tenant action strategy seam currently guards a no-op.** The strategy pattern (interface + registry + `tenants.scan_strategy` column) is a well-chosen seam at the right chokepoint, and the ADR's alternatives analysis is genuinely good. But per the ADR, the only custom strategy (`InvitationActionStrategy`) shipped as "a safe no-op stub (`// TODO: implement`)" — while a July git commit message claims the customer feature is "implemented." One of these is stale. If the stub is still a stub, the entire mechanism (plus two extra DB reads on *every* action execution for *every* tenant) currently buys nothing. (Confidence: Low on current state — **needs code verification**: `src/lib/action-strategies/`. Also note the naming problem in §2.2/§4.)

4. **Three ways to attach a user to a tenant.** Email invitation (`member_invitations` + token flow), direct creation (`createAndAddMemberAction`), and `addExistingUserAction` "retained for programmatic use only" — i.e., a documented dead path. Two user-facing paths may be justified (invite vs. create-with-password); the third is cruft.

5. **Select options live inside `validation_rules`.** The docs themselves flag this ("Consider a dedicated `options` column"). What values *exist* and what values are *valid* are different concepts folded into one jsonb; both `SelectInput` and `SelectRenderer` must know the burial site. Small, self-identified, worth doing eventually.

6. **Two photo-serving models coexist.** The stable session-authed route (`/api/photos/cards/[code]`) was introduced precisely because embedded 15-minute signed URLs break caching and expire in place — but only the feed uses it; card detail, lists, and `ActiveCardZone` still embed signed URLs. The ADR itself predicts "any surface that grows a long-lived open tab will hit the same expiry wall." A card detail page left open on a reception desk tablet is exactly that surface. Converge on the stable route for browser surfaces. (Confidence: High — the ADR documents the split and the trigger condition.)

7. **The word "action" means four things.** Server Actions (`src/lib/actions/` directory), ActionDefinitions (the domain concept), `action_logs` (which stores scans and lifecycle rows too — the name lies), and `actionHandler` (the response wrapper). The file `src/lib/actions/actions.ts` exists. The scan pipeline lives in `src/lib/actions/cards.ts`. None of this is wrong individually; together it is a real onboarding tax and almost certainly a product of incremental naming. (Opinion; renaming `action_logs` → `event_logs` is the highest-value, lowest-risk piece if a migration window ever opens.)

**Notable *non*-findings** — things that look like over-engineering but are justified: three pre-shipped brand palettes (~150 lines of CSS against a known rename event); Layer-3 density tokens (cheap, plausibly needed for turnstile operators); the `passbook` design kind with PNG-only export (pkpass deferral is explicitly ADR'd); the KPI strip reusing `getActionHistory` with `pageSize=1` instead of new queries (documented, pragmatic).

### 2.4 What is missing or under-specified at the architectural level?

1. **External API authentication design** — the `TODO: API_AUTH` has no target design beyond one sentence ("API key lookup where each key carries a pre-configured role"). Given it gates the fix for the P0 item, it deserves an ADR *now*, even before implementation.
2. **Concurrency model** — no doc anywhere discusses concurrent writes to the same card (see §2.1). Also unstated: what happens when two admins edit the same card's field values simultaneously (last-write-wins per field? whole-form?).
3. **Rate limiting / abuse** — three public, unauthenticated endpoints exist (invitation accept, departure feedback update, plus login), each with an ADR note saying "rate limiting can be added later." There is no consolidated statement of the public attack surface.
4. **Observability** — the purge job "logs a run summary to the server" is the only monitoring mentioned in the entire doc set. No error tracking, no alerting, no definition of what operational signals exist. For a system opening doors, "the cron silently stopped running" should be detectable.
5. **Backup / disaster recovery** — the system now performs irreversible hard deletes (manual + daily automated) and the docs never mention backups, Neon PITR, or how an accidental "Vaciar papelera" is recovered from. Even one paragraph ("we rely on Neon PITR with N-day window; purge recovery = restore branch") would materially change the risk of the purge feature.
6. **Testing strategy** — Vitest appears in the stack table, a state-machine matrix test and integration-test DB switching get one sentence each, but no doc says what is covered or what must be tested for a change to a given module. For an AI-built codebase this is the highest-leverage missing doc: agents will not maintain tests they don't know exist.
7. **Tenant data isolation defense-in-depth** — isolation rests entirely on the convention that every DAL function receives and applies `tenantId`. One forgotten `WHERE` is a cross-tenant leak. Postgres RLS (even in "belt and suspenders" mode with the app role setting `app.tenant_id`) is never discussed; it deserves at least a considered-and-rejected note.
8. **i18n position** — all strings are in constants "prepared for i18n," but every documented UI string is Spanish and no locale mechanism exists. Fine — but the target (Spanish-only product vs. future i18n) is nowhere stated, and it affects whether the constants discipline is buying anything.

---

## 3. What's correct

Specific decisions that are genuinely good and should be preserved (each with the reason it's good, not just praise):

1. **Operational scan vs. informational consultation as a hard, entry-path-level invariant** (ADR 2026-03-20). This is the single best domain decision in the system. It solved two real corruption bugs (feed noise, auto-actions firing on admin browsing), it is enforced structurally (different entry functions) rather than by a mode flag a human can leave in the wrong position, and the rejected alternatives (user toggle, role-based, log-and-filter) are all correctly rejected for stated reasons. The counterintuitive consequence (the "scan page" is informational) is documented everywhere it could confuse.

2. **Typed value columns instead of jsonb for field values.** The payoff is visible downstream: 14 comparison operators over dynamic fields in history and search, with sane SQL. Most EAV implementations get this wrong and pay forever.

3. **The single-statement CTE discipline for atomicity under Neon HTTP.** Rather than pretending transactions exist or silently accepting partial writes, the team identified "one statement = one implicit transaction" and built the lifecycle service, cascade archive, empty-trash, and cross-tenant purge on it. The purge's `DELETE`-with-join judging each row against its own tenant's retention window is exactly right.

4. **`resolveLifecycleGate` as one pure function reused by all five consumers** (operational pipeline, resume, manual execution, pre-check, external API). The rejected alternative — re-deriving the verdict in each consumer — is precisely how incremental codebases rot; this decision prevented it. The 4×2 decision matrix being unit-testable is a stated design goal, which is the right instinct.

5. **`getCardByCode` deliberately unfiltered, with archived denied explicitly by the gate.** Filtering at the DAL would have turned "denied — card is archived" (a red surface, a logged real-world event) into "not found" (a confusing lie). The docs defend this in three places, which is the right level of protection for a subtle invariant.

6. **`code` as the public card identifier, unique per `(tenant_id, code)`** — human-readable, tenant-scoped, printable on physical cards, and it keeps internal UUIDs out of URLs. (The constraint's *absolute* phrasing has drifted from reality — see §4.6 — but the design itself is correct.)

7. **The photo storage architecture end-to-end**: interface seam (R2/MinIO swap = config), presigned direct PUT (bypasses the 4.5 MB function limit, keeps bytes off functions), object keys in the DB with signing at render, tenant prefix as the security primitive, per-kind optimization profiles, and the stable-route evolution when signed-URL caching/expiry bit. The stable-route ADR's reasoning ("the URL is an identifier, not a capability") is exactly the right security framing.

8. **Auth-model separation of the `/api` trees** with an explicit rule ("one route tree, one auth model") and the cron endpoint's design (constant-time compare, fail-closed when the secret is unset, blast-radius analysis of a leaked secret). Small things done properly.

9. **The design-token system** — three OKLCH layers, reserved state semantics (granted/denied/warning/override/info) that may never be used decoratively, override (orange) made perceptually distinct from warning (amber) *because they have different audit consequences*, and color+icon+label everywhere. Tying visual distinctness to audit semantics is design-system thinking applied to a safety domain, and the decorative-palette escape valve (Phase 3 ADR) prevented the reservation from being eroded by convenience.

10. **The context-documentation system itself.** Foundation/modules/ADR/index structure with a deterministic update protocol, token-budget hygiene, and ADRs of genuinely high quality (real alternatives, real trade-offs, honest negatives — the no-polling ADR documenting its own drift risk, the archiving ADR documenting the lost RESTRICT safety net). Most human teams do not document this honestly. The drift found in §4 is real but modest relative to the volume.

11. **Sequential auto-actions with stop-on-failure and the audited override flow.** Safety-by-default, per-tenant relaxation, every override attributable. The rejected "best-effort" alternative is correctly identified as unsafe for a physical-access domain.

---

## 4. What's incorrect / should be corrected

Each item: problem → why it matters → risk if left → proposed direction.

### 4.1 Unauthenticated external API with mutation capability — **P0**

- **Problem**: `/api/cards/[code]` and `/api/cards/[code]/actions/[id]/execute` trust a client-supplied `x-tenant-id` header with no authentication (documented `TODO: API_AUTH` in `04-constraints.md` §2, `auth-tenants.md`, `infrastructure.md`).
- **Why it matters**: it bypasses the entire session/guard security model. The execute endpoint mutates field values (balances, booleans) — the system's core state.
- **Risk**: with real tenants, any party that obtains or guesses a tenant UUID (UUIDs leak — logs, browser devtools of any integrated device, the storage keys that client form state holds) can read cards and fire actions across tenants. Silent data corruption plus privacy breach.
- **Direction**: design the API-key model now (per-device key → tenant + role + allowed endpoints; hashed at rest; revocable), write the ADR, implement before any external device or tenant onboarding. If devices can't be updated immediately, put the tree behind network-level allowlisting as a stopgap and say so in the ADR.
- **Confidence**: High (docs are explicit). **Verify**: `src/lib/api/auth.ts` (~line 170), both route files.

### 4.2 Lost-update race in `executeAction` — **P0**

- **Problem**: read → compute → write with no concurrency control (documented sequence in `actions.md` and constraint #13; only crash-atomicity is ever discussed).
- **Why it matters**: concurrent scans of the same card (two operator stations, dashboard + external API) can silently lose an increment/decrement — in the exact "balance" use case the product is built around.
- **Risk**: rare and invisible at one scan station; increasingly likely with more entry points per tenant. Undetectable after the fact because the log records what each execution *thought* it did.
- **Direction**: for standard strategies, make the value change a single atomic SQL statement (`value_number = value_number + $delta ... RETURNING`) — fully compatible with the Neon HTTP driver's one-statement transactionality already exploited elsewhere. For custom strategies, an optimistic compare-and-set (`WHERE value_number = $read`) with one retry preserves the `handleAction(ctx)` contract.
- **Confidence**: Medium (docs-only; something undocumented may mitigate). **Verify**: `src/lib/dal/actions.ts` (`executeAction`), `src/lib/action-strategies/`.

### 4.3 The CASCADE flip removed the database backstop for the soft-delete invariant — **P1**

- **Problem**: to allow the single-statement purge, FKs on `field_definitions` / `action_definitions` were flipped from `RESTRICT` to `CASCADE` (migration 0017). Constraint #6 now carries its own ⚠️: a stray hard delete of a field definition silently destroys its `field_values`. Enforcement is DAL-only.
- **Why it matters**: "never hard-delete field definitions" is a *non-negotiable* constraint whose only enforcement is now convention — in a codebase built by AI agents, where conventions are exactly what erode.
- **Risk**: one bad migration, one ad-hoc `psql` cleanup, one future agent-written "cleanup script" silently cascades away tenant field data with no error.
- **Direction**: the phase-1 ADR itself notes `NO ACTION` (checked at end of statement, unlike `RESTRICT`) "would have preserved the safety net" and was rejected only "for explicitness." Revisit: `NO ACTION` + explicit child deletes inside the purge CTE keeps single-statement atomicity *and* the DB backstop. Alternatively, a `BEFORE DELETE` trigger that raises unless a session GUC (`app.purge = on`) is set.
- **Confidence**: High that the risk exists (ADR states it); Medium that `NO ACTION` works cleanly with the current purge SQL. **Verify**: migration 0017, `src/lib/server/lifecycle/purge.ts` SQL shape.

### 4.4 Dual source of truth for tenant membership; glossary contradicts the enforced model — **P1**

- **Problem**: `tenant_members` (m:n with roles) and `user.tenantId` (1:1, on the Better Auth table) both encode membership; four documented flows must keep them in sync; the glossary claims multi-tenancy per user while the flows enforce one-tenant-per-user.
- **Why it matters**: two writable representations of one fact is the classic incremental-build duplication this review was asked to hunt. Every future membership feature must remember both.
- **Risk**: desync (e.g., a failed step in invitation accept leaves `tenantId` set with no membership row, or vice versa — the bootstrap ADR already documents one such window) produces users locked out or ghost-authorized. The contradiction also misleads every future agent reading the glossary.
- **Direction**: decide the real model. If 1:1 is the product intent (all evidence says yes), state it as a constraint, fix the glossary, and make `user.tenantId` derived-or-checked (e.g., a DB trigger or a startup assertion that it matches the sole active membership). If m:n is the future, `tenant_members` must become the source of truth and the session tenant must be a selection, not a column.
- **Confidence**: Medium-High. **Verify**: `getCurrentTenant` in `src/lib/api/auth.ts`, schema of `user` table, sync sites in actions files.

### 4.5 `allow_override_on_error` lives in the wrong table; the move was never ADR'd — **P1**

- **Problem**: a server-side execution policy sits in `dashboard_settings`; the 2026-03-15 ADR says it's on `tenants`; no superseding ADR records the move; INDEX.md even has to carry a parenthetical warning ("setting lives in `dashboard_settings`") so agents don't look in the wrong place.
- **Why it matters**: placement communicates semantics. A policy that gates the external API and server-side action execution reading from a table named for feed display options is a misdirection that has already cost documentation overhead, and it forces the hot scan path to depend on the dashboard module's table.
- **Risk**: a future change to "dashboard settings" (e.g., making them operator-editable, or per-user) silently changes who can weaken an execution safety control.
- **Direction**: move the column to `tenants` (where `scan_mode`, `scan_strategy`, `archive_retention_days` already live), master-gated like its peers; write the small ADR; adopt a one-line placement rule: *execution policy on `tenants`, presentation preferences on `dashboard_settings`*.
- **Confidence**: High (docs are explicit and contradictory). Effort is one migration + call-site updates.

### 4.6 Constraint #3 ("card UUIDs never exposed to the client") is no longer true as written — **P1**

- **Problem**: the constraint is absolute, but documented flows contradict it: `executeActionAction({ cardId, ... })` takes a card id from the client; `PhotoInput` holds the object key `<tenantId>/cards/<card_uuid>/<random>.webp` in client form state (so the client sees both tenant and card UUIDs); the external API requires the tenant UUID in a header.
- **Why it matters**: constraints are the project's highest-authority document, explicitly positioned as overriding defaults. A constraint that is demonstrably false in three documented flows teaches agents (and humans) that constraints are aspirational — which erodes the ones that must hold absolutely (#9, #10).
- **Risk**: security reasoning built on "UUIDs are secret" (e.g., treating the `fid` / tenant-UUID entropy as an auth factor) is unsound if UUIDs circulate.
- **Direction**: re-scope the constraint to what is actually enforced and worth enforcing: *card URLs and external identity use `code`; UUIDs are never accepted as an alternative lookup key from the client; UUIDs appearing in payloads are not treated as secrets*. Then audit whether `executeActionAction` could take `code` instead of `cardId` for consistency.
- **Confidence**: Medium-High (three independent doc statements; the exact exposure needs code confirmation). **Verify**: `executeActionAction` signature, `PhotoInput`/`PhotoUploader` state, `/api/cards` response shapes.

### 4.7 Foundation docs have drifted below the project's own standard — **P1** (cheap, high leverage)

- **Problem** (all in the read-once-per-session layer, so every session inherits the errors):
  - `00-overview.md`: "Node.js v24 ONLY … use `/opt/homebrew/opt/node@20/bin/node`" — self-contradictory and stale (CLAUDE.md + infrastructure.md agree it's v24, note the v20 advice is stale). Also "Soft delete everywhere — `isActive = false`" predates the `lifecycle_status` model. The scope section omits card designs, photo storage, member management, and history — roughly half of the shipped product.
  - `02-conventions.md`: does not mention `src/lib/server/lifecycle/` at all, even though "transitions never happen via a plain DAL update" is now a core write-path rule; the DAL section still implies the DAL is the only write path.
  - `03-glossary.md` (untouched since 2026-04-19): "Users can belong to multiple tenants" (see 4.4); "ActionLog — `log_type` is `scan` or `action`" (missing `lifecycle`); no entries for lifecycle, archived/trash, purge, lifecycle gate, or action strategy — the last three months of domain vocabulary.
  - `04-constraints.md` #4: "Every Server Action starts with a role guard" — contradicted by three documented public actions (`acceptInvitationAction`, `submitDepartureFeedbackAction`, `checkOwnMembershipStatusAction`). Absolute rules need their exceptions listed or they stop being absolute.
  - Minor module drift: `getCommonFieldDefinitions` is placed in `field-definitions.ts` and `common-fields.ts` in the same file (`fields.md`), with two different signatures across `01-architecture.md` and the glossary; `dashboard.md` still calls `QuickCodeInput` "pre-Phase-2 styling — Phase 3 target" while the Phase-3 ADR claims the migration completed; `card-designs.md`'s header cites a 2026-06-07 feature its own Recent-changes list never records.
- **Direction**: one dedicated doc-sync pass over `foundation/` (the update protocol's rule "only touch foundation when fundamentals change" has been over-applied — fundamentals *did* change). Add the glossary terms; re-scope constraints #3 and #4; document `src/lib/server/` as a layer.
- **Confidence**: High — these are internal contradictions, verifiable without code.

### 4.8 The lifecycle audit trail is write-only and does not survive the record it audits — **P1** (product decision to confirm, not a bug)

- **Problem**: `log_type='lifecycle'` rows are written atomically with every card transition — and then deliberately hidden from the feed, `/history`, and strategies ("surfacing lifecycle entries is a later phase"), and deleted by CASCADE when the card is purged. The purge itself leaves only an ephemeral server-console summary.
- **Why it matters**: as shipped, the system pays the cost of an audit (N rows per cascade archive) that no one can read, and after a purge a tenant cannot answer "what was deleted, when, by which policy" at all. For an access-control product, "we deleted records and kept no record of it" is a compliance-shaped hole even though it was an explicit user decision.
- **Risk**: a dispute ("my card vanished") after retention elapses is unanswerable; a buggy purge is indistinguishable from a correct one.
- **Direction**: two small moves, either or both: (a) surface lifecycle rows in `/history` behind a filter (the "later phase" that never got scheduled); (b) persist the purge run summary (per-tenant counts + cutoff date) to a small `purge_runs` table instead of only stdout — it survives because it references no cards.
- **Confidence**: High on the facts (all documented); the *decision* to change is the owner's.

### 4.9 Public endpoints with no rate limiting and PII retained after account deletion — **P2**

- **Problem**: `submitDepartureFeedbackAction` is fully public (UUID entropy is the only guard, per its ADR); the invitation accept route is public by design; `departure_feedback` stores name/email of deleted users indefinitely with no retention policy — immediately after the user exercised deletion.
- **Why it matters / risk**: spam/abuse on the public endpoints at scale; the PII retention undercuts the deletion story if a data-subject request ever arrives (GDPR-adjacent, depending on jurisdiction of the communities).
- **Direction**: add basic rate limiting when any real tenant onboards (Vercel WAF or a tiny token-bucket on the three public paths); add a retention window to `departure_feedback` (e.g., the purge cron deletes rows older than N months) and note the lawful-basis stance in an ADR.

### 4.10 `tenants.scan_strategy` is misnamed — **P2**

- **Problem**: the column selects an *action execution* strategy (`TenantActionStrategy`, resolved inside `executeAction`) but is named `scan_strategy`, adjacent to the genuinely scan-related `scan_mode`.
- **Why it matters**: two similarly-named tenant columns where one configures input hardware and the other swaps execution logic is a misread waiting to happen — particularly for AI agents doing keyword-matched context loading (the INDEX routes "scan" keywords to the scanning module, which has nothing to do with this column).
- **Direction**: rename to `action_strategy` in the next migration window; until then, add a one-liner to `03-glossary.md` disambiguating the pair.

### 4.11 Consolidation opportunities (from §2.3, gathered) — **P2**

- Converge photo serving on the stable route for all browser surfaces (4.6 of §2.3).
- Extract the operational scan pipeline into a named module (`src/lib/server/scan-pipeline/` fits the precedent set by `lifecycle/`) and let cards/actions/scanning/dashboard docs point at *it* (leak #1 in §2.2).
- Move select options out of `validation_rules` (self-identified in `fields.md`).
- Delete `addExistingUserAction` if truly unused; drop `expired` if the owner agrees (it is their recorded call).
- Verify `InvitationActionStrategy` is implemented or remove the seam's dead weight (needs code check first).

---

## 5. Prioritized action list

| Priority | Area (module) | Problem (one line) | Recommended action | Effort | Confidence |
|---|---|---|---|---|---|
| **P0** | auth-tenants / infrastructure | External API trusts unauthenticated `x-tenant-id`; execute endpoint mutates state | Design + ADR the API-key model now; implement before onboarding tenants/devices; network allowlist as stopgap | M | High |
| **P0** | actions | `executeAction` read→compute→write loses concurrent updates (balances) | Atomic single-statement SQL update for standard strategies; optimistic CAS for custom; verify in code first | S–M | Med |
| **P1** | infrastructure / foundation | Foundation docs contradict reality (Node note, soft-delete model, glossary, constraints #3/#4, missing lifecycle layer & terms) | One doc-sync pass over `foundation/`; re-scope constraints #3/#4; add glossary terms; document `src/lib/server/` | S | High |
| **P1** | auth-tenants / dashboard | `allow_override_on_error` (execution policy) lives in `dashboard_settings`; move from `tenants` never ADR'd | Migrate column to `tenants`; small ADR; adopt placement rule: policy→`tenants`, presentation→`dashboard_settings` | S–M | High |
| **P1** | infrastructure / fields | CASCADE FKs removed the DB backstop for "never hard-delete field_definitions" | Revisit `NO ACTION` + explicit child deletes in purge CTE, or a guard trigger with a purge GUC | M | Med |
| **P1** | auth-tenants | Membership encoded twice (`tenant_members` + `user.tenantId`); glossary claims m:n, flows enforce 1:1 | Decide the model; make one representation authoritative; fix glossary; add a consistency check | M | Med-High |
| **P1** | history / cards / infrastructure | Lifecycle audit rows are invisible everywhere and die with the purged card; purge leaves no durable trace | Surface lifecycle rows in `/history` (filter) and/or persist purge summaries to a `purge_runs` table | M | High |
| **P1** | auth-tenants | Public endpoints (invitation accept, departure feedback) have no rate limiting | Basic rate limiting before real-tenant onboarding | S | High |
| **P2** | actions / auth-tenants | `tenants.scan_strategy` names an *action* strategy; confusable with `scan_mode` | Rename to `action_strategy` at next migration window; glossary note meanwhile | S | High |
| **P2** | actions | `InvitationActionStrategy` documented as a no-op stub vs. commit message claiming implementation | Verify in code; implement or remove; update ADR/module either way | S | Low |
| **P2** | auth-tenants | `departure_feedback` keeps deleted users' PII indefinitely | Add a retention sweep (reuse cron pattern); record the stance in an ADR | S | High |
| **P2** | fields | Select options buried in `validation_rules` jsonb (conflates "exists" with "valid") | Dedicated `options` jsonb column; already self-identified in `fields.md` | S | High |
| **P2** | auth-tenants | Three member-onboarding paths; `addExistingUserAction` retained but unused | Delete the dead path if code confirms it's unused | S | Med |
| **P2** | dashboard / infrastructure | Two photo-serving models; signed-URL surfaces will hit the documented expiry wall | Converge browser surfaces on `/api/photos/cards/[code]` | S–M | High |
| **P2** | cards / actions / scanning / dashboard | Operational scan pipeline lives in `lib/actions/cards.ts` with four-way documented ownership | Extract to a named service (e.g. `src/lib/server/scan-pipeline/`); repoint module docs | M | Med |
| **P2** | dashboard | Client-side feed mirror (`feed-entries.ts`) duplicates server logging rules (ADR-acknowledged drift risk) | Keep, but add the documented `MAX(executed_at)` change-detection fallback when multi-dashboard tenants appear; add a contract test between mirror and pipeline | S | High |
| **P2** | cards / card-types | `expired` is a dead enum value special-cased by every consumer (owner's recorded choice) | Recommend dropping until auto-expiry is designed; owner's call | S | High (facts) / Opinion (action) |
| **P2** | observability / infrastructure | No monitoring, alerting, backup/DR, or testing-strategy documentation | Short ops doc: purge-job alerting, Neon PITR stance, error tracking, per-module test expectations | M | High |

---

## Appendix A — Code-verification worklist for the follow-up pass

Findings whose confidence is not High, with the files to read:

| Finding | Files to inspect |
|---|---|
| 4.2 lost-update race | `src/lib/dal/actions.ts` (`executeAction`), `src/lib/action-strategies/*` |
| 4.1 exposure scope of external API | `src/lib/api/auth.ts` (~L170), `src/app/api/cards/[code]/route.ts`, `.../execute/route.ts` |
| 4.4 membership duality | `src/lib/api/auth.ts` (`getCurrentTenant`), `src/lib/db/schema/auth.ts`, `src/lib/actions/{tenants,members,invitations}.ts` |
| 4.6 UUID exposure reality | `src/lib/actions/actions.ts` (`executeActionAction` input), `src/components/shared/PhotoUploader.tsx`, `/api/cards` response shape |
| 4.3 NO ACTION feasibility | `drizzle/0017_*.sql`, `src/lib/server/lifecycle/purge.ts` |
| 2.3-3 strategy stub vs. implemented | `src/lib/action-strategies/*` (commit ecf00d0 claims implementation; ADR says stub) |
| 2.2-1 pipeline entanglement severity | `src/lib/actions/cards.ts` |
| 4.7 QuickCodeInput migration state | `src/app/(dashboard)/dashboard/QuickCodeInput.tsx` |
| addExistingUserAction dead-path check | grep call sites of `addExistingUserAction` |

## Appendix B — Documentation contradictions found (for the doc-sync pass)

1. `00-overview.md` Node note vs. CLAUDE.md + `infrastructure.md` (v20 advice inside a "v24 ONLY" bullet).
2. `00-overview.md` "soft delete = `isActive = false`" vs. the `lifecycle_status` model in `01-architecture.md` §1b / constraint #6.
3. `03-glossary.md` "users can belong to multiple tenants" vs. one-tenant-per-user invariants in `auth-tenants.md`.
4. `03-glossary.md` ActionLog `log_type: scan | action` vs. the three-value enum.
5. ADR 2026-03-15 "`allow_override_on_error` stored on `tenants`" vs. `dashboard_settings` everywhere current; no superseding ADR.
6. Constraint #4 "every Server Action starts with a role guard" vs. three documented public actions.
7. Constraint #3 "UUIDs never exposed" vs. `executeActionAction(cardId)`, client-held object keys, `x-tenant-id`.
8. `fields.md` places `getCommonFieldDefinitions` in two different files; signature differs between `01-architecture.md` and `03-glossary.md`.
9. `dashboard.md` QuickCodeInput "Phase 3 target" vs. Phase-3 ADR claiming the migration of all target surfaces.
10. `card-designs.md` header cites a 2026-06-07 feature absent from its own Recent changes (update-protocol step 2 violation).

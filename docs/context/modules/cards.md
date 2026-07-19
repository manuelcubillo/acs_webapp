# Module: cards

**Last updated**: 2026-07-17 · **Last feature**: archived (trash) view + hard-delete/empty-trash (phase 4)

## Responsibility

Card lifecycle: creation, editing, viewing, searching, and the multiple UI representations (list, table, profile). Rendering dynamic fields on Cards. Does **not** own field-definition logic (see `fields`) or action execution (see `actions`).

## Key files

- `src/app/(dashboard)/cards/page.tsx` — Card list + search (OPERATOR+). Uses searchParams `?cardTypeId&q&status`; also reads `?flash` to show a `FlashMessage` after a lifecycle redirect.
- `src/app/(dashboard)/cards/new/page.tsx` — Create shell (ADMIN+). Requires `?cardTypeId`.
- `src/app/(dashboard)/cards/new/CardNewClient.tsx` — `CardForm` in create mode.
- `src/app/(dashboard)/cards/[code]/page.tsx` — Detail view (OPERATOR+). Always informational. Renders `CardDetailClient`.
- `src/components/cards/CardDetailClient.tsx` — Client component managing card state, scan-result state, and action execution on the detail page. Mounts `CardActions` + `ScanAlerts`.
- `src/app/(dashboard)/cards/[code]/edit/page.tsx` — Edit shell (ADMIN+). Renders `CardEditClient` (field values) + `CardLifecycleControls` (status).
- `src/app/(dashboard)/cards/[code]/edit/CardEditClient.tsx` — `CardForm` in edit mode.
- `src/components/cards/CardLifecycleControls.tsx` — Activate / deactivate / archive a card (phase 3, ADMIN). Single action in flight, archive confirmed via `ConfirmDialog`, then redirects to `/cards?flash=card-archived`.
- `src/components/cards/CardForm.tsx` — Uses `useCardForm`, renders `DynamicFieldInput` per field.
- `src/components/cards/CardList.tsx` — Tabs: list / table / profile. Owns the client search state incl. the `statusFilter` (all/active/inactive).
- `src/components/cards/CardStatusFilter.tsx` — Segmented status filter (Todos / Activos / Inactivos), mirrors `CardViewToggle`. `Inactivos` groups inactive + expired.
- `src/components/shared/ConfirmDialog.tsx` — Reusable confirmation modal on the `Dialog` primitive (`tone: default | destructive`). Used by the lifecycle controls and by trash restores.
- `src/components/shared/ConfirmPhraseDialog.tsx` — Typed-phrase confirmation on `Dialog` (generalized from `DeleteTenantAccountModal`) for irreversible hard-deletes in the trash view. ADR `2026-07-17-card-lifecycle-trash-view.md`.
- `src/components/shared/FlashMessage.tsx` — One-shot `?flash=` confirmation banner on the `Alert` primitive; strips the param via `history.replaceState` and auto-dismisses. ADR `2026-07-17-card-lifecycle-edit-controls.md`.
- `src/app/(dashboard)/archived/page.tsx` — Trash view (ADMIN+; operator redirected). Loads `listArchivedCards` + `listArchivedCardTypes`, computes the purge countdown, renders `ArchivedClient`.
- `src/app/(dashboard)/archived/ArchivedClient.tsx` — Two-tab trash UI (types / cards). Restore (cards admin+master, types master), permanent delete + "Vaciar papelera" (master, typed phrase). Neutral chrome only.
- `src/lib/server/lifecycle/purge.ts` — Hard-delete primitive (phase 4): `hardDeleteArchivedCard` / `hardDeleteArchivedCardType` / `hardDeleteAllArchived`. Single-statement `DELETE` scoped to tenant + `status='archived'`, relying on the migration-0017 CASCADE chain. No purge audit (logs cascade away). ADR `2026-07-17-card-lifecycle-trash-view.md`.
- `src/components/cards/CardTableView.tsx` — Table + `useCardColumns` + `CardColumnSelector`.
- `src/components/cards/CardProfileView.tsx` — Single-card detail view.
- `src/components/cards/CardSearch.tsx` — Search + filter interface.
- `src/components/cards/CardViewToggle.tsx` — Toggle between list / table / profile.
- `src/components/cards/CardColumnSelector.tsx` — Column visibility picker (localStorage via `useCardColumns`).
- `src/components/cards/ScanAlerts.tsx` — Displays `ScanValidationResult` entries.
- `src/hooks/useCardForm.ts` — Field values + `validateCard` + per-field error clearing.
- `src/hooks/useCardColumns.ts` — localStorage-persisted column visibility.
- `src/lib/dal/cards.ts` — `getCardByCode`, `getCardById`, `getCardLifecycleStatus` (light status-only lookup for the action gate), `countLiveCardsForCardType` (non-archived count for the archive cascade warning), `listArchivedCards` (trash listing: only archived, joins the archiver's name), `searchCards` (accepts a `status` filter: all/active/inactive), create/update.
- `src/lib/dal/scopes.ts` — `notArchived` / `onlyArchived` / `archivedViaType` reusable Drizzle scopes.
- `src/lib/server/lifecycle/` — lifecycle service: `state-machine.ts` (pure rules), `scan-gate.ts` (pure `resolveLifecycleGate` + `buildLifecycleScanCheck`), `cards.ts`, `card-types.ts`, `retention.ts`.
- `src/lib/actions/lifecycle.ts` — Server Actions: `activate/deactivate/archive/restoreCardAction` (ADMIN), `…CardTypeAction` (MASTER), and the phase-4 hard-delete: `purgeArchivedCardNowAction` / `purgeArchivedCardTypeNowAction` / `emptyTrashAction` (MASTER).
- `src/lib/actions/cards.ts` — Server Actions: `getCardByCodeAction` (informational lookup), `executeScanWithAutoActionsAction` (operational scan + auto-actions), `resumeAutoActionsAction` (override continuation), `validateBeforeActionAction`, `createCardAction`, `updateCardAction`, `updateCardCodeAction`, `deleteCardAction`, `listCardsAction`, `searchCardsAction`.
- `src/app/api/cards/[code]/route.ts` — External GET by code (uses `x-tenant-id`).

## Data model (relevant subset)

- `cards(id, code, card_type_id, tenant_id, status, archived_at, archived_by, status_before_archive, archived_via_type_id, timestamps)` — unique `(tenant_id, code)`.
- `field_values(id, card_id, field_definition_id, value_text, value_number, value_boolean, value_date, value_json, timestamps)`.

Primary lookup: `code + tenantId`. UUID is internal only.

`status` is `lifecycle_status` (`active | inactive | archived | expired`). `expired` is reserved for a future auto-expiry mechanism — nothing sets it, and the lifecycle service treats it exactly like `inactive`. Trash columns are non-null only when `status = 'archived'` (DB CHECK). See `foundation/01-architecture.md §1b`.

## Main flows

### Create

1. `/cards/new?cardTypeId=...` → server component fetches `getCardTypeWithFullSchema`.
2. `CardForm` renders `DynamicFieldInput` for each field definition.
3. Submit → Server Action validates + creates `card` + writes `field_values`.

### Edit

1. Same loader pattern, pre-fills form values via `extractValue(fieldType, row)` per field.
2. Submit writes the diff (insert / update per field value).

### Design preview (card detail)

If the card's card type has a linked `card` design, the detail page shows a "Ver diseño" button (`CardDesignPreviewButton`). Clicking opens `CardDesignPreviewModal` which calls `renderDesignToDataURL()` (Canvas API) with the card's live field values and offers a "Descargar PNG" download. No extra server fetch is needed; field values are serialised by the server component.

### Card detail (always informational)

**Canonical invariant** (verbatim from `src/app/(dashboard)/cards/[code]/page.tsx` JSDoc):
> *"This page does NOT log a scan entry or run auto-actions."*

The server component fetches the card + actions + scan validations and passes them to `CardDetailClient`. `CardDetailClient` manages state (card refresh after each manual action, scan-result re-evaluation). `CardActions` hides `is_auto_execute` actions (those only run on operational scans).

### Search

`searchCardsAction` supports multi-card-type search with a `codeContains` partial match **and** field-level filters (same 14 operators as the history feature: `contains`, `starts_with`, `equals_text`, `eq`, `gt`, `lt`, `gte`, `lte`, `between`, `is_true`, `is_false`, `date_eq`, `date_before`, `date_after`, `date_between`) **and** a lifecycle `status` filter (phase 3: `all` | `active` | `inactive`, where `inactive` groups inactive + expired). `archived` is never selectable — the `notArchived` scope always applies. `CardList` keeps `statusFilter` as client state (initial value from `?status=`, reflected back via `history.replaceState`).

### Lifecycle (phases 1–2 of 5)

`listCards` / `searchCards` exclude `archived` via the `notArchived` scope; `inactive` and `expired` stay visible. Transitions go through `src/lib/server/lifecycle/cards.ts` — never a direct `db.update(cards).set({ status })`. Each writes a `log_type = 'lifecycle'` audit row in the same CTE.

⚠️ `getCardByCode` is deliberately **unfiltered**: the scan path, the card detail page and the external device API all share it. Archived cards are denied **explicitly** by the phase-2 gate (red, no override), never by a filter here.

### Lifecycle scan gate (phase 2 of 5)

`resolveLifecycleGate(status, allowOverrideOnError)` (`src/lib/server/lifecycle/scan-gate.ts`) is the single verdict for scanning/acting on a card: `allowed` (active) · `requires_override` / `blocked` (inactive/expired, per the tenant flag) · `denied_archived`. It is reused by `executeScanWithAutoActionsAction`, `resumeAutoActionsAction`, `validateBeforeActionAction`, the manual `executeActionAction` (`modules/actions.md`), and the external API. `inactive`/`expired` surface as a synthetic error-level scan check (`buildLifecycleScanCheck`) prepended to `validateScan`, so the existing pause/block/override path handles them; `archived` is a hard denial. The result carries `lifecycleGate` on `ScanWithAutoActionsResult` / `ValidateBeforeActionResult`. The scan is still logged for an archived card (constraint #10). See ADR `2026-07-17-card-lifecycle-scan-behaviour.md`.

### Trash view + hard delete (phase 4 of 5)

`/archived` (ADMIN+; operator redirected) lists archived types and cards via `listArchivedCardTypes` / `listArchivedCards` (`onlyArchived` scope + a LEFT join to `user` for the archiver's name). The page computes each row's purge date on the server with `getEffectiveRetentionDays` + `computePurgeDueAt` / `daysUntilPurge`, keeping the DAL free of a lifecycle dependency.

Restore reuses `restoreCardAction` (admin+master) / `restoreCardTypeAction` (master); a card carrying `archivedViaType` can only be restored via its type (the service blocks the individual restore), so its button is disabled.

**Hard delete** is the project's only physical delete. `src/lib/server/lifecycle/purge.ts` runs a single `DELETE … WHERE id=? AND tenant_id=? AND status='archived'`; the migration-0017 CASCADE chain removes the whole subtree atomically (Neon HTTP has no interactive transactions). No audit row is written — the card's `action_logs` cascade away with it. Master-only actions: `purgeArchivedCardNowAction`, `purgeArchivedCardTypeNowAction`, `emptyTrashAction` (the last runs one CTE that deletes archived types + their cascade + remaining individually-archived cards, kept disjoint via `card_type_id NOT IN del_types`). Every hard delete is gated by a typed phrase (`ConfirmPhraseDialog`). See ADR `2026-07-17-card-lifecycle-trash-view.md`.

## Extension points

- **New Card view (e.g. kanban)** → add component under `src/components/cards/`, wire into `CardViewToggle`, add a tab in `CardList`.
- **New searchable dimension** → extend `searchCards` params + UI in `CardSearch`. If the dimension is shared across card types, use `getCommonFieldDefinitions` from `fields`.
- **New Card-level status or workflow** → extend the `lifecycle_status` enum, teach `src/lib/server/lifecycle/state-machine.ts` the new transitions (its matrix test will fail until you do), update DAL scopes and UI states.

## Module interactions

- Reads from: `card-types` (schema), `fields` (definitions + rendering), `validations` (scan validation results), `actions` (available actions for a card), `card-designs` (linked design for preview).
- Writes to: `cards`, `field_values`.
- Owns `executeScanWithAutoActionsAction` and `resumeAutoActionsAction` — the operational scan pipeline. Cross-referenced by `actions` (auto-action execution), `scanning` (input surface), `dashboard` (result display).

## Open TODOs

- [ ] None specific (no tagged `TODO:` comments in source as of sync date).

## Recent changes

- 2026-07-17 — Archived (trash) view + hard delete, phase 4 of 5. New `/archived` page (ADMIN+) with two tabs listing archived types/cards (`listArchivedCards` / `listArchivedCardTypes`), the purge countdown, restore (cards admin+master, types master) and permanent delete + "Vaciar papelera" (master, typed phrase). New hard-delete primitive `src/lib/server/lifecycle/purge.ts` (single-statement CASCADE delete, the project's only physical delete; no purge audit) and master actions `purgeArchivedCard/CardTypeNowAction` + `emptyTrashAction`. New shared `ConfirmPhraseDialog`; nav item added to `DashboardShell`. ADR `2026-07-17-card-lifecycle-trash-view.md`.
- 2026-07-17 — Card lifecycle edit controls + search status filter, phase 3 of 5. `CardLifecycleControls` (activate/deactivate/archive) on the card edit page; `searchCards`/`searchCardsAction` gain a `status` filter (all/active/inactive, `inactive` = inactive+expired, archived never shown) surfaced by `CardStatusFilter` in `CardList`; new `countLiveCardsForCardType` DAL helper; new shared `ConfirmDialog` + `FlashMessage`. Archive redirects with `?flash=`. ADR `2026-07-17-card-lifecycle-edit-controls.md`.
- 2026-07-17 — Card lifecycle scan/action behaviour, phase 2 of 5. New pure gate `resolveLifecycleGate` + `buildLifecycleScanCheck` (`src/lib/server/lifecycle/scan-gate.ts`), reused by the operational pipeline, resume, manual `executeActionAction` and the external API. `inactive`/`expired` ride the existing override machinery via a synthetic scan check; `archived` is a hard denial (still logs the scan). Added `getCardLifecycleStatus` (light lookup) and `lifecycleGate` on the scan/pre-check result types. Detail page shows a neutral `CardStatusBadge`. ADR `2026-07-17-card-lifecycle-scan-behaviour.md`.
- 2026-07-17 — Card lifecycle + archiving, phase 1 of 5. `cards.status` migrated from `card_status` to the shared `lifecycle_status` enum (`suspended` retired → `inactive`; `expired` kept, behaves as `inactive`); added trash metadata (`archived_at`, `archived_by`, `status_before_archive`, `archived_via_type_id`). New lifecycle service + `notArchived` scope applied to `listCards`/`searchCards`. `deleteCard` removed from the DAL (it wrote `status` directly, bypassing audit); `deleteCardAction` is deprecated and now delegates to the service. Scan path untouched by design. ADR `2026-07-17-card-lifecycle-archiving.md`.
- 2026-07-16 — `executeScanWithAutoActionsAction` / `resumeAutoActionsAction` now sign the returned card's photo fields (`signCardPhotos`, via helper `signScanResultPhotos`) so the dashboard's `ActiveCardZone` can render photo thumbnails. Signing runs after `actionHandler`, degrades silently on failure, and never touches validation. See `modules/dashboard.md`.

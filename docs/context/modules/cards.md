# Module: cards

**Last updated**: 2026-08-02 · **Last feature**: card list view state moved into the URL; opening a card — and editing it — comes back to the same filters, view, page and scroll offset

## Responsibility

Card lifecycle: creation, editing, viewing, searching, and the multiple UI representations (list, table, profile). Rendering dynamic fields on Cards. Does **not** own field-definition logic (see `fields`) or action execution (see `actions`).

## Key files

- `src/app/(dashboard)/cards/page.tsx` — Card list + search (OPERATOR+). Reads the whole view state from `searchParams` and server-renders **that** result set; also reads `?flash` to show a `FlashMessage` after a lifecycle redirect.
- `src/lib/cards/list-params.ts` — View state ↔ query string: `parseCardListParams`, `buildCardListQuery`, `sanitizeCardListQuery` (the whitelist for the `cq` return blob), `CARD_LIST_PAGE_SIZE` + `toPagination` (shared by server page and client list). Dependency-free.
- `src/lib/cards/return-origin.ts` — Both directions of the origin params: `cardDetailHref(code, origin, viewQuery)` for the lists, `resolveCardOrigin({ from, cq, hq })` for the detail and edit pages. Owns `from` / `cq` / `hq` so a rename cannot half-happen.
- `src/lib/cards/scroll-restore.ts` — `rememberCardListScroll` / `consumeCardListScroll`. One-shot `sessionStorage` offset keyed by the query it was taken under.
- `src/lib/navigation/query-codec.ts` — Defensive readers for URL state (`readParam`, `parseUuidList`, `parsePage`, `parseFieldFilters`), shared with `history`.
- `src/lib/navigation/return-scroll.ts` — `createScrollMemory` (the one-shot keyed store) plus `PAGE_SCROLL_SLOT` / `readPageScroll` / `restorePageScroll`. `DashboardShell` scrolls an inner `<main>`, so page offsets never come from `window.scrollY`.
- `src/app/(dashboard)/cards/new/page.tsx` — Create shell (ADMIN+). Requires `?cardTypeId`.
- `src/app/(dashboard)/cards/new/CardNewClient.tsx` — `CardForm` in create mode.
- `src/app/(dashboard)/cards/[code]/page.tsx` — Detail view (OPERATOR+). Always informational. Renders `CardDetailClient`. `?from=` selects the back link — `cards` | `archived` | `history` | (default) the dashboard — and `?cq=` / `?hq=` carry the list view to return to. Resolved by `resolveCardOrigin`, which re-validates both blobs, so the href can only ever be that list with known parameters. The origin is forwarded to the Edit link. ADRs `2026-08-02-history-url-state-and-return.md`, `2026-08-02-card-list-url-state-and-return.md`.
- `src/components/cards/CardDetailClient.tsx` — Client component managing card state, scan-result state, and action execution on the detail page. Mounts `CardActions` + `ScanAlerts`.
- `src/app/(dashboard)/cards/[code]/edit/page.tsx` — Edit shell (ADMIN+). Renders `CardEditClient` (field values) + `CardLifecycleControls` (status). Re-reads the origin params and hands both children where to go, so leaving the editor keeps the detail's back link intact.
- `src/app/(dashboard)/cards/[code]/edit/CardEditClient.tsx` — `CardForm` in edit mode. Save and cancel both go to `returnHref` (the detail, origin included).
- `src/components/cards/CardLifecycleControls.tsx` — Activate / deactivate / archive a card (phase 3, ADMIN). Single action in flight, archive confirmed via `ConfirmDialog`, then redirects to the operator's filtered list (`listQuery` + `flash=card-archived`).
- `src/components/cards/CardForm.tsx` — Uses `useCardForm`, renders `DynamicFieldInput` per field.
- `src/components/cards/CardList.tsx` — Tabs: list / table / profile. Holds the view as one `CardListViewState`; every control goes through `commit`, which renders, publishes to the URL and refetches together.
- `src/components/cards/CardStatusFilter.tsx` — Segmented status filter (Todos / Activos / Inactivos), mirrors `CardViewToggle`. `Inactivos` groups inactive + expired.
- `src/components/shared/ConfirmDialog.tsx` — Reusable confirmation modal on the `Dialog` primitive (`tone: default | destructive`). Used by the lifecycle controls and by trash restores.
- `src/components/shared/ConfirmPhraseDialog.tsx` — Typed-phrase confirmation on `Dialog` (generalized from `DeleteTenantAccountModal`) for irreversible hard-deletes in the trash view. ADR `2026-07-17-card-lifecycle-trash-view.md`.
- `src/components/shared/FlashMessage.tsx` — One-shot `?flash=` confirmation banner on the `Alert` primitive; strips the param via `history.replaceState` and auto-dismisses. ADR `2026-07-17-card-lifecycle-edit-controls.md`.
- `src/app/(dashboard)/archived/page.tsx` — Trash view (ADMIN+; operator redirected). Loads `listArchivedCards` + `listArchivedCardTypes`, computes the purge countdown, renders `ArchivedClient`.
- `src/app/(dashboard)/archived/ArchivedClient.tsx` — Two-tab trash UI (types / cards). Restore (cards admin+master, types master), permanent delete + "Vaciar papelera" (master, typed phrase). Neutral chrome only.
- `src/lib/server/lifecycle/purge.ts` — Hard-delete primitive (phase 4): `hardDeleteArchivedCard` / `hardDeleteArchivedCardType` / `hardDeleteAllArchived`. Single-statement `DELETE` scoped to tenant + `status='archived'`, relying on the migration-0017 CASCADE chain. No purge audit (logs cascade away). ADR `2026-07-17-card-lifecycle-trash-view.md`.
- `src/components/cards/CardTableView.tsx` — Table + `useCardColumns` + `CardColumnSelector`. Passes `card.code` + the card's own `fieldDefinitionId` to each renderer (see "Photo rendering in lists").
- `src/components/cards/CardProfileView.tsx` — Single-card detail view. Same code + field-id threading as the table.
- `src/components/cards/CardSearch.tsx` — Search + filter interface.
- `src/components/shared/FieldFilterBuilder.tsx` — Field-level filter rows (field / operator / value), shared with `history`. A `select` field's value input is a dropdown populated by `getSelectOptions` (see `modules/fields.md` → "Select options"); every other type gets a typed `Input`.
- `src/components/cards/CardViewToggle.tsx` — Toggle between list / table / profile.
- `src/components/cards/CardColumnSelector.tsx` — Column visibility picker (localStorage via `useCardColumns`).
- `src/components/cards/ScanAlerts.tsx` — Displays `ScanValidationResult` entries.
- `src/hooks/useCardForm.ts` — Field values + `validateCard` + per-field error clearing.
- `src/hooks/useCardColumns.ts` — localStorage-persisted column visibility. Reads storage in an effect **after** mount, never in the `useState` initializer (see "Column visibility and hydration").
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

`searchCardsAction` supports multi-card-type search with a `codeContains` partial match **and** field-level filters (same 14 operators as the history feature: `contains`, `starts_with`, `equals_text`, `eq`, `gt`, `lt`, `gte`, `lte`, `between`, `is_true`, `is_false`, `date_eq`, `date_before`, `date_after`, `date_between`) **and** a lifecycle `status` filter (phase 3: `all` | `active` | `inactive`, where `inactive` groups inactive + expired). `archived` is never selectable — the `notArchived` scope always applies.

### View state in the URL

The card types, search, status, field filters, view mode and page live in the
query string — `ct` (comma-separated), `q`, `status`, `ff` (JSON), `view`,
`page` — so a filtered list is shareable, survives a reload, and can be handed
to another page and rebuilt. The server page parses them and renders the
requested result set directly; `CardList` seeds its state from the same values
and publishes every change with `history.replaceState` (no router navigation —
the rows on screen were just fetched). `parseCardListParams` is deliberately
lenient: it reads a URL, so an unusable value drops out instead of throwing at
the Zod boundary and leaving an unexplained empty list. The pre-existing
`?cardTypeId=` deep link still works when `ct` is absent. **A new filter
dimension must be added to both the query keys and `SearchCardsSchema`, or it
stops surviving navigation.** ADR `2026-08-02-card-list-url-state-and-return.md`.

### Row → card detail → (edit) → back

1. A row (table) or card (gallery) navigates to
   `/cards/[code]?from=cards&cq=<current list query>`, and stores the page
   scroll offset under that same query.
2. The detail page's back link is rebuilt by `resolveCardOrigin`, which
   re-validates `cq` through `sanitizeCardListQuery` — a parse-then-build round
   trip, so the href can only ever be a card list query.
3. The Edit link carries the origin onward; saving or cancelling returns to the
   detail with it, so the back link still works. Archiving instead redirects to
   the list itself (`cq` + `flash=card-archived`) — the card is gone from it.
4. On return, `CardList` consumes the stored offset once, and only if the query
   still matches — re-filter before coming back and it opens at the top.

⚠️ The offset is **not** `window.scrollY`: `DashboardShell` scrolls an inner
`<main data-slot="page-scroll">`, so the window offset is permanently 0. Nor is
one assignment enough — the App Router resets the scroll after the navigation
commits. Both are handled by `readPageScroll` / `restorePageScroll`.

### Photo rendering in lists

List surfaces do **not** receive a photo URL. `PhotoRenderer` builds the
`<img src>` itself from `cardPhotoRoute(code, { fieldDefinitionId })`, so the
address is derived from data every response already carries and survives every
client-side refetch. Consequently the three list producers (`/cards/page.tsx`,
`searchCardsAction`, `listCardsAction`) run `stripCardListPhotoKeys` instead of
signing: each photo value — and its `raw.value_text` — becomes a boolean
presence flag, and object keys never reach the browser.

Both views must pass **the card's own** `fieldDefinitionId`, not the display
column id: `mergeFieldColumns` collapses same-name fields across card types, so
the column id belongs to one representative type only and every other card would
404. Both build a `fieldIdMap` alongside `valueMap` for this.

Before 2026-08-02 the page signed keys server-side while the search action did
not, so photos rendered on load and broke on the first filter change. See ADR
`2026-08-02-card-list-photos-stable-route.md`.

List thumbnails are **static** — both views pass `enlargeable={false}`. The row
owns the click and navigates to the card detail; a lightbox here swallowed it,
so the photo advertised "Ampliar foto" and then never enlarged. Consequence: the
**Descargar** button lives in the lightbox, so it is card-detail-only. Thumbnails
are also `loading="lazy"`, because each one costs a photo-route round trip
(session check + `getCardByCode` + signature) and a 50-row page was firing 50 of
them to paint ~4 visible rows. See `modules/fields.md` → "Photo display".

### Column visibility and hydration

`useCardColumns` persists the table's visible columns to
`localStorage["columns_<cardTypeId|all>"]`, but adopts them in an effect **after**
mount — never in the `useState` initializer, which runs during the hydration
render. `/cards` is server-rendered, so a render-time read makes the first client
render disagree with the server's HTML the moment a user has saved anything other
than the default first-5 columns: React throws a hydration error and **discards
and regenerates the entire `CardList` subtree**. The writer is gated on a
`loaded` flag so the initial persist cannot clobber the stored value with the
render-time default.

⚠️ The obvious "simplification" — read `localStorage` in the initializer —
reintroduces this. It is invisible in a fresh session (a first-time visitor's
stored value equals the default) and no test covers it.

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

- **New Card view (e.g. kanban)** → add component under `src/components/cards/`, wire into `CardViewToggle`, extend `CardListView` + `CARD_LIST_PAGE_SIZE` in `list-params.ts`, add a tab in `CardList`.
- **New searchable dimension** → extend `searchCards` params + UI in `CardSearch`, **and** the query keys in `src/lib/cards/list-params.ts` (both directions) plus `SearchCardsSchema`. If the dimension is shared across card types, use `getCommonFieldDefinitions` from `fields`.
- **New surface linking to a card detail** → build the href with `cardDetailHref` and add the origin to `CardOrigin` + `resolveCardOrigin`, rather than hand-writing `?from=`.
- **New Card-level status or workflow** → extend the `lifecycle_status` enum, teach `src/lib/server/lifecycle/state-machine.ts` the new transitions (its matrix test will fail until you do), update DAL scopes and UI states.

## Module interactions

- Reads from: `card-types` (schema), `fields` (definitions + rendering), `validations` (scan validation results), `actions` (available actions for a card), `card-designs` (linked design for preview).
- Writes to: `cards`, `field_values`.
- Owns `executeScanWithAutoActionsAction` and `resumeAutoActionsAction` — the operational scan pipeline. Cross-referenced by `actions` (auto-action execution), `scanning` (input surface), `dashboard` (result display).

## Open TODOs

- [ ] None specific (no tagged `TODO:` comments in source as of sync date).

## Recent changes

- 2026-08-02 — Card list view state (types, search, status, field filters, view, page) moved into the query string, parsed server-side; new `src/lib/cards/` (`list-params`, `return-origin`, `scroll-restore`) over the shared `src/lib/navigation/` primitives now used by `history` too. Rows open `/cards/[code]?from=cards&cq=…`; the detail's back link rebuilds the list, forwards the origin to the editor, and archiving redirects to the filtered list. `CardList` now holds one state object committed through `commit`. Scroll restore was fixed twice over: page offsets come from `DashboardShell`'s inner `<main data-slot="page-scroll">` (the window never scrolls) and are re-applied until they survive the router's post-navigation reset — which also fixes the same two bugs on `/history`. ADR `2026-08-02-card-list-url-state-and-return.md`.
- 2026-08-02 — Select fields became filterable in the card list. The shared `FieldFilterBuilder` read its options from `validationRules.options`, a shape nothing ever writes (they live in `rules[]` as `{ rule: "options", value }`), so the value dropdown was always empty and a select filter could be built but never given a value. Now uses `getSelectOptions` from `@/lib/validation/rules`. The filter SQL was already correct — `equals_text` matches `fv.value_text`, which is where select values are actually stored. Bug fix, no ADR.
- 2026-08-02 — Two card-list bug fixes. (1) `useCardColumns` no longer reads `localStorage` during render: the server rendered the default 5 columns while the client's first render used the saved set, so every `/cards` load threw a hydration error and React discarded and regenerated the whole SSR-ed `CardList`. Storage is now adopted in a post-mount effect, with the writer gated on a `loaded` flag. (2) `CardTableView` / `CardProfileView` pass `enlargeable={false}` to the photo renderer, so a thumbnail click reaches the row (which navigates to the card detail) instead of opening a lightbox that the navigation immediately unmounted; thumbnails also became `loading="lazy"`. **Descargar** is consequently card-detail-only. No ADR — bug fixes.
- 2026-08-02 — Card list photos moved to the stable route `/api/photos/cards/[code]?field=…`. `CardTableView` / `CardProfileView` now pass `card.code` + the card's own `fieldDefinitionId` (via a new `fieldIdMap`, because merged columns span card types) and `PhotoRenderer` derives the `<img src>` itself. The three list producers replaced `signCardListPhotos` with `stripCardListPhotoKeys`, so keys no longer reach the client. Fixes thumbnails breaking after any client-side refetch (card-type filter, search, status filter, pagination, view toggle) and the 15-minute expiry on a long-open tab. ADR `2026-08-02-card-list-photos-stable-route.md`.
- 2026-07-17 — Archived (trash) view + hard delete, phase 4 of 5. New `/archived` page (ADMIN+) with two tabs listing archived types/cards (`listArchivedCards` / `listArchivedCardTypes`), the purge countdown, restore (cards admin+master, types master) and permanent delete + "Vaciar papelera" (master, typed phrase). New hard-delete primitive `src/lib/server/lifecycle/purge.ts` (single-statement CASCADE delete, the project's only physical delete; no purge audit) and master actions `purgeArchivedCard/CardTypeNowAction` + `emptyTrashAction`. New shared `ConfirmPhraseDialog`; nav item added to `DashboardShell`. ADR `2026-07-17-card-lifecycle-trash-view.md`.

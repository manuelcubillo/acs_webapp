# Module: cards

**Last updated**: 2026-04-27 · **Last feature**: design preview + PNG export from card detail

## Responsibility

Card lifecycle: creation, editing, viewing, searching, and the multiple UI representations (list, table, profile). Rendering dynamic fields on Cards. Does **not** own field-definition logic (see `fields`) or action execution (see `actions`).

## Key files

- `src/app/(dashboard)/cards/page.tsx` — Card list + search (OPERATOR+). Uses searchParams `?cardTypeId&q`.
- `src/app/(dashboard)/cards/new/page.tsx` — Create shell (ADMIN+). Requires `?cardTypeId`.
- `src/app/(dashboard)/cards/new/CardNewClient.tsx` — `CardForm` in create mode.
- `src/app/(dashboard)/cards/[code]/page.tsx` — Detail view (OPERATOR+). Always informational. Renders `CardDetailClient`.
- `src/components/cards/CardDetailClient.tsx` — Client component managing card state, scan-result state, and action execution on the detail page. Mounts `CardActions` + `ScanAlerts`.
- `src/app/(dashboard)/cards/[code]/edit/page.tsx` — Edit shell (ADMIN+).
- `src/app/(dashboard)/cards/[code]/edit/CardEditClient.tsx` — `CardForm` in edit mode.
- `src/components/cards/CardForm.tsx` — Uses `useCardForm`, renders `DynamicFieldInput` per field.
- `src/components/cards/CardList.tsx` — Tabs: list / table / profile.
- `src/components/cards/CardTableView.tsx` — Table + `useCardColumns` + `CardColumnSelector`.
- `src/components/cards/CardProfileView.tsx` — Single-card detail view.
- `src/components/cards/CardSearch.tsx` — Search + filter interface.
- `src/components/cards/CardViewToggle.tsx` — Toggle between list / table / profile.
- `src/components/cards/CardColumnSelector.tsx` — Column visibility picker (localStorage via `useCardColumns`).
- `src/components/cards/ScanAlerts.tsx` — Displays `ScanValidationResult` entries.
- `src/hooks/useCardForm.ts` — Field values + `validateCard` + per-field error clearing.
- `src/hooks/useCardColumns.ts` — localStorage-persisted column visibility.
- `src/lib/dal/cards.ts` — `getCardByCode`, `getCardById`, `searchCards`, create/update/archive.
- `src/lib/actions/cards.ts` — Server Actions: `getCardByCodeAction` (informational lookup), `executeScanWithAutoActionsAction` (operational scan + auto-actions), `resumeAutoActionsAction` (override continuation), `validateBeforeActionAction`, `createCardAction`, `updateCardAction`, `updateCardCodeAction`, `deleteCardAction`, `listCardsAction`, `searchCardsAction`.
- `src/app/api/cards/[code]/route.ts` — External GET by code (uses `x-tenant-id`).

## Data model (relevant subset)

- `cards(id, code, card_type_id, tenant_id, status, timestamps)` — unique `(tenant_id, code)`.
- `field_values(id, card_id, field_definition_id, value_text, value_number, value_boolean, value_date, value_json, timestamps)`.

Primary lookup: `code + tenantId`. UUID is internal only.

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

`searchCardsAction` supports multi-card-type search with a `codeContains` partial match **and** field-level filters (same 14 operators as the history feature: `contains`, `starts_with`, `equals_text`, `eq`, `gt`, `lt`, `gte`, `lte`, `between`, `is_true`, `is_false`, `date_eq`, `date_before`, `date_after`, `date_between`).

## Extension points

- **New Card view (e.g. kanban)** → add component under `src/components/cards/`, wire into `CardViewToggle`, add a tab in `CardList`.
- **New searchable dimension** → extend `searchCards` params + UI in `CardSearch`. If the dimension is shared across card types, use `getCommonFieldDefinitions` from `fields`.
- **New Card-level status or workflow** → extend `card_status` enum, update DAL filters, update UI states.

## Module interactions

- Reads from: `card-types` (schema), `fields` (definitions + rendering), `validations` (scan validation results), `actions` (available actions for a card), `card-designs` (linked design for preview).
- Writes to: `cards`, `field_values`.
- Owns `executeScanWithAutoActionsAction` and `resumeAutoActionsAction` — the operational scan pipeline. Cross-referenced by `actions` (auto-action execution), `scanning` (input surface), `dashboard` (result display).

## Open TODOs

- [ ] None specific (no tagged `TODO:` comments in source as of sync date).

## Recent changes

- 2026-04-27 — Added design preview + PNG export to card detail: `CardDesignPreviewButton`, `CardDesignPreviewModal`; `listDesignsForCardType` parallel-fetched on page load; field values serialised by server component.
- 2026-04-19 — Initial extraction from technical handoff.
- 2026-04-19 — Synchronized documentation against source code: corrected card detail page to always-informational; added `CardDetailClient`, `executeScanWithAutoActionsAction`, `resumeAutoActionsAction`, `validateBeforeActionAction`, `updateCardCodeAction`, `listCardsAction`; updated search to mention field-level filters; fixed module interactions.

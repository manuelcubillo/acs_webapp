# Module: card-types

**Last updated**: 2026-07-17 · **Last feature**: archived types in the trash view + hard-delete cascade (phase 4)

## Responsibility

Defining the shape of card families: the 5-step wizard (basic info → fields → actions → scan validations → review), CardType CRUD, and transforming DB schemas into wizard draft state for edit mode.

Field definition, action definition, and scan validation details are owned by their respective modules — this module orchestrates them inside the wizard.

## Key files

- `src/app/(dashboard)/card-types/page.tsx` — List view (OPERATOR+). Reads `?flash&n` to show a `FlashMessage` after an archive redirect (cascade size in `n`).
- `src/app/(dashboard)/card-types/new/page.tsx` — Create wizard shell (MASTER).
- `src/app/(dashboard)/card-types/[id]/page.tsx` — Detail, full schema (OPERATOR+). Renders `CardTypeLifecycleControls` (MASTER only) and fetches `countLiveCardsForCardType` for the archive cascade warning.
- `src/app/(dashboard)/card-types/[id]/edit/page.tsx` — Edit wizard shell (MASTER). Maps DB rows to `WizardInitialData`.
- `src/components/card-types/CardTypeWizard.tsx` — Wizard container, uses `useCardTypeWizard`.
- `src/components/card-types/WizardStepIndicator.tsx` — Step dots.
- `src/components/card-types/CardTypeCard.tsx` — Card-type tile in list view.
- `src/components/card-types/CardTypeList.tsx` — Grid of `CardTypeCard`.
- `src/components/card-types/steps/BasicInfoStep.tsx` — Name + description.
- `src/components/card-types/steps/FieldDefinitionsStep.tsx` — `FieldList` + `FieldEditor`.
- `src/components/card-types/steps/ActionsStep.tsx` — Action add/remove/configure.
- `src/components/card-types/steps/ScanValidationsStep.tsx` — Scan validation rules.
- `src/components/card-types/steps/ReviewStep.tsx` — Read-only summary.
- `src/hooks/useCardTypeWizard.ts` — 5-step state + sequential Server Action submit.
- `src/lib/dal/card-types.ts` — `listCardTypes` (excludes archived), `listArchivedCardTypes` (trash listing: only archived, joins the archiver's name + grouped cascade card count), `getCardTypeWithFullSchema`, create/update (descriptive fields only).
- `src/lib/actions/card-types.ts` — Server Actions for create/update. Lifecycle moved out (see below).
- `src/lib/server/lifecycle/card-types.ts` — `activate/deactivate/archive/restoreCardType`; archive cascades to cards in one CTE.
- `src/lib/server/lifecycle/purge.ts` — `hardDeleteArchivedCardType` (single-statement CASCADE delete of a type + all its cards/schema) and `hardDeleteAllArchived`. Phase 4. ADR `2026-07-17-card-lifecycle-trash-view.md`.
- `src/lib/actions/lifecycle.ts` — `…CardTypeAction` Server Actions (MASTER), plus `purgeArchivedCardTypeNowAction` / `emptyTrashAction` (MASTER, phase 4).
- `src/app/(dashboard)/archived/` — Trash view (ADMIN+): the "Tipos archivados" tab lists archived types with restore (MASTER) and permanent delete (MASTER, typed phrase). See `modules/cards.md`.
- `src/components/card-types/CardTypeLifecycleControls.tsx` — Detail-page state controls (phase 3, MASTER): activate / deactivate / archive. Archive confirmation warns how many live cards will cascade, then redirects to `/card-types?flash=type-archived&n=<count>`.
- `src/components/card-types/CardTypeLinkedDesigns.tsx` — Linked designs section on detail page; link/unlink per kind slot (MASTER interactive; OPERATOR read-only).

## Data model (relevant subset)

- `card_types(id, tenant_id, name, description, status, archived_at, archived_by, status_before_archive, timestamps)`

`status` is `lifecycle_status`; a CHECK forbids `expired` (cards only). Replaced the `is_active` boolean in migration 0017.

Depends on `field_definitions`, `action_definitions`, `scan_validations` (owned by `fields`, `actions`, `validations` modules).

## Main flows

### Create (master)

1. `/card-types/new` → `CardTypeWizard` in create mode.
2. Draft state managed by `useCardTypeWizard()`.
3. Submit runs Server Actions sequentially: create `card_type` → create fields → create actions → create scan validations.
4. On success, navigate to `/card-types/{cardTypeId}`.

### Edit (master)

1. `/card-types/[id]/edit` → server component fetches via `getCardTypeWithFullSchema`.
2. Maps DB rows to draft shape using the **tempId convention**:
   - Fields: `fieldDrafts[i].tempId = field.id; fieldDrafts[i].id = field.id`.
   - Actions: `actionDrafts[i].targetFieldTempId = action.targetFieldDefinitionId`.
   - Scan validations: `scanValidationDrafts[i].fieldTempId = sv.fieldDefinitionId`.
3. Wizard diffs drafts against DB ids to decide create / update / soft-delete per row.

### Detail view

`getCardTypeWithFullSchema(cardTypeId)` returns `{ cardType, fieldDefinitions, actionDefinitions, scanValidations }` in a single call. Used by detail page and edit page loaders.

## Extension points

- **New wizard step** → add `steps/<new>Step.tsx`, extend `useCardTypeWizard` state machine, add indicator position, extend submit pipeline.
- **New CardType-level setting** → add column to `card_types`, extend `BasicInfoStep`, extend DAL and Server Actions.
- **Lifecycle transition** → do NOT add it to `updateCardType`; extend `src/lib/server/lifecycle/card-types.ts` so validation, cascade and audit stay in one place.
- **New validation at submit** → extend `useCardTypeWizard.validate()` (draft-level) and the corresponding DAL function (persistence-level).

## Module interactions

- Reads from / writes to: `fields` (field definitions), `actions` (action definitions), `validations` (scan validations).
- Consumed by: `cards` (CardType drives the Card form dynamically), `card-designs` (link picker fetches card type list; detail page shows linked designs).

## Open TODOs

- [ ] None specific to this module as of last extraction. Inspect source for newer `TODO:` tags.

## Recent changes

- 2026-07-17 — Archived types in the trash view + hard delete, phase 4 of 5. `listArchivedCardTypes` (only archived, with the archiver's name and a grouped cascade card count) feeds the "Tipos archivados" tab of `/archived`. `hardDeleteArchivedCardType` physically deletes a type and its whole cascade in one statement (the project's only hard delete; no purge audit); `purgeArchivedCardTypeNowAction` + `emptyTrashAction` are MASTER-only and typed-phrase confirmed. Restoring a type stays MASTER-only. ADR `2026-07-17-card-lifecycle-trash-view.md`.
- 2026-07-17 — Lifecycle state controls, phase 3 of 5. `CardTypeLifecycleControls` on the detail page (MASTER) lets a master activate / deactivate / archive a type; archive confirmation states the cascade size via `countLiveCardsForCardType` and redirects with `?flash=type-archived&n=`. Placed on the detail page, not inside the edit wizard (see ADR). ADR `2026-07-17-card-lifecycle-edit-controls.md`.
- 2026-07-17 — Card lifecycle + archiving, phase 1 of 5. `is_active` boolean replaced by `status` (`lifecycle_status`) + trash metadata. `listCardTypes` now shows `inactive` types (it previously hid them) and hides `archived` ones. Archiving a type cascades to all its live cards, tagging each with `archived_via_type_id`; restoring revives only those. Lifecycle is MASTER-only, matching every other card type mutation. `deactivateCardTypeAction` moved from `actions/card-types.ts` to `actions/lifecycle.ts`. ADR `2026-07-17-card-lifecycle-archiving.md`.
- 2026-04-27 — Added `CardTypeLinkedDesigns` section on detail page; updated module interactions to include `card-designs`.
- 2026-04-19 — Initial extraction from technical handoff.

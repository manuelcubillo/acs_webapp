# Module: card-types

**Last updated**: 2026-06-07 · **Last feature**: Phase 3 token/shadcn migration of card-types (wizard, steps, fields, detail) — presentation only, ADR `2026-06-07-phase3-inline-style-migration.md`

## Responsibility

Defining the shape of card families: the 5-step wizard (basic info → fields → actions → scan validations → review), CardType CRUD, and transforming DB schemas into wizard draft state for edit mode.

Field definition, action definition, and scan validation details are owned by their respective modules — this module orchestrates them inside the wizard.

## Key files

- `src/app/(dashboard)/card-types/page.tsx` — List view (OPERATOR+).
- `src/app/(dashboard)/card-types/new/page.tsx` — Create wizard shell (MASTER).
- `src/app/(dashboard)/card-types/[id]/page.tsx` — Detail, full schema (OPERATOR+).
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
- `src/lib/dal/card-types.ts` — `listCardTypes`, `getCardTypeWithFullSchema`, create/update/archive.
- `src/lib/actions/card-types.ts` — Server Actions for create/update/archive.
- `src/components/card-types/CardTypeLinkedDesigns.tsx` — Linked designs section on detail page; link/unlink per kind slot (MASTER interactive; OPERATOR read-only).

## Data model (relevant subset)

- `card_types(id, tenant_id, name, description, is_active, timestamps)`

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
- **New validation at submit** → extend `useCardTypeWizard.validate()` (draft-level) and the corresponding DAL function (persistence-level).

## Module interactions

- Reads from / writes to: `fields` (field definitions), `actions` (action definitions), `validations` (scan validations).
- Consumed by: `cards` (CardType drives the Card form dynamically), `card-designs` (link picker fetches card type list; detail page shows linked designs).

## Open TODOs

- [ ] None specific to this module as of last extraction. Inspect source for newer `TODO:` tags.

## Recent changes

- 2026-04-27 — Added `CardTypeLinkedDesigns` section on detail page; updated module interactions to include `card-designs`.
- 2026-04-19 — Initial extraction from technical handoff.
- 2026-04-19 — Synchronized documentation against source code: no drift found; metadata updated.

# Module: fields

**Last updated**: 2026-04-27 · **Last feature**: field binding consumed by card-designs editor

## Responsibility

Everything about dynamic fields: `FieldDefinition` declarations, `FieldValue` storage, the six field types (`text`, `number`, `boolean`, `date`, `photo`, `select`), dynamic rendering maps, and shared field helpers across card types.

Validation rules per field type are stored here (in `validation_rules` jsonb) but **evaluated** by the `validations` module.

## Key files

- `src/lib/dal/field-definitions.ts` — CRUD + `getCommonFieldDefinitions(tenantId, cardTypeIds[])`.
- `src/lib/dal/field-values.ts` — Read/write with `mapValueToColumn` / `extractValue`.
- `src/lib/db/schema/access-control.ts` — `field_definitions`, `field_values` tables.
- `src/components/card-types/fields/FieldEditor.tsx` — Slide-in panel, create/edit `FieldDefinitionDraft`.
- `src/components/card-types/fields/FieldList.tsx` — `@dnd-kit/core` drag-drop reorder.
- `src/components/card-types/fields/FieldTypeSelector.tsx` — 6-type visual grid. `onChange` is optional (safe to render from server components, `readOnly` mode available).
- `src/components/card-types/fields/ValidationRulesEditor.tsx` — Per-field validation toggle/config.
- `src/components/cards/DynamicFieldRenderer.tsx` — `switch(fieldType) → *Renderer`.
- `src/components/cards/DynamicFieldInput.tsx` — `switch(fieldType) → *Input`.
- `src/components/cards/renderers/` — `TextRenderer`, `NumberRenderer`, `BooleanRenderer`, `DateRenderer`, `PhotoRenderer`, `SelectRenderer`.
- `src/components/cards/inputs/` — `TextInput`, `NumberInput`, `BooleanInput`, `DateInput`, `PhotoInput` (uploads to `/api/upload`), `SelectInput` (reads options from `validationRules`).
- `src/app/api/upload/route.ts` — Photo upload endpoint.

## Data model (relevant subset)

### `field_definitions`

| Column              | Notes                                                                              |
| ------------------- | ---------------------------------------------------------------------------------- |
| `id`                | UUID PK                                                                            |
| `card_type_id`      | FK                                                                                 |
| `name`              | Internal identifier                                                                |
| `label`             | UI label                                                                           |
| `field_type`        | Enum: `text | number | boolean | date | photo | select`                            |
| `is_required`       | bool                                                                               |
| `position`          | Order in card layout                                                               |
| `default_value`     | jsonb                                                                              |
| `validation_rules`  | jsonb — interpreted by form validation engine; `select` options live here too      |
| `is_active`         | Soft delete                                                                        |

### `field_values`

Typed columns: `value_text`, `value_number`, `value_boolean`, `value_date`, `value_json`. Dispatched via `mapValueToColumn(fieldType, value)` on write, `extractValue(fieldType, row)` on read.

| Field type | Stored in       | Notes                                          |
| ---------- | --------------- | ---------------------------------------------- |
| `text`     | `value_text`    |                                                |
| `number`   | `value_number`  |                                                |
| `boolean`  | `value_boolean` |                                                |
| `date`     | `value_date`    |                                                |
| `photo`    | `value_text`    | URL reference to local filesystem (for now)    |
| `select`   | `value_json`    | Array for multi-select, string for single      |

## Main flows

### Adding a field type to the system

1. Add the enum value to `field_type`.
2. Create `renderers/<Type>Renderer.tsx` and `inputs/<Type>Input.tsx`.
3. Register in `DynamicFieldRenderer` and `DynamicFieldInput` switch maps.
4. Extend the form validation engine in `src/lib/validation/validators.ts` with rules for the new type.
5. If the type uses a new storage column, extend the schema + `mapValueToColumn` + `extractValue`.

### Photo upload

1. `PhotoInput` receives `tenantId` prop.
2. Uploads file to `POST /api/upload`.
3. Response returns URL; `PhotoInput` writes URL as the field value (stored in `value_text`).

### Select options

Options live inside `validation_rules.rules` (no dedicated `options` column). `SelectInput` and `SelectRenderer` both read from there.

### Shared fields across card types

`getCommonFieldDefinitions(cardTypeIds: string[])` (in `src/lib/dal/common-fields.ts`) returns fields whose `name + fieldType` pair appears in **all** given card types. Photo fields are excluded. Used by:

- Column selection on multi-card-type table views.
- Cross-card-type search filters and history field filters.
- Summary field configuration in dashboard settings.

## Extension points

- **New field type** → steps above.
- **New validation rule** → extend `validation_rules` jsonb shape + `ValidationRulesEditor` UI + form validation engine.
- **New input variant** → prefer a prop on the existing `*Input` over a new type (e.g. `TextInput` with `variant="textarea"`).

## Module interactions

- Owned by: `card-types` (wizard orchestrates field CRUD), `cards` (renders fields).
- Consumed by: `validations` (interprets `validation_rules`), `dashboard` (summary fields), `card-designs` (field binding in editor — common field intersection across linked card types).

## Open TODOs

- [ ] None (no tagged `TODO:` comments in source for fields as of sync date).

## Future considerations

- Photo storage migration to S3/R2 (no code tag; tracked at project level as `TODO: STORAGE` but not tagged in source).
- Select options live inside `validation_rules`. Consider a dedicated `options` jsonb column if the pattern becomes more common.

## Recent changes

- 2026-04-27 — `card-designs` now consumes field definitions for editor data binding; `getCommonFieldDefinitions` pattern extended client-side in `CardDesignEditor.computeCommonFields` (intersection by name+fieldType).
- 2026-04-19 — Initial extraction from technical handoff.
- 2026-04-19 — Synchronized documentation against source code: corrected `getCommonFieldDefinitions` file (`common-fields.ts`) and signature (no `tenantId`); moved `TODO: STORAGE` to Future considerations (no code tag).

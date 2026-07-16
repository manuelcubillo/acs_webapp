# Module: fields

**Last updated**: 2026-07-16 · **Last feature**: `PhotoRenderer` thumbnail preserves aspect ratio, size via `--photo-thumbnail-size`; card photos consumed by dashboard thumbnails

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
- `src/components/cards/inputs/` — `TextInput`, `NumberInput`, `BooleanInput`, `DateInput`, `PhotoInput` (wraps `PhotoUploader` with kind `card-photo`), `SelectInput` (reads options from `validationRules`).

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
| `photo`    | `value_text`    | Object key in the photo storage bucket — never a URL. Server signs to URLs at render via `signCardPhotos` / `buildPhotoReadUrlMap`. |
| `select`   | `value_json`    | Array for multi-select, string for single      |

## Main flows

### Adding a field type to the system

1. Add the enum value to `field_type`.
2. Create `renderers/<Type>Renderer.tsx` and `inputs/<Type>Input.tsx`.
3. Register in `DynamicFieldRenderer` and `DynamicFieldInput` switch maps.
4. Extend the form validation engine in `src/lib/validation/validators.ts` with rules for the new type.
5. If the type uses a new storage column, extend the schema + `mapValueToColumn` + `extractValue`.

### Photo upload

1. `PhotoInput` mounts `PhotoUploader` (kind: `card-photo`, owner: card UUID for edit mode, draft UUID for create).
2. `PhotoUploader` runs `optimizeImage(file, CARD_PHOTO_PROFILE)` (canvas-based resize → max 3000×4000px, WebP @ quality 0.82, ≤ 2.5 MB output, EXIF stripped). Profile defined in `src/lib/images/profiles.ts`.
3. `requestPhotoUploadUrlAction` returns a 60-second presigned PUT and a `<tenantId>/cards/<owner>/<random>.webp` key.
4. Browser PUTs the optimized blob directly to R2/MinIO.
5. `confirmPhotoUploadAction` HEADs the object, validates size + content-type, and returns the signed read URL.
6. `PhotoInput` stores the **object key** in form state; the parent persists it via the standard card update.
7. On render (server component), `signCardPhotos` / `buildPhotoReadUrlMap` mints fresh 15-minute signed URLs before passing to client renderers.

### Photo display

`PhotoRenderer` (`src/components/cards/renderers/PhotoRenderer.tsx`) shows a thumbnail whose longer side is capped at `--photo-thumbnail-size` (Layer-3 layout-chrome var in `globals.css`, currently `6rem`/96px), consumed as `max-h-[var(--photo-thumbnail-size)] max-w-[var(--photo-thumbnail-size)]`. Aspect ratio is always preserved (no crop, no stretch); `self-start` + `shrink-0` cancel the flex-stretch imposed by the parent `flex flex-col` wrapper in `CardDetailClient.tsx`. Clicking it opens a shadcn `Dialog` lightbox with the full-size image (`max-h-[90vh] w-auto object-contain`); the `DialogContent` uses `w-fit` so the surface hugs the image (no black gutter for portrait photos).

The dashboard renders card photos from its own signed URLs, **not** through `PhotoRenderer`: `ActiveCardZone` shows the `photo` summary field as a `max-h-16` thumbnail, and `ActivityFeedEntryRow` uses a 36px `object-cover` avatar for scan rows. See `modules/dashboard.md`.

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

- Select options live inside `validation_rules`. Consider a dedicated `options` jsonb column if the pattern becomes more common.

## Recent changes

- 2026-07-16 — `PhotoRenderer` thumbnail now preserves aspect ratio (no square crop): removed `object-cover`, added `self-start` + `shrink-0` to defeat parent flex-stretch, and moved the size cap to the `--photo-thumbnail-size` var (`globals.css`, 6rem). Lightbox `DialogContent` set to `w-fit` (no black gutter). Corrected stale `CARD_PHOTO_PROFILE` figure (was ≤ 180 KB; code caps at 2.5 MB / 3000×4000px). Dashboard now renders card photo thumbnails (see `modules/dashboard.md`).
- 2026-04-28 — Photo field migrated to bucket-backed storage (R2/MinIO). `value_text` now stores object keys; `PhotoInput` wraps the shared `PhotoUploader` with `CARD_PHOTO_PROFILE`. Server components must call `signCardPhotos` / `buildPhotoReadUrlMap` before passing photo values down. ADR `2026-04-27-photo-storage-r2-minio.md`.
- 2026-04-27 — `card-designs` now consumes field definitions for editor data binding; `getCommonFieldDefinitions` pattern extended client-side in `CardDesignEditor.computeCommonFields` (intersection by name+fieldType).
- 2026-04-19 — Initial extraction from technical handoff.
- 2026-04-19 — Synchronized documentation against source code: corrected `getCommonFieldDefinitions` file (`common-fields.ts`) and signature (no `tenantId`); moved `TODO: STORAGE` to Future considerations (no code tag).

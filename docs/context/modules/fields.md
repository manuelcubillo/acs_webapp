# Module: fields

**Last updated**: 2026-08-29 · **Last feature**: date inputs normalize through `toDateInputValue`, so an unset date field renders empty

## Responsibility

Everything about dynamic fields: `FieldDefinition` declarations, `FieldValue` storage, the six field types (`text`, `number`, `boolean`, `date`, `photo`, `select`), dynamic rendering maps, and shared field helpers across card types.

Validation rules per field type are stored here (in `validation_rules` jsonb) but **evaluated** by the `validations` module.

## Key files

- `src/lib/dal/field-definitions.ts` — CRUD + `getCommonFieldDefinitions(tenantId, cardTypeIds[])`.
- `src/lib/fields/system.ts` — `excludeSystemFields` / `excludeSystemActions`. Applied **at each consumer**, never inside a DAL read (constraint #27). Grep either name to enumerate every surface that has declared its intent.
- `src/lib/fields/date-input-value.ts` — `toDateInputValue`: any stored date shape (`Date`, ISO string, `YYYY-MM-DD`) → the `YYYY-MM-DD` a native date input accepts, everything else → `""`. Unit-tested. Consumed by `DateInput`.
- `src/lib/dal/field-values.ts` — Read/write with `mapValueToColumn` / `extractValue`.
- `src/lib/db/schema/access-control.ts` — `field_definitions`, `field_values` tables.
- `src/components/card-types/fields/FieldEditor.tsx` — Slide-in panel, create/edit `FieldDefinitionDraft`.
- `src/components/card-types/fields/FieldList.tsx` — `@dnd-kit/core` drag-drop reorder.
- `src/components/card-types/fields/FieldTypeSelector.tsx` — 6-type visual grid. `onChange` is optional (safe to render from server components, `readOnly` mode available).
- `src/components/card-types/fields/ValidationRulesEditor.tsx` — Per-field validation toggle/config.
- `src/components/cards/DynamicFieldRenderer.tsx` — `switch(fieldType) → *Renderer`.
- `src/components/cards/DynamicFieldInput.tsx` — `switch(fieldType) → *Input`.
- `src/components/cards/renderers/` — `TextRenderer`, `NumberRenderer`, `BooleanRenderer`, `DateRenderer`, `PhotoRenderer` (thumbnail; given the card `code` + `fieldDefinitionId` it derives its own `src` from the stable route, and unless `enlargeable={false}` a click opens a lightbox with a **Descargar** button), `SelectRenderer`.
- `src/components/cards/inputs/` — `TextInput`, `NumberInput`, `BooleanInput`, `DateInput`, `PhotoInput` (wraps `PhotoUploader` with kind `card-photo`, `enableWebcam` + `enableCrop` on), `SelectInput` (options via `getSelectOptions` from `@/lib/validation/rules`).
- `src/components/shared/WebcamCaptureDialog.tsx` + `src/hooks/useWebcamCapture.ts` — webcam capture in a shadcn `Dialog` (getUserMedia lifecycle, rear-camera preference, multi-camera switch, guaranteed track release; captures a PNG `File`).
- `src/components/shared/ImageCropDialog.tsx` — `react-easy-crop` crop step (Free / 1:1 / 3:4 presets + zoom); returns a source-pixel `cropRect`. Used by both sources.

## Data model (relevant subset)

### `field_definitions`

| Column              | Notes                                                                              |
| ------------------- | ---------------------------------------------------------------------------------- |
| `id`                | UUID PK                                                                            |
| `card_type_id`      | FK                                                                                 |
| `name`              | Internal identifier                                                                |
| `label`             | UI label                                                                           |
| `field_type`        | Enum: `text | number | boolean | date | photo | select`                            |
| `is_required`       | bool. Read by both engines: the form engine rejects a blank value, and at scan time a **non-mandatory** field with no value makes its scan validations skip instead of fail. See `modules/validations.md`. |
| `position`          | Order in card layout                                                               |
| `default_value`     | jsonb                                                                              |
| `validation_rules`  | jsonb — interpreted by form validation engine; `select` options live here too      |
| `is_system`         | bool. Server-provisioned row: created and retired by feature code, never by a user, and excluded from every configuration surface. General mechanism — see constraint #27 and `src/lib/fields/system.ts`. Presence control is its first consumer. |
| `is_active`         | Soft delete                                                                        |

### `field_values`

Typed columns: `value_text`, `value_number`, `value_boolean`, `value_date`, `value_json`. Dispatched via `mapValueToColumn(fieldType, value)` on write, `extractValue(fieldType, row)` on read.

⚠️ `updated_at` is maintained by the **`field_values_touch` BEFORE UPDATE trigger** (migration 0021), not by application code. Every write path also sets it by hand — harmless, the trigger wins — but a new one does not have to. `/presence` reads it as "Dentro desde". Accepted imprecision: an UPDATE writing an unchanged value still bumps it, which is why the card edit form scopes its `initialValues` to the fields it actually renders (`useCardForm` submits its seed map wholesale).

| Field type | Stored in       | Notes                                          |
| ---------- | --------------- | ---------------------------------------------- |
| `text`     | `value_text`    |                                                |
| `number`   | `value_number`  |                                                |
| `boolean`  | `value_boolean` |                                                |
| `date`     | `value_date`    |                                                |
| `photo`    | `value_text`    | Object key in the photo storage bucket — never a URL. Detail/edit surfaces sign it at render (`signCardPhotos` / `buildPhotoReadUrlMap`); list surfaces strip it to a presence flag and address the photo by route instead. |
| `select`   | `value_text`    | Single string. `mapValueToColumn` groups `select` with `text`/`photo` and **throws on a non-string** — multi-select is not implemented, despite the `allowMultiple` rule existing in `rules.ts`. Filter SQL matches on `value_text` accordingly. |

## Main flows

### Adding a field type to the system

1. Add the enum value to `field_type`.
2. Create `renderers/<Type>Renderer.tsx` and `inputs/<Type>Input.tsx`.
3. Register in `DynamicFieldRenderer` and `DynamicFieldInput` switch maps.
4. Extend the form validation engine in `src/lib/validation/validators.ts` with rules for the new type.
5. If the type uses a new storage column, extend the schema + `mapValueToColumn` + `extractValue`.

### Photo upload

Card photos support two capture sources and an interactive crop, in both edit + create, via the same shared `PhotoUploader` (`PhotoInput` passes `enableWebcam` + `enableCrop`; other photo kinds keep plain file upload).

1. `PhotoInput` mounts `PhotoUploader` (kind: `card-photo`, owner: card UUID for edit mode, draft UUID for create).
2. Source is a file pick **or** a webcam still (`WebcamCaptureDialog` / `useWebcamCapture` → a PNG `File`, then the camera stream is released).
3. Either source routes through `ImageCropDialog` (`react-easy-crop`), which returns a source-pixel `cropRect`.
4. `PhotoUploader` runs `optimizeImage(file, CARD_PHOTO_PROFILE, { cropRect })` (canvas resize → max 3000×4000px, WebP @ 0.82, ≤ 2.5 MB, EXIF stripped; an explicit `cropRect` overrides the profile's centre-crop). Profile in `src/lib/images/profiles.ts`.
5. `requestPhotoUploadUrlAction` returns a 60-second presigned PUT and a `<tenantId>/cards/<owner>/<random>.webp` key.
6. Browser PUTs the optimized blob directly to R2/MinIO.
7. `confirmPhotoUploadAction` HEADs the object, validates size + content-type, and returns the signed read URL.
8. `PhotoInput` stores the **object key** in form state; the parent persists it via the standard card update.
9. On render (server component), `signCardPhotos` / `buildPhotoReadUrlMap` mints fresh 15-minute signed URLs before passing to client renderers.

### Photo display

`PhotoRenderer` has **two addressing modes**. Given `cardCode` +
`fieldDefinitionId` it builds the `<img src>` itself from
`cardPhotoRoute(code, { fieldDefinitionId })` — a stable, session-authed route
that mints the signature per request, so the image cannot expire in place, the
browser can cache it, and it survives a client-side refetch that carries no URL.
Without those props it falls back to treating `value` as a ready-made URL. In
both modes `value` is the presence signal (empty → dash). Card lists and card
detail use the route; scan results (`ActiveCardZone`) still pass signed URLs.
See ADR `2026-08-02-card-list-photos-stable-route.md`.

The thumbnail's longer side is capped at `--photo-thumbnail-size` (Layer-3 layout-chrome var in `globals.css`, currently `6rem`/96px), consumed as `max-h-[var(--photo-thumbnail-size)] max-w-[var(--photo-thumbnail-size)]`. Aspect ratio is always preserved (no crop, no stretch); `self-start` + `shrink-0` cancel the flex-stretch imposed by the parent `flex flex-col` wrapper in `CardDetailClient.tsx`. Both variants share a `THUMBNAIL_CLASS` constant so they cannot drift.

**The lightbox is opt-out.** By default (`enlargeable`, defaulting to `true`) clicking the thumbnail opens a shadcn `Dialog` with the full-size image (`max-h-[90vh] w-auto object-contain`); the `DialogContent` uses `w-fit` so the surface hugs the image (no black gutter for portrait photos). With `enlargeable={false}` the component renders a bare `<img>` — no handler, no `cursor-pointer`, no `aria-label` — so the click reaches whatever ancestor owns it. Both card list views pass `false`, because their row already navigates to the card detail; card detail keeps the default. See `modules/cards.md` → "Photo rendering in lists".

Thumbnails are `loading="lazy"` + `decoding="async"`. Each one costs a round trip to the photo route (session check + `getCardByCode` + a signature), so a 50-row list would otherwise spend 50 of them to paint the handful of rows on screen. This mitigates rather than removes the N+1 — the browser's prefetch margin is generous — and the batch endpoint noted in ADR `2026-08-02-card-list-photos-stable-route.md` remains the real fix if it ever matters.

The dashboard renders card photos from its own signed URLs, **not** through `PhotoRenderer`: `ActiveCardZone` shows the `photo` summary field as a `max-h-16` thumbnail, and `ActivityFeedEntryRow` uses a 36px `object-cover` avatar for scan rows. See `modules/dashboard.md`. `HistoryTableRow` does the same in the Resumen column — a 36px avatar built from `cardPhotoRoute`, not `PhotoRenderer` (the 6rem thumbnail and its lightbox are too heavy for an audit row). See `modules/history.md`.

### Photo download (named by card code)

The `PhotoRenderer` lightbox shows a **Descargar** button when the card `code` + `fieldDefinitionId` are supplied (threaded via `DynamicFieldRenderer`). In practice that means **the card detail page only**: the button lives inside the lightbox, and both list views disable it with `enlargeable={false}`. The href comes from `cardPhotoRoute(code, { fieldDefinitionId, download: true })`, which 302s to a signed URL whose `Content-Disposition` names the file `<code>_<fieldName>_<random>.<ext>`. The **stored object key is unchanged** (still random UUID); the `<random>` in the filename is that key's final segment, so a downloaded file is traceable back to its bucket object, and `<fieldName>` disambiguates multi-photo cards. Route + storage plumbing live in `infrastructure`. ADR `2026-07-19-webcam-capture-and-crop.md`.

### Select options

Options live inside `validation_rules.rules` (no dedicated `options` column), as `{ rule: "options", value: string[] }`.

Read them **only** via `getSelectOptions(validationRules)` from `@/lib/validation/rules` — never by walking the jsonb inline. The rule name is exported alongside it as `SELECT_OPTIONS_RULE` and is what `RULES_BY_FIELD_TYPE.select` and the `VALIDATOR_REGISTRY` key both derive from, so the wizard that writes the options and every layer that reads them cannot desync. Consumers: `SelectInput` (card form), `FieldFilterBuilder` (card list + history filters), `validateAllowMultiple`. See `modules/validations.md`.

⚠️ An inline read that misses returns `[]`, not an error — the failure surfaces as a silently empty dropdown, which is exactly how this went unnoticed in two layers at once.

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
- Multi-select is declared but not implemented: the `allowMultiple` rule exists in `rules.ts` and `validateAllowMultiple` enforces it, but `SelectInput` can only emit a single string and `mapValueToColumn` throws on a non-string. Enabling the rule on a field therefore makes that field unsubmittable. Either implement it (multi `SelectInput` + `value_json` storage + `extractValue`) or drop the rule.

## Recent changes

- 2026-08-29 — Card date inputs no longer show today's date for a field that has no value. `DateInput` normalized with `String(value).slice(0, 10)`, but `value_date` is a `timestamp`, so the form receives a `Date` whose `String()` form (`"Thu Aug 27"`) is NOT a valid `<input type="date">` value: the browser discards it, the input renders blank while React still believes it holds a value, and the native picker — treating the control as unassigned — opens on and commits **today** at the first interaction, which the wholesale save then persists. Normalization moved to `toDateInputValue`, which formats a `Date` with LOCAL calendar components (never `toISOString()`: stored dates are midnights and UTC would shift them a day back) and maps anything unparseable to `""`. Affects `/cards/new` and `/cards/[code]/edit` — the only two surfaces reaching `DateInput`. Bug fix, no ADR.
- 2026-08-24 — `field_definitions` gained `is_system`, and `field_values.updated_at` became trigger-maintained. System fields are filtered out at the consumer by `excludeSystemFields` (`src/lib/fields/system.ts`) — applied to the card create/edit forms, the wizard's edit loader (before the tempId mapping), the card-type detail + list tiles, the dashboard-settings pickers, the card-list columns, the field-filter builders (via `getCommonFieldDefinitionsAction`), the design-editor bindings, and the card-detail value grid. Deliberately NOT applied to the DAL reads themselves, nor to `getAutoExecuteActions`. `EnrichedFieldValue`, `CommonFieldDefinition` and `FilterableFieldDefinition` now carry `isSystem`. ADR `2026-08-24-presence-control.md`.
- 2026-08-15 — `is_required` now has a second consumer: at scan time a non-mandatory field with no value makes its scan validations skip rather than fail. No code changed in this module — the flag is joined onto the rule in `src/lib/dal/scan-validations.ts`, because a field blank since creation has no `field_values` row and never reaches `EnrichedFieldValue[]`. ADR `2026-08-15-scan-validation-empty-optional-fields.md`.
- 2026-08-02 — Select options are now read through one shared helper, `getSelectOptions` in `@/lib/validation/rules`. `SelectInput` was looking up a rule named `allowedValues` (nothing writes that name), so the card form's select dropdown was always empty and a select field could not be assigned on create or edit. Corrected the storage table above: `select` lives in **`value_text`**, not `value_json` — the doc described a multi-select design that was never implemented. Bug fix, no ADR.
- 2026-08-02 — `PhotoRenderer` lightbox became opt-out via a new `enlargeable` prop (default `true`), threaded through `DynamicFieldRenderer`. Both list views pass `false`: their row navigates to the card detail, and the photo's `onClick` was swallowing that click, so the thumbnail advertised "Ampliar foto" and then never enlarged. Static variant drops the handler, `cursor-pointer` and `aria-label`; the shared footprint moved to a `THUMBNAIL_CLASS` constant. Thumbnails also gained `loading="lazy"` + `decoding="async"` — a 50-row list was firing 50 photo-route round trips to paint ~4 visible rows. Side effect: **Descargar** is now card-detail-only. Bug fix, no ADR.

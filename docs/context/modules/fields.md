# Module: fields

**Last updated**: 2026-08-02 · **Last feature**: select options read through one shared helper; corrected the documented storage column for `select`

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

- 2026-08-02 — Select options are now read through one shared helper, `getSelectOptions` in `@/lib/validation/rules`. `SelectInput` was looking up a rule named `allowedValues` (nothing writes that name), so the card form's select dropdown was always empty and a select field could not be assigned on create or edit. Corrected the storage table above: `select` lives in **`value_text`**, not `value_json` — the doc described a multi-select design that was never implemented. Bug fix, no ADR.
- 2026-08-02 — `PhotoRenderer` lightbox became opt-out via a new `enlargeable` prop (default `true`), threaded through `DynamicFieldRenderer`. Both list views pass `false`: their row navigates to the card detail, and the photo's `onClick` was swallowing that click, so the thumbnail advertised "Ampliar foto" and then never enlarged. Static variant drops the handler, `cursor-pointer` and `aria-label`; the shared footprint moved to a `THUMBNAIL_CLASS` constant. Thumbnails also gained `loading="lazy"` + `decoding="async"` — a 50-row list was firing 50 photo-route round trips to paint ~4 visible rows. Side effect: **Descargar** is now card-detail-only. Bug fix, no ADR.
- 2026-08-02 — `PhotoRenderer` gained a second addressing mode: with `cardCode` + `fieldDefinitionId` it builds its own `<img src>` from `cardPhotoRoute` (stable, per-request signature) instead of consuming a URL from `value`, which becomes a pure presence signal. Adopted by both card list views and, since it already passed both props, card detail. Fixes list thumbnails breaking on every client-side refetch and the 15-minute expiry. The download href now comes from the same helper. ADR `2026-08-02-card-list-photos-stable-route.md`.
- 2026-07-19 — Webcam capture + interactive crop for photo fields, in both edit + create views via the shared `PhotoUploader` (opt-in `enableWebcam` / `enableCrop`; `PhotoInput` turns both on — other photo kinds unchanged). New `useWebcamCapture` hook, `WebcamCaptureDialog`, `ImageCropDialog` (`react-easy-crop`; "Free" = source aspect, plus 1:1 / 3:4 presets + zoom), and a shadcn `Slider`. `optimizeImage` gained an optional source-pixel `cropRect` that overrides the profile centre-crop. Photo lightbox added a **Descargar** button; downloads are named `<code>_<fieldName>_<random>.<ext>` via a signed `Content-Disposition` (stored key unchanged). ADR `2026-07-19-webcam-capture-and-crop.md`.
- 2026-07-16 — `PhotoRenderer` thumbnail now preserves aspect ratio (no square crop): removed `object-cover`, added `self-start` + `shrink-0` to defeat parent flex-stretch, and moved the size cap to the `--photo-thumbnail-size` var (`globals.css`, 6rem). Lightbox `DialogContent` set to `w-fit` (no black gutter). Corrected stale `CARD_PHOTO_PROFILE` figure (was ≤ 180 KB; code caps at 2.5 MB / 3000×4000px). Dashboard now renders card photo thumbnails (see `modules/dashboard.md`).

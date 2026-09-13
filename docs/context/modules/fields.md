# Module: fields

**Last updated**: 2026-09-08 · **Last feature**: multi-select implemented; typed default-value control in the field editor

## Responsibility

Everything about dynamic fields: `FieldDefinition` declarations, `FieldValue` storage, the six field types (`text`, `number`, `boolean`, `date`, `photo`, `select`), dynamic rendering maps, and shared field helpers across card types.

Validation rules per field type are stored here (in `validation_rules` jsonb) but **evaluated** by the `validations` module.

## Key files

- `src/lib/dal/field-definitions.ts` — CRUD + `getCommonFieldDefinitions(tenantId, cardTypeIds[])`.
- `src/lib/fields/system.ts` — `excludeSystemFields` / `excludeSystemActions`. Applied **at each consumer**, never inside a DAL read (constraint #27). Grep either name to enumerate every surface that has declared its intent.
- `src/lib/fields/date-input-value.ts` — `toDateInputValue`: any stored date shape (`Date`, ISO string, `YYYY-MM-DD`) → the `YYYY-MM-DD` a native date input accepts, everything else → `""`. Unit-tested. Consumed by `DateInput`.
- `src/lib/dal/field-values.ts` — Read/write with `mapValueToColumn` / `extractValue`. A `select` dispatches on the value's SHAPE: a string goes to `value_text`, an array to `value_json`.
- `src/lib/dal/field-value-sql.ts` — `fieldValueTextIlike` / `fieldValueTextEquals`: the shared text predicate for the two field-filter builders (`cards.ts`, `action-history.ts`), matching `value_text` **and** every element of a multi-select `value_json` array.
- `src/lib/db/schema/access-control.ts` — `field_definitions`, `field_values` tables.
- `src/components/card-types/fields/FieldEditor.tsx` — Slide-in panel, create/edit `FieldDefinitionDraft`.
- `src/components/card-types/fields/FieldList.tsx` — `@dnd-kit/core` drag-drop reorder.
- `src/components/card-types/fields/FieldTypeSelector.tsx` — 6-type visual grid. `onChange` is optional (safe to render from server components, `readOnly` mode available).
- `src/components/card-types/fields/ValidationRulesEditor.tsx` — Per-field validation toggle/config. Renders `getValidationRulesForFieldType`, so field-CONFIGURATION rules never appear here; returns `null` when a type has none (today: `select`) and the parent hides the heading with it.
- `src/components/card-types/fields/DefaultValueInput.tsx` — The "Valor por defecto" control, shaped by the field type (number input / date picker / Sí-No / the configured options). Exports `hasDefaultValue`, which is false for `photo` — the parent hides the label with it. Storage stays a `text` column, so each type serialises the way its own input already produces it. The date and dropdown variants carry an explicit clear button (`Clearable`): neither can be emptied on its own — Radix forbids an empty `SelectItem`, and a native date input fights being cleared.
- `src/components/card-types/fields/SelectOptionsEditor.tsx` — The `select` configuration panel: options added one at a time (add / rename inline / delete / drag-reorder via `@dnd-kit`), plus the `allowMultiple` switch. Duplicates rejected case-insensitively; the option string doubles as the dnd id.
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
| `photo`    | `value_text`    | Object key in the photo storage bucket — never a URL, and never sent to a client component: every card payload crossing that boundary strips it to a presence flag (`stripCardPhotoKeys`) and the photo is addressed by route. Only two server-side consumers still sign it — the card-design preview renderer and the external API (`signCardPhotos`) — plus `buildPhotoReadUrlMap` for the edit form's preview state. |
| `select`   | `value_text` **or** `value_json` | A single option is a string in `value_text`; several are a `string[]` in `value_json`. `mapValueToColumn` picks the column from the value's SHAPE, never from the field's `allowMultiple` rule — it only receives `fieldType`. `extractValue` returns `valueJson ?? valueText`. An emptied multi-select clears the row rather than storing `[]`. Text filters cover both columns via `field-value-sql.ts`. ADR `2026-09-08-multi-select-storage.md`. |

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
`cardPhotoRoute(code, { fieldDefinitionId, updatedAt })` — a stable,
session-authed route that mints the signature per request, so the image cannot
expire in place, the browser can cache it, and it survives a client-side refetch
that carries no URL. Without those props it falls back to treating `value` as a
ready-made URL. In both modes `value` is the presence signal (empty → dash).

Every card surface now uses the route — lists, card detail and `ActiveCardZone`
alike; only the external API and the card-detail server page (for the design
preview) still consume signed URLs, and neither goes through this component.

`updatedAt` is the **card's**, threaded from each view through
`DynamicFieldRenderer`, and serialises to `?v=`. It is what keeps a replaced
photo from being served out of the browser's cache, which matters because the
route now caches for days. See ADRs `2026-08-02-card-list-photos-stable-route.md`
and `2026-09-08-photo-cache-version-token.md`.

The thumbnail's longer side is capped at `--photo-thumbnail-size` (Layer-3 layout-chrome var in `globals.css`, currently `6rem`/96px), consumed as `max-h-[var(--photo-thumbnail-size)] max-w-[var(--photo-thumbnail-size)]`. Aspect ratio is always preserved (no crop, no stretch); `self-start` + `shrink-0` cancel the flex-stretch imposed by the parent `flex flex-col` wrapper in `CardDetailClient.tsx`. Both variants share a `THUMBNAIL_CLASS` constant so they cannot drift.

**The lightbox is opt-out.** By default (`enlargeable`, defaulting to `true`) clicking the thumbnail opens a shadcn `Dialog` with the full-size image (`max-h-[90vh] w-auto object-contain`); the `DialogContent` uses `w-fit` so the surface hugs the image (no black gutter for portrait photos). With `enlargeable={false}` the component renders a bare `<img>` — no handler, no `cursor-pointer`, no `aria-label` — so the click reaches whatever ancestor owns it. Both card list views pass `false`, because their row already navigates to the card detail; card detail keeps the default. See `modules/cards.md` → "Photo rendering in lists".

Thumbnails are `loading="lazy"` + `decoding="async"`. Each one costs a round trip to the photo route (session check + `getCardByCode` + a signature), so a 50-row list would otherwise spend 50 of them to paint the handful of rows on screen. This mitigates rather than removes the N+1 — the browser's prefetch margin is generous — and the batch endpoint noted in ADR `2026-08-02-card-list-photos-stable-route.md` remains the real fix if it ever matters.

`ActiveCardZone` renders its `photo` summary cell through `PhotoRenderer` in route mode, with a `className` override for the panel's two-row sizing — it stopped hand-rolling an `<img>` over a signed URL in ADR `2026-08-25-active-card-zone-stable-photo-route.md`. `ActivityFeedEntryRow` (36px `object-cover` avatar on scan rows) and `HistoryTableRow` (the Resumen column) still build a bare `<img>` from `cardPhotoRoute` rather than mounting `PhotoRenderer`, because the 6rem thumbnail and its lightbox are too heavy for a feed or audit row. All three pass the card's `updatedAt`. See `modules/dashboard.md` and `modules/history.md`.

### Photo download (named by card code)

The `PhotoRenderer` lightbox shows a **Descargar** button when the card `code` + `fieldDefinitionId` are supplied (threaded via `DynamicFieldRenderer`). In practice that means **the card detail page only**: the button lives inside the lightbox, and both list views disable it with `enlargeable={false}`. The href comes from `cardPhotoRoute(code, { fieldDefinitionId, updatedAt, download: true })`, which 302s to a signed URL whose `Content-Disposition` names the file `<code>_<fieldName>_<random>.<ext>`. The **stored object key is unchanged** (still random UUID); the `<random>` in the filename is that key's final segment, so a downloaded file is traceable back to its bucket object, and `<fieldName>` disambiguates multi-photo cards. Route + storage plumbing live in `infrastructure`. ADR `2026-07-19-webcam-capture-and-crop.md`.

### Select options — configuration, not validation

Options live inside `validation_rules.rules` (no dedicated `options` column), as `{ rule: "options", value: string[] }`, and `allowMultiple` beside them. **That is storage, not meaning**: both describe what the field IS, so the wizard edits them in `SelectOptionsEditor` and the «Reglas de validación» section is hidden for a `select` entirely. `FIELD_CONFIGURATION_RULES` names the split; both rules keep their `RULES_BY_FIELD_TYPE` + `VALIDATOR_REGISTRY` entries and are still enforced on submit. ADR `2026-09-08-select-options-are-configuration.md`.

Read them **only** via `getSelectOptions(validationRules)` / `getAllowMultiple(validationRules)` from `@/lib/validation/rules` — never by walking the jsonb inline. The rule names are exported alongside as `SELECT_OPTIONS_RULE` / `ALLOW_MULTIPLE_RULE` and are what `RULES_BY_FIELD_TYPE.select` and the `VALIDATOR_REGISTRY` keys both derive from, so the wizard that writes the options and every layer that reads them cannot desync. Consumers: `SelectInput` (card form), `FieldFilterBuilder` (card list + history filters), `validateAllowMultiple`, `SelectOptionsEditor`. See `modules/validations.md`.

⚠️ An inline read that misses returns `[]`, not an error — the failure surfaces as a silently empty dropdown, which is exactly how this went unnoticed in two layers at once.

**Counting rules for a badge** uses `countValidationRules(validationRules)`, which excludes the configuration rules. A select whose only content is its option list must not read «1 regla».

**Multiple selection.** `SelectInput` renders a shadcn `Select` when the field is single and a popover of checkboxes when `allowMultiple` is on, emitting `string[] | null` (never `[]`). `SelectRenderer` renders one chip per selection. Both read the SHAPE of the value, not the rule, so a field toggled back to single still shows what the card holds — the input coerces a stored array to its first item rather than blanking the control.

⚠️ **Four surfaces format a select value** and each has its own helper: `SelectRenderer` plus the `formatValue` / `formatFieldValue` functions in `HistoryTableRow`, `ActivityFeedEntryRow` and `ActiveCardZone`. All four handle an array; a fifth that does not would degrade to `String(["a","b"])` → `"a,b"` rather than erroring.

An option may contain **any** character, commas included. The previous editor was one comma-separated input that re-split on every keystroke, so `"Portal 1, bajo A"` was unstorable.

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
- `field_definitions.default_value` is **stored and displayed but never applied**: no card-creation path seeds `useCardForm`'s `initialValues` from it, so configuring a default changes nothing for the operator. `DefaultValueInput` now at least makes the configured value type-correct. Either wire it into `/cards/new` or drop the column.
- The two select columns are not mutually exclusive at the schema level. Nothing writes both (`mapValueToColumn` always nulls the rest), but a hand-written UPDATE could, and `value_json` would silently win.

## Recent changes

- 2026-09-08 — Multi-select implemented, after existing as an unusable rule since the engine was written. Storage dispatches on the value's shape (`value_text` for one option, `value_json` for several), so no migration and no existing row changed; `SelectInput` gained a checkbox-popover variant, `SelectRenderer` renders one chip per selection, the text filters gained a shared select-aware predicate, and snapshots freeze the selection SORTED with an array-aware `diffSnapshots`. New `__tests__/multi-select.test.ts` + `dal/__tests__/multi-select-filter.integration.test.ts` (the filter SQL is only provable against real Postgres). ADR `2026-09-08-multi-select-storage.md`.
- 2026-09-08 — Field editor layout fix, in two passes. The sheet used to span the whole content area with only its BODY capped at 720px, so the form sat against the left edge with ~600px of dead space beside it and the save button drifting off at the far right. The sheet ITSELF is now capped at `--field-editor-width` (64rem, a new Layer-3 layout-chrome var) and centred over the content area, with a `px-4` gutter as the narrow-screen fallback; one `px-7` padding box then aligns header, body and footer, so no inner max-widths are needed. Its height is also FIXED (`h-[min(85vh,46rem)]`) rather than content-driven — field types configure wildly different amounts (a `photo` has no rules, a `select` has an option list), so the panel used to resize and move the header and save button on every type change. Only the body scrolls; short content leaves whitespace. Measured in the browser: 1024×736 at the same offset for `text`, `photo`, `select` and `date`. Same pass added the clear button to the date default.
- 2026-09-08 — The "Valor por defecto" box stopped being free text for every type. `DefaultValueInput` renders a numeric input, a date picker, a Sí/No choice or the configured select options, and nothing at all for a `photo`; changing a field's type now clears the default as well as the rules, so «mañana» can no longer sit in a date field. The column stays `text`. ⚠️ Recorded above under Future considerations: nothing consumes `default_value` at card creation, so this makes the value correct, not effective.
- 2026-09-08 — A `select` field is now configured, not validated. `SelectOptionsEditor` replaces the comma-separated `string[]` input inside `ValidationRulesEditor`: options are added one at a time and each renders as its own row with inline rename, delete and drag-reorder. This fixes two things at once — a comma is now a legal character inside an option (the old input split on it, so `"Portal 1, bajo A"` silently became two options and the caret jumped on every keystroke), and the option list stopped being presented as a constraint on user input. `FIELD_CONFIGURATION_RULES` + `getValidationRulesForFieldType` express the split without touching the engine, so `select` yields an empty rules catalogue and `FieldEditor` drops the «Reglas de validación» heading for it. `countValidationRules` corrected the badges in `FieldList`, `ReviewStep`, `FieldDefinitionsStep` and the card-type detail page, which counted a select's options as validation rules. ADR `2026-09-08-select-options-are-configuration.md`.
- 2026-08-29 — Card date inputs no longer show today's date for a field that has no value. `DateInput` normalized with `String(value).slice(0, 10)`, but `value_date` is a `timestamp`, so the form receives a `Date` whose `String()` form (`"Thu Aug 27"`) is NOT a valid `<input type="date">` value: the browser discards it, the input renders blank while React still believes it holds a value, and the native picker — treating the control as unassigned — opens on and commits **today** at the first interaction, which the wholesale save then persists. Normalization moved to `toDateInputValue`, which formats a `Date` with LOCAL calendar components (never `toISOString()`: stored dates are midnights and UTC would shift them a day back) and maps anything unparseable to `""`. Affects `/cards/new` and `/cards/[code]/edit` — the only two surfaces reaching `DateInput`. Bug fix, no ADR.

_Pruned to the 5-entry cap. Still described above: the `?v=` photo cache token
(2026-09-08) under "Photo display", the shared `getSelectOptions`
accessor (2026-08-02) under "Select options", the `PhotoRenderer` lightbox
opt-out (2026-08-02) under "Photo display", `is_system` (2026-08-24) in the
`field_definitions` table, and the `is_required` scan-time consumer (2026-08-15)
in the same table._

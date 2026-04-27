# Module: card-designs

**Last updated**: 2026-04-27 · **Last feature**: Editor polish — auto-size text, in-editor preview with mocked data, starter templates, mandatory card-type on create

## Responsibility

Visual card design editor (Konva.js): creating, editing, and previewing card layout templates. Manages `card_designs` and `card_type_designs` tables. Supports data binding to field definitions and PNG export from the card detail page.

Does **not** own field definitions (see `fields`) or card type configuration (see `card-types`).

## Key files

- `src/lib/card-designs/types.ts` — `CardDesignLayout` V1 schema, node type union, `createDefaultLayout`, `isBindableNode`.
- `src/lib/card-designs/render.ts` — `renderDesignToDataURL()`: Canvas API renderer (all 6 node types, async image/QR/barcode loading, scale parameter).
- `src/lib/card-designs/mock-preview-data.ts` — `buildMockPreviewData()`: builds plausible sample `fieldValues` / `photoValues` keyed by every fieldDefinitionId across the linked card types, plus a sample card code; used by the in-editor preview.
- `src/lib/card-designs/templates.ts` — `SAMPLE_TEMPLATES` (3 starter layouts: photo card, event pass, passbook), `getTemplatesForKind`, `cloneTemplateLayout` (re-IDs nodes on apply).
- `src/lib/dal/card-designs.ts` — `listCardDesigns`, `getCardDesignById`, `createCardDesign`, `updateCardDesign`, `archiveCardDesign`, `duplicateCardDesign`, `linkDesignToCardType`, `unlinkDesignFromCardType`, `listDesignsForCardType`, `listCardTypesForDesign`, `getDesignLinkCounts`, `validateDesignAgainstCardType`.
- `src/lib/actions/card-designs.ts` — Server Actions for all CRUD, link/unlink, validation, and `listDesignsForCardTypeAction` (OPERATOR+).
- `src/app/(dashboard)/card-designs/page.tsx` — List view (MASTER). Parallel-fetches designs + link counts.
- `src/app/(dashboard)/card-designs/[id]/edit/page.tsx` — Editor shell (MASTER). Uses `nextDynamic` via loader wrapper.
- `src/components/card-designs/CardDesignListClient.tsx` — Client list with kind filter, archive, duplicate.
- `src/components/card-designs/NewDesignModal.tsx` — Create modal; auto-fills CR80 / passbook defaults on kind change. Requires the user to pick a card type and links the design via `linkDesignToCardTypeAction` immediately after create.
- `src/components/card-designs/CardDesignCard.tsx` — Design tile with action dropdown.
- `src/components/card-designs/editor/CardDesignEditorLoader.tsx` — Client boundary that wraps the `next/dynamic({ssr:false})` import (required by Turbopack).
- `src/components/card-designs/editor/CardDesignEditor.tsx` — Three-pane editor: state (layoutHistory, zoom, linkedCardTypes), undo/redo, link/unlink handlers, keyboard shortcuts. Hosts the toolbar Plantillas/Vista previa buttons and exposes `replaceCurrentLayout` so derived patches (e.g. text auto-resize) ride along with the user's history entry.
- `src/components/card-designs/editor/EditorCanvas.tsx` — Konva Stage + artboard Group; drag-drop, snap, Transformer, inline text overlay. Receives `availableFields` to label field-bound text (`resolveTextDisplay`) and runs an auto-size effect via `replaceCurrent`.
- `src/components/card-designs/editor/ElementPalette.tsx` — HTML5 drag source for 6 node types; double-click on an item calls `onAddCentered` to drop it in the canvas centre.
- `src/components/card-designs/editor/PropertiesPanel.tsx` — Right panel: canvas props + linked card types section (canvas view) / node props + data-source section (node selected). `NumberInput` accepts `decimals` (used by Posición y tamaño to round display to 3 places while keeping a draft string for fluid typing).
- `src/components/card-designs/editor/nodeFactory.ts` — `createNode(type, x, y, existingCount)` plus `NODE_DEFAULT_SIZE` and `getCenteredPosition(type, canvasW, canvasH)`.
- `src/components/card-designs/editor/snapUtils.ts` — `computeSnap()`: 5 px threshold against canvas edges/center and sibling bounds.
- `src/components/card-designs/editor/textMetrics.ts` — `measureText()` using a shared offscreen 2D canvas; powers text auto-resize on commit + on style/binding change.
- `src/components/card-designs/editor/TextEditOverlay.tsx` — Portal `<textarea>` positioned via the node's `getAbsolutePosition()`-derived screen rect, with floating ✓/✗ toolbar; Enter commits, Shift+Enter inserts newline, Escape cancels, click-outside commits.
- `src/components/card-designs/editor/TemplatePicker.tsx` — Modal listing kind-matched starter templates with `renderDesignToDataURL` thumbnails; confirms before replacing a non-empty design.
- `src/components/card-designs/CardDesignPreviewButton.tsx` — "Ver diseño" button on card detail; opens modal with no extra fetch.
- `src/components/card-designs/CardDesignPreviewModal.tsx` — Preview + "Descargar PNG" modal; renders on mount, closes on Escape/backdrop. Reused by the in-editor preview using `buildMockPreviewData`.
- `src/components/card-types/CardTypeLinkedDesigns.tsx` — Linked designs section on card-type detail; supports link/unlink per kind slot.

## Data model

### `card_designs`

| Column         | Notes                                                              |
| -------------- | ------------------------------------------------------------------ |
| `id`           | UUID PK                                                            |
| `tenant_id`    | FK → `tenants` cascade                                            |
| `name`         | Display name                                                       |
| `description`  | Optional                                                           |
| `kind`         | Enum: `card \| passbook`                                          |
| `width_units`  | Design width in `unit`                                            |
| `height_units` | Design height in `unit`                                           |
| `unit`         | Enum: `mm \| px`                                                  |
| `layout`       | jsonb — `CardDesignLayout` V1 (version field + canvas + nodes[]) |
| `is_active`    | Soft delete                                                        |

Default dimensions: CR80 card = 85.6 × 54 mm; passbook = 340 × 440 px.

### `card_type_designs`

| Column          | Notes                                                    |
| --------------- | -------------------------------------------------------- |
| `id`            | UUID PK                                                  |
| `tenant_id`     | Denormalized (no FK) for query efficiency                |
| `card_type_id`  | FK → `card_types` cascade                               |
| `card_design_id`| FK → `card_designs` cascade                             |
| `kind`          | Mirrors the design's kind at link time                   |
| `created_at`    |                                                          |

`UNIQUE(card_type_id, kind)` — one design per kind per card type.
**Hard-deleted on unlink** — the only join table in the schema without soft delete. Rationale: links carry no audit history; hard delete enables the `UNIQUE` constraint without partial indexes. See ADR `2026-04-26-card-design-konva.md`.

### `CardDesignLayout` V1 schema (jsonb)

```typescript
{
  version: 1,
  canvas: { width, height, unit, safeMargin: {top,right,bottom,left}, background },
  nodes: LayoutNode[]  // sorted by zIndex at render time
}
```

Node types: `text | image | qr | barcode128 | rect | line`.
Bindable nodes (text/image/qr/barcode128) have a `content` discriminated union:
- `{ source: "static", staticValue/staticUrl }` — fixed value
- `{ source: "field", fieldDefinitionId }` — resolved from linked card types
- `{ source: "card_code" }` — card's public code (text/qr/barcode128 only)

## Main flows

### Create design

`/card-designs` → `NewDesignModal` (loads card types via `listCardTypesAction`, requires one) → `createCardDesignAction` → `linkDesignToCardTypeAction` → `router.push(/card-designs/{id}/edit)`. If the link step fails (e.g. that card type already has a design of the same kind), the warning is surfaced and the user is still routed to the editor to resolve it.

### Edit layout

`/card-designs/[id]/edit` → server fetches design + linked card types → `CardDesignEditorLoader` → `CardDesignEditor`:
- Undo/redo: 10-step `layoutHistory[]` + `historyIndex`. `pushLayout` adds a new entry; `replaceCurrentLayout` rewrites the current entry in place (used for derived patches like text auto-resize so they don't pollute history).
- Drop: HTML5 drag from `ElementPalette` → `EditorCanvas` `onDrop` → `createNode` → `addNode`.
- Add centred: double-click on a palette item → `onAddCentered` → `getCenteredPosition` + `createNode` → `addNode`.
- Transform: Konva `Transformer` handles resize/rotate; `handleTransformEnd` resets scale to 1 and uses `Math.abs` so flips don't collapse a node.
- Snap guides: `computeSnap()` called on `handleDragMove`, cleared on `handleDragEnd`.
- Inline text edit: double-click → `TextEditOverlay` (portal positioned via `shape.getAbsolutePosition()`); on commit `EditorCanvas` re-measures via `measureText` and writes width/height alongside the new value in one history entry.
- Auto-size text: any change to a text node's font/family/multiline/overflow/static-value/field-binding (or to the bound field's label) triggers a measure → patch via `onNodeUpdate(..., { replaceCurrent: true })`. In wrap mode only height is auto-fit.
- Field name on canvas: bound text shows the field's label/name (`resolveTextDisplay`) instead of the legacy `[Campo]` placeholder.
- Save: `⌘S` / Ctrl+S or toolbar button → `updateCardDesignAction(id, { layout })`.

### Field data binding

In the properties panel (node selected), a "Fuente de datos" toggle sets `content.source`. Field selector lists `availableFields` — the intersection of field definitions across all linked card types, filtered by node-type compatibility:
- `text` ← text / number / date / boolean / select
- `image` ← photo
- `qr`, `barcode128` ← text / number / select

### In-editor preview (mocked data)

Toolbar **Vista previa** opens `CardDesignPreviewModal` populated by `buildMockPreviewData(availableFields)` — sample values per `FieldType` keyed by every field-definition ID, an inline-SVG photo placeholder, and `cardCode = "VRD-DEMO-0001"`. Same render pipeline as the production preview, no extra fetch.

### Starter templates

Toolbar **Plantillas** opens `TemplatePicker`, filtered to templates whose `kind` matches `design.kind`. Each tile previews via `renderDesignToDataURL` (scale 1, no field values). Apply → `cloneTemplateLayout` (fresh UUIDs) → `pushLayout` (one undo step). If the design already has nodes, a confirmation overlay warns before replacing.

### Link design ↔ card type

From **editor** (PropertiesPanel canvas view): inline picker using `listCardTypesAction`, then `linkDesignToCardTypeAction`. On success, `getCardTypeAction` fetches field definitions; `linkedCardTypes` state updates without page reload.

From **card-type detail** (`CardTypeLinkedDesigns`): two kind slots; inline picker using `listCardDesignsAction({ kind })`; `router.refresh()` re-fetches after mutation.

Unlink from either surface → `unlinkDesignFromCardTypeAction` (hard-deletes join row).

### PNG preview + export

`/cards/[code]` server component: parallel-fetches `listDesignsForCardType` → picks first `card` kind design → serialises `fieldValues` + `photoValues` from `card.fields` → passes to `CardDesignPreviewButton`.

On click → `CardDesignPreviewModal` mounts → `renderDesignToDataURL()`:
1. Computes canvas size = `layout dimensions × pxPerUnit × scale(2)`.
2. Parallel-loads all image / QR / barcode assets.
3. Draws all nodes sorted by `zIndex`.
4. Returns `data:image/png` URL → shown as `<img>`; "Descargar PNG" triggers `<a download>`.

Note: export uses the browser Canvas API, **not** `Stage.toDataURL()` — the Konva stage is only active inside the editor route, not on the card detail page.

## Extension points

- **New node type** → add to `LayoutNode` union (`types.ts`), `nodeFactory.ts` (incl. `NODE_DEFAULT_SIZE`), `EditorCanvas.tsx` switch, `PropertiesPanel.tsx` sections, `render.ts` `drawNode`.
- **New starter template** → append a `DesignTemplate` to `SAMPLE_TEMPLATES` in `templates.ts`. Use `static` content for user-customisable text/colour/logo and `card_code` for codes/QR/barcode so each issued card resolves them automatically.
- **Apple Wallet `.pkpass` export** → deferred; needs Apple Developer cert + PKCS#7 signing service. See ADR.
- **Layout versioning** → bump `version` field; add migration transform in `parseLayout()` in `CardDesignEditor.tsx`.
- **Multi-select in editor** → Konva `Transformer` already supports it; extend `selectedNodeId` to `selectedNodeIds[]`.

## Module interactions

- Reads from: `fields` (field definitions via `listCardTypesForDesign` + linked card type fetch), `card-types` (`listCardTypesAction` for link picker).
- Consumed by: `cards` (preview button on card detail page).
- Schema tables: `card_designs`, `card_type_designs` (both in `access-control.ts`).

## Open TODOs

- [ ] `TODO: pkpass` — Apple Wallet `.pkpass` generation (see ADR `2026-04-26-card-design-konva.md` deferred section).

## Recent changes

- 2026-04-27 — Editor polish: text auto-resize (`textMetrics.ts`) on commit + on style/binding change via new `replaceCurrent` history mode; field-bound text shows the field's label on canvas; Posición y tamaño rounds display to 3 decimals; double-click in `ElementPalette` adds the element centred; in-editor **Vista previa** with `buildMockPreviewData`; **Plantillas** picker (`TemplatePicker.tsx`) with 3 starter layouts (`templates.ts`); `NewDesignModal` now requires a card type and links it on create; misc bug fixes (Rules-of-Hooks split for `ImageShape`, `codeImages` cache GC, artboard-bg deselect, `Math.abs` on transform flip, corrected text overlay positioning math).
- 2026-04-27 — V1 complete: list + Konva editor (Phases 1–3), field binding (Phase 4), link/unlink from editor + card-type detail (Phase 5), PNG preview + export from card detail (Phase 6).

# ADR: Webcam capture + interactive crop for card photo fields

**Date**: 2026-07-19
**Status**: accepted
**Modules affected**: fields, cards, infrastructure (storage)

## Context

Photo-type card fields could only be populated by picking a file from disk.
Operators work on phones and tablets (responsive-first), where taking a photo
with the device camera and trimming it to the relevant region is the natural
flow. We wanted, on both the create-card and edit-card views and for every
photo field: (1) a second capture source using the camera, and (2) a crop step
after either source, before the image is committed. The existing photo path
already uploads at file-pick time through a shared `PhotoUploader` → presigned
PUT → `optimizeImage` (canvas resize / WebP / EXIF strip), storing a random
object key. A truly free-form (draggable-handles) cropper is non-trivial to get
right on touch; a battle-tested library was preferred over hand-rolling one.

## Decision

**Add `react-easy-crop`** (MIT, ~one component, no transitive deps) as the crop
UI, confirmed with the maintainer before install. Capture and crop are isolated,
reusable units wired into the single shared `PhotoUploader` so the create and
edit views share one code path:

- `useWebcamCapture` (`src/hooks/`) owns the `getUserMedia` lifecycle: rear
  camera preference (`facingMode: environment`), multi-camera switching,
  normalised error kinds (no-camera / permission-denied / insecure-context /
  unsupported / in-use), still capture to a PNG `File`, and guaranteed track
  release on capture, close, and unmount.
- `WebcamCaptureDialog` and `ImageCropDialog` (`src/components/shared/`) are the
  shadcn `Dialog`-based UIs. The cropper returns a source-pixel `cropRect`; the
  caller runs `optimizeImage(file, profile, { cropRect })` — the pipeline gained
  an optional `cropRect` that overrides the profile's automatic centre-crop.
- Capabilities are opt-in via `enableWebcam` / `enableCrop` props on
  `PhotoUploader`; only card photos (via `PhotoInput`) turn them on, so avatar /
  tenant-logo / card-design surfaces are unchanged.
- A `Slider` primitive was added to `src/components/ui/` for the zoom control,
  hand-written in the repo's convention (unified `radix-ui` import) rather than
  the shadcn CLI's per-package `@radix-ui/react-slider` import.

**"Free" aspect** means the source image's natural aspect ratio, not a
free-drag box: `react-easy-crop` is a pan/zoom-within-a-fixed-frame cropper with
no resize handles. Presets are `Free / 1:1 / 3:4`.

**Download naming.** The stored object key keeps its random UUID (no create-time
dependency on the card code, no rename-on-save plumbing). Downloads instead
name the file `<code>_<fieldName>_<random>.<ext>` via a signed
`Content-Disposition`, where `<random>`/`<ext>` are lifted from the object key's
final segment so a downloaded file traces straight back to its bucket object,
and `<fieldName>` disambiguates multi-photo cards. Delivered by extending the
existing `GET /api/photos/cards/[code]` route with opt-in `?field=…&download`
selectors (default inline behaviour unchanged).

## Consequences

- **Positive:** Camera capture + crop on every photo field, in both views, with
  zero duplicated logic (one shared uploader). Cropped output still flows
  through the one optimization pipeline (WebP / size cap / EXIF strip). Other
  photo surfaces are untouched. Downloaded photos are human-readable and
  traceable to storage.
- **Negative / trade-offs:** One new runtime dependency (`react-easy-crop`).
  "Free" is natural-aspect, not draggable-handles — a true free-form cropper
  would need a heavier custom component. `getUserMedia` requires a secure
  context (HTTPS or localhost); on plain-`http` origins the webcam surfaces a
  clear "insecure connection" message. Client-side cross-origin download
  renaming was avoided in favour of server-signed `Content-Disposition`.
- **Follow-ups:** The same webcam/crop capability can be switched on for member
  avatars or the card-design image kind by flipping the opt-in props. If true
  free-form cropping is ever required, only `ImageCropDialog` changes — the
  `cropRect` contract into `optimizeImage` stays.

## Alternatives considered

1. **Hand-rolled cropper (no dependency).** Full control and zero deps, but
   robust touch pan/zoom/pinch is easy to get subtly wrong; rejected for the
   mobile-operator UX.
2. **Konva (already installed).** Could power a draggable crop rect, but it is a
   heavy design-canvas library and clunky for a modal cropper with touch pinch.
3. **Rename the stored object to a code-based key on save.** Exact "name on
   save" and survives code edits, but needs a copy op added to the storage
   interface plus partial-failure handling under the Neon no-transaction
   constraint — more surface than the traceability goal required.

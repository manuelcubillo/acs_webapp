# ADR: Card Design Editor — Konva.js

**Date**: 2026-04-26
**Status**: accepted
**Modules affected**: card-designs (new), card-types, cards

## Context

Masters need a visual canvas editor to design card templates (badge-sized cards and passbook-style passes) and bind layout elements to the tenant's dynamic field definitions. The editor must support drag/drop, resize, snap guides, z-ordering, lock/duplicate, and undo/redo — capabilities that require either a retained-mode 2D canvas abstraction or significant hand-rolled math. Two leading options were evaluated: Konva.js (react-konva bindings) and Fabric.js. A hand-rolled SVG/canvas approach was also considered.

The feature also requires a PNG export path from the card detail page (rendering a design with a specific card's live field values). A third design kind — Apple Wallet `.pkpass` — is architecturally in scope but deferred because it requires an Apple Pass Type ID certificate and a PKCS#7 signing pipeline that is out of V1 scope.

## Decision

**Use Konva.js (`konva` + `react-konva`) for the canvas editor.** Konva's `Transformer` node provides resize handles, rotation, and multi-select out of the box. Its retained-mode graph makes hit-testing and z-order trivial. `Stage.toDataURL()` / `Stage.toBlob()` gives a direct PNG export path with a `pixelRatio` parameter for resolution scaling — no third-party rasterizer needed.

**Links in `card_type_designs` are hard-deleted on unlink** (the design itself is soft-deleted via `isActive`). This is the only join table in the schema that uses hard-delete, justified by: (1) links carry no audit-worthy history; (2) it enables a plain `UNIQUE(card_type_id, kind)` constraint for one-design-per-kind enforcement without partial index complexity; (3) the design's own soft-delete (`isActive = false`) is the durable record of archival.

**V1 exports PNG for both `card` and `passbook` kinds.** Real `.pkpass` generation is deferred to a follow-up (see Deferred below).

**QR and barcode rendering** uses `qrcode` (raster onto an off-screen canvas → Konva `Image`) and `jsbarcode` (same pattern). These are the two smallest purpose-built libs for their respective formats.

## Consequences

- **Positive:** Konva's `Transformer` eliminates ~800 lines of hand-rolled resize/rotate math. `Stage.toDataURL()` gives PNG export in ~10 lines. React integration via `react-konva` is idiomatic. Active community, MIT license.
- **Negative / trade-offs:** Adds ~200 KB to the client bundle (Konva). `react-konva` requires care at the React 19 / concurrent-mode boundary (use `Stage` inside a client component only, no Server Components). Canvas elements are not in the DOM, so inline text editing requires an HTML overlay portal (documented in Phase 3).
- **Follow-ups:** Real `.pkpass` signing needs an Apple Developer account, a Pass Type ID certificate, and a signing service (manifest.json + CMS/PKCS#7 detached signature). Track in a future ADR once certs are provisioned.

## Alternatives considered

1. **Fabric.js** — Richer built-in object model but significantly heavier bundle (~300 KB), less maintained React wrapper, and its own JSON serialization format that would couple the layout schema to the library version.
2. **Hand-rolled SVG canvas** — Full control, zero bundle cost, but requires implementing transformer math, hit-testing, snap guides, and PNG export from scratch — estimated 3–4× the implementation time for V1.
3. **Real `.pkpass` in V1** — Requires Apple Developer enrollment, certificate management, and a signing microservice. Deferred as a multi-day vertical slice outside V1 scope.

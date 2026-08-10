# ADR: Physical export size for card designs (centimetres at 300 DPI)

**Date**: 2026-08-06
**Status**: accepted
**Modules affected**: card-designs, cards, infrastructure

## Context

A design's `width_units` / `height_units` / `unit` describe the *artboard* the
editor draws on. They say nothing about how large the produced PNG should be
when someone downloads a card to print it: `renderDesignToDataURL` simply
multiplied the artboard px by a uniform `scale` of 2, so a CR80 design exported
at 648 × 408 px — far too coarse for a printer, and unrelated to any physical
size. Users needed to state "this card prints at 8.56 × 5.4 cm" without
disturbing the editor, the stored layout, or the on-screen preview, all of which
are calibrated around the existing artboard maths.

## Decision

Designs gained three columns on `card_designs` — `output_width_cm`,
`output_height_cm` (both NULL = legacy export) and `output_lock_aspect` — that
apply **only to the downloaded image**, rasterised at a fixed **300 DPI**
(`px = round(cm / 2.54 * 300)`). All conversion logic lives in the
dependency-free `src/lib/card-designs/export-size.ts`. `renderDesignToDataURL`
takes an optional `output` and, when present, drives the canvas with independent
axis scales (`ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0)`) instead of the
uniform `scale`.

## Consequences

- **Positive:** print-ready output at a stated physical size; the export path is
  now a single `resolveOutputRaster` decision rather than scattered arithmetic;
  QR/barcode assets rasterise at the scale they are drawn at, so they stay crisp;
  every existing design keeps NULL and exports byte-for-byte as before.
- **Negative / trade-offs:** with the padlock off, the two cm values are
  independent and the export **stretches** the artwork (non-uniform scale on
  text, QR and barcode). This is intentional and surfaced by the padlock's
  default-on state, but it means an unlocked design can produce a distorted QR
  that scanners may reject. 300 DPI is not configurable — a fourth column would
  be needed to make it so.
- **Follow-ups:** the cm values live outside the `layout` jsonb, so a future
  layout version bump does not have to carry them; a `.pkpass` or PDF exporter
  can reuse `export-size.ts` unchanged.

## Alternatives considered

- **Store the cm size inside the `layout` jsonb.** Rejected: the layout is
  versioned design *content*, and the export size is delivery metadata. Putting
  it there would force a layout migration and make the values unreadable from
  SQL without parsing JSON.
- **Change `width_units` / `height_units` to mean the print size.** Rejected:
  that is the artboard the editor, snapping and node coordinates are built on;
  redefining it would change every existing design's canvas.
- **Letterbox instead of stretch when unlocked.** Rejected: it silently produces
  an image that does not match the requested physical size, which is the one
  thing the feature promises. The padlock (on by default) is the guard against
  unwanted distortion.
- **Make DPI configurable.** Deferred: 300 DPI is the print standard, and a
  fourth column plus UI would buy little for the current use case.

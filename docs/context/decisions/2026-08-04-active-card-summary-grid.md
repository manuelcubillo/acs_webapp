# ADR: Configurable 3×3 summary grid for the last-scanned card

**Date**: 2026-08-04
**Status**: accepted
**Modules affected**: dashboard, card-types, infrastructure

## Context

`ActiveCardZone` — the "last scanned card" panel, the dashboard's focal surface — rendered `activeCard.fields.slice(0, 6)`: the first six fields that happened to hold a value, in field-definition order, with no way for a tenant to choose or arrange them. Masters wanted control per card type, including placing a photo prominently.

The obvious home for that configuration was `card_type_summary_fields`, which already stores a per-card-type field selection. But that table configures the **activity feed**, whose rows render every configured non-photo field inline with no cap (`ActivityFeedEntryRow`) and whose editor caps selection at 3. Reusing it would have coupled two surfaces with very different density budgets: widening the panel to 9 cells would have silently inflated every feed row to 9 inline `label: value` pairs. Capping the feed's rendering instead would have made which three fields it shows depend on where the master happened to place them in the grid.

A photo also needed to be able to occupy two rows, which is a spatial concept the feed has no use for.

## Decision

Store the panel layout in a **new, dedicated table** `card_type_active_zone_fields` (`tenant_id`, `card_type_id`, `field_definition_id`, `position` 0–8, `row_span` 1|2), leaving `card_type_summary_fields` and the entire feed path untouched.

The panel is a 3×3 grid, cells indexed 0–8 with `row = floor(position / 3)`, `col = position % 3`. A `photo` field may set `row_span = 2` to occupy its cell and the one directly below (`position + 3`), consuming 2 of the 9 positions. Scope is per card type; there is no tenant-wide count.

## Consequences

- **Positive:** "the activity feed is unchanged" is verifiable rather than merely intended — no feed file was touched and the DAL diff contains zero deletions. The two surfaces can evolve their density independently. Photo fields, which the feed silently discards, finally have somewhere to render.
- **Positive:** absence of rows is meaningful — an unconfigured card type keeps the pre-existing "first six fields with a value" panel, so the feature ships without blanking every tenant's dashboard until a master visits settings.
- **Negative / trade-offs:** the Dashboard settings tab now has two similar-looking per-card-type sections, and a master who wants a field in both the panel and the feed configures it twice. This was accepted as the price of decoupling.
- **Negative:** `position` uniqueness is enforced by a `UNIQUE(card_type_id, position)` constraint, but the *lower half* of a two-row photo cannot be expressed as a row, so that overlap is caught only by application logic (`validateActiveZoneLayout`) — the DB alone cannot reject it.
- **Follow-ups:** any future "show this field somewhere on the dashboard" feature should decide deliberately which table it belongs to. The geometry lives in one pure module (`src/lib/dashboard/active-zone-layout.ts`) shared by the editor and the Server Action, so rule changes happen in one place.

## Alternatives considered

- **Extend `card_type_summary_fields` with `row_span`** (the original plan). Rejected: it silently changes feed row density, because the feed renders every configured non-photo field with no cap.
- **Share the table but cap the feed at the first 3 non-photo fields by position.** Rejected: it keeps today's density but makes *which* three fields the feed shows a side effect of the panel's spatial arrangement — a surprising coupling to debug later.
- **Drag-and-drop editing with @dnd-kit**, as the card-type wizard uses for field order. Rejected for this surface: that is a 1-D list where drag position maps onto list index, while this grid is 2-D with variable-height cells. Span-aware drop targets and cross-axis collision handling are a lot of custom interaction for a rarely-touched configuration screen; a labelled `<Select>` per cell is keyboard- and screen-reader-correct via the Radix primitive with no custom key handling.

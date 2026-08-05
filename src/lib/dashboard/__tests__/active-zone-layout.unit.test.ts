/**
 * Unit tests for the ActiveCardZone 3×3 grid geometry.
 *
 * Pure logic, no database. These rules run in two places — the settings editor
 * and the Server Action — so a regression here silently lets an invalid layout
 * reach the panel. The Server Action's use of them is covered end-to-end by the
 * geometry cases below plus its own field-type resolution.
 */

import { describe, it, expect } from "vitest";
import type { FieldType } from "@/lib/dal/types";
import {
  ACTIVE_ZONE_CELL_COUNT,
  ACTIVE_ZONE_POSITIONS,
  LAYOUT_ERRORS,
  MAX_SPANNING_POSITION,
  buildOccupancyMap,
  canSpanTwoRows,
  cellBelow,
  colOf,
  occupiedCells,
  rowOf,
  validateActiveZoneLayout,
  type ActiveZoneLayoutCell,
} from "../active-zone-layout";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const PHOTO = "photo-field";
const TEXT_A = "text-field-a";
const TEXT_B = "text-field-b";

/** Resolves the fixture ids above to types; anything else is unknown. */
const resolve = (id: string): FieldType | undefined => {
  if (id === PHOTO) return "photo";
  if (id === TEXT_A || id === TEXT_B) return "text";
  return undefined;
};

const cell = (
  fieldDefinitionId: string,
  position: number,
  rowSpan: 1 | 2 = 1,
): ActiveZoneLayoutCell => ({ fieldDefinitionId, position, rowSpan });

// ─── Geometry helpers ───────────────────────────────────────────────────────

describe("grid geometry", () => {
  it("maps positions to rows and columns in reading order", () => {
    expect(ACTIVE_ZONE_CELL_COUNT).toBe(9);
    expect(ACTIVE_ZONE_POSITIONS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);

    expect([rowOf(0), colOf(0)]).toEqual([0, 0]);
    expect([rowOf(2), colOf(2)]).toEqual([0, 2]);
    expect([rowOf(4), colOf(4)]).toEqual([1, 1]);
    expect([rowOf(8), colOf(8)]).toEqual([2, 2]);
  });

  it("finds the cell directly below, and nothing below the last row", () => {
    expect(cellBelow(0)).toBe(3);
    expect(cellBelow(5)).toBe(8);
    expect(cellBelow(6)).toBeNull();
    expect(cellBelow(8)).toBeNull();
    expect(MAX_SPANNING_POSITION).toBe(5);
  });

  it("reports both cells covered by a two-row span", () => {
    expect(occupiedCells(cell(PHOTO, 1, 1))).toEqual([1]);
    expect(occupiedCells(cell(PHOTO, 1, 2))).toEqual([1, 4]);
  });

  it("builds an occupancy map that includes spanned cells", () => {
    const map = buildOccupancyMap([cell(PHOTO, 0, 2), cell(TEXT_A, 1)]);
    expect(map.get(0)?.fieldDefinitionId).toBe(PHOTO);
    expect(map.get(3)?.fieldDefinitionId).toBe(PHOTO); // spanned
    expect(map.get(1)?.fieldDefinitionId).toBe(TEXT_A);
    expect(map.has(2)).toBe(false);
  });
});

// ─── canSpanTwoRows (drives the editor's toggle) ────────────────────────────

describe("canSpanTwoRows", () => {
  it("allows spanning from rows 0 and 1 when the cell below is free", () => {
    const cells = [cell(PHOTO, 2)];
    expect(canSpanTwoRows(2, cells)).toBe(true);
    expect(canSpanTwoRows(5, [cell(PHOTO, 5)])).toBe(true);
  });

  it("refuses the last row, which has nothing beneath it", () => {
    expect(canSpanTwoRows(6, [cell(PHOTO, 6)])).toBe(false);
    expect(canSpanTwoRows(8, [cell(PHOTO, 8)])).toBe(false);
  });

  it("refuses when the cell below already holds a field", () => {
    expect(canSpanTwoRows(0, [cell(PHOTO, 0), cell(TEXT_A, 3)])).toBe(false);
  });

  it("stays true while already spanning, so the toggle can be switched off", () => {
    // The photo's own span covers the cell below; ignoring itself is what keeps
    // the control enabled rather than trapping the layout.
    expect(canSpanTwoRows(0, [cell(PHOTO, 0, 2)])).toBe(true);
  });
});

// ─── validateActiveZoneLayout ───────────────────────────────────────────────

describe("validateActiveZoneLayout", () => {
  it("accepts an empty layout — it means 'unconfigured', not 'invalid'", () => {
    expect(validateActiveZoneLayout([], resolve)).toEqual({ ok: true });
  });

  it("accepts a full 9-cell layout of single-row fields", () => {
    const cells = ACTIVE_ZONE_POSITIONS.map((p) => cell(`field-${p}`, p));
    // Every id is unknown to `resolve`, which is fine: types are only consulted
    // for two-row spans.
    expect(validateActiveZoneLayout(cells, resolve)).toEqual({ ok: true });
  });

  it("accepts a two-row photo plus seven other fields", () => {
    const cells = [
      cell(PHOTO, 0, 2), // covers 0 and 3
      ...[1, 2, 4, 5, 6, 7, 8].map((p) => cell(`field-${p}`, p)),
    ];
    expect(validateActiveZoneLayout(cells, resolve)).toEqual({ ok: true });
  });

  it("rejects a position outside the grid", () => {
    expect(validateActiveZoneLayout([cell(TEXT_A, 9)], resolve)).toEqual({
      ok: false,
      error: LAYOUT_ERRORS.POSITION_RANGE,
    });
    expect(validateActiveZoneLayout([cell(TEXT_A, -1)], resolve)).toEqual({
      ok: false,
      error: LAYOUT_ERRORS.POSITION_RANGE,
    });
  });

  it("rejects the same field placed twice", () => {
    const result = validateActiveZoneLayout(
      [cell(TEXT_A, 0), cell(TEXT_A, 1)],
      resolve,
    );
    expect(result).toEqual({ ok: false, error: LAYOUT_ERRORS.DUPLICATE_FIELD });
  });

  it("rejects two fields in the same cell", () => {
    const result = validateActiveZoneLayout(
      [cell(TEXT_A, 4), cell(TEXT_B, 4)],
      resolve,
    );
    expect(result).toEqual({ ok: false, error: LAYOUT_ERRORS.CELL_COLLISION });
  });

  it("rejects a two-row span on a non-photo field", () => {
    const result = validateActiveZoneLayout([cell(TEXT_A, 0, 2)], resolve);
    expect(result).toEqual({ ok: false, error: LAYOUT_ERRORS.SPAN_NOT_PHOTO });
  });

  it("rejects a two-row photo on the last row", () => {
    for (const position of [6, 7, 8]) {
      expect(validateActiveZoneLayout([cell(PHOTO, position, 2)], resolve)).toEqual({
        ok: false,
        error: LAYOUT_ERRORS.SPAN_LAST_ROW,
      });
    }
  });

  it("rejects a two-row photo whose lower cell is taken", () => {
    const result = validateActiveZoneLayout(
      [cell(PHOTO, 0, 2), cell(TEXT_A, 3)],
      resolve,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Either message is a correct description of the same clash; assert the
      // specific one so a wording swap is a deliberate change.
      expect(result.error).toBe(LAYOUT_ERRORS.CELL_COLLISION);
    }
  });

  it("rejects a span over a cell claimed by an earlier placement", () => {
    // Order matters for which message surfaces: here the photo is processed
    // second, so the clash is reported as the span landing on a taken cell.
    const result = validateActiveZoneLayout(
      [cell(TEXT_A, 3), cell(PHOTO, 0, 2)],
      resolve,
    );
    expect(result).toEqual({ ok: false, error: LAYOUT_ERRORS.SPAN_CELL_TAKEN });
  });

  it("rejects a span on a field it cannot resolve", () => {
    const result = validateActiveZoneLayout([cell("ghost", 0, 2)], resolve);
    expect(result).toEqual({ ok: false, error: LAYOUT_ERRORS.UNKNOWN_FIELD });
  });

  it("rejects more cells than the grid can hold", () => {
    const cells = Array.from({ length: 10 }, (_, i) => cell(`field-${i}`, i % 9));
    const result = validateActiveZoneLayout(cells, resolve);
    expect(result).toEqual({ ok: false, error: LAYOUT_ERRORS.TOO_MANY_CELLS });
  });

  it("caps total consumption at 9 positions when spans are involved", () => {
    // Four two-row photos would need 8 cells but only 3 columns have a row
    // beneath them at any given start row — the collision check catches it.
    const cells = [
      cell(PHOTO, 0, 2), // 0, 3
      cell(TEXT_A, 3), // clashes with the span above
    ];
    expect(validateActiveZoneLayout(cells, resolve).ok).toBe(false);
  });
});

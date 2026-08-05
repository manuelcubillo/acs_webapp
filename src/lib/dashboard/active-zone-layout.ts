/**
 * ActiveCardZone grid geometry — the single source of truth for the 3×3 layout.
 *
 * Pure TypeScript with no server or React dependency, so the settings editor and
 * the Server Action run the SAME rules. The backend remains authoritative
 * (foundation constraint #8): the editor uses this to keep invalid states
 * unreachable, and the action uses it to reject anything that arrives anyway.
 *
 * Grid model — 3 columns × 3 rows, cells indexed 0..8:
 *
 *   ┌───┬───┬───┐
 *   │ 0 │ 1 │ 2 │      row = Math.floor(position / 3)
 *   ├───┼───┼───┤      col = position % 3
 *   │ 3 │ 4 │ 5 │
 *   ├───┼───┼───┤
 *   │ 6 │ 7 │ 8 │
 *   └───┴───┴───┘
 *
 * A `photo` field may span two rows: it occupies its own cell and the cell
 * directly BELOW it (`position + 3`, same column), consuming 2 of the 9
 * positions. That is only geometrically possible from rows 0 and 1, hence the
 * `position <= 5` rule.
 *
 * See ADR 2026-08-04-active-card-summary-grid.md.
 */

import type { FieldType } from "@/lib/dal/types";

// ─── Grid dimensions ────────────────────────────────────────────────────────

export const ACTIVE_ZONE_COLUMNS = 3;
export const ACTIVE_ZONE_ROWS = 3;
export const ACTIVE_ZONE_CELL_COUNT = ACTIVE_ZONE_COLUMNS * ACTIVE_ZONE_ROWS;

/** Highest position from which a two-row span still has a row beneath it. */
export const MAX_SPANNING_POSITION =
  ACTIVE_ZONE_CELL_COUNT - ACTIVE_ZONE_COLUMNS - 1; // 5

/** Every addressable cell index, in reading order. Handy for rendering. */
export const ACTIVE_ZONE_POSITIONS: readonly number[] = Array.from(
  { length: ACTIVE_ZONE_CELL_COUNT },
  (_, i) => i,
);

// ─── Cell shape ─────────────────────────────────────────────────────────────

/** A single cell assignment. Matches the Server Action's payload entry. */
export interface ActiveZoneLayoutCell {
  fieldDefinitionId: string;
  position: number;
  rowSpan: 1 | 2;
}

/**
 * Resolves a field definition id to its type. The layout rules need it to
 * enforce that only `photo` fields span two rows, and the two callers resolve
 * it from different places (the editor from its in-memory field list, the
 * action from the database).
 */
export type FieldTypeResolver = (
  fieldDefinitionId: string,
) => FieldType | undefined;

// ─── Geometry helpers ───────────────────────────────────────────────────────

/** Row index (0-based) of a cell position. */
export function rowOf(position: number): number {
  return Math.floor(position / ACTIVE_ZONE_COLUMNS);
}

/** Column index (0-based) of a cell position. */
export function colOf(position: number): number {
  return position % ACTIVE_ZONE_COLUMNS;
}

/** The cell directly below `position`, or null when on the last row. */
export function cellBelow(position: number): number | null {
  const below = position + ACTIVE_ZONE_COLUMNS;
  return below < ACTIVE_ZONE_CELL_COUNT ? below : null;
}

/**
 * Every cell a placement physically covers: its own position, plus the one
 * below it when it spans two rows.
 */
export function occupiedCells(cell: ActiveZoneLayoutCell): number[] {
  if (cell.rowSpan !== 2) return [cell.position];
  const below = cellBelow(cell.position);
  return below === null ? [cell.position] : [cell.position, below];
}

/**
 * Map of cell index → the layout entry covering it, spanned cells included.
 * The editor uses this to decide what to draw (and grey out) in each cell.
 */
export function buildOccupancyMap(
  cells: readonly ActiveZoneLayoutCell[],
): Map<number, ActiveZoneLayoutCell> {
  const map = new Map<number, ActiveZoneLayoutCell>();
  for (const cell of cells) {
    for (const pos of occupiedCells(cell)) {
      map.set(pos, cell);
    }
  }
  return map;
}

/**
 * Whether a photo at `position` may be toggled to span two rows, given the rest
 * of the layout. Used to enable/disable the "Ocupar dos filas" toggle.
 *
 * @param position - Cell the photo currently occupies.
 * @param cells    - The full layout, INCLUDING the photo being tested.
 */
export function canSpanTwoRows(
  position: number,
  cells: readonly ActiveZoneLayoutCell[],
): boolean {
  if (position > MAX_SPANNING_POSITION) return false;
  const below = cellBelow(position);
  if (below === null) return false;

  // The cell below must be free — ignoring the tested cell itself, whose own
  // span is exactly what we are deciding about.
  const others = cells.filter((c) => c.position !== position);
  return !buildOccupancyMap(others).has(below);
}

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * User-facing layout errors. Spanish, matching the rest of the settings
 * surface; declared here as constants so they are i18n-ready (foundation
 * constraint #15).
 */
export const LAYOUT_ERRORS = {
  POSITION_RANGE: "Cada campo debe ocupar una celda entre 1 y 9.",
  DUPLICATE_FIELD: "Un mismo campo no puede aparecer dos veces en la cuadrícula.",
  CELL_COLLISION: "Dos campos no pueden ocupar la misma celda.",
  SPAN_NOT_PHOTO: "Solo un campo de tipo foto puede ocupar dos filas.",
  SPAN_LAST_ROW: "Un campo de la última fila no puede ocupar dos filas.",
  SPAN_CELL_TAKEN:
    "La celda inferior ya está ocupada: libérala para que la foto ocupe dos filas.",
  UNKNOWN_FIELD: "La cuadrícula referencia un campo que ya no existe.",
  TOO_MANY_CELLS: "La cuadrícula admite un máximo de 9 celdas.",
} as const;

export type LayoutValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Validate a complete layout. Returns the FIRST problem found — the editor
 * prevents invalid states anyway, so this is a guard rather than a form
 * validator that must report every fault at once.
 *
 * Rules (mirrors the acceptance criteria):
 *   1. position ∈ [0, 8].
 *   2. A field appears at most once.
 *   3. No two placements cover the same cell, spans included.
 *   4. rowSpan 2 requires a `photo` field, position <= 5, and a free cell below.
 *   5. At most 9 positions consumed in total (a span consumes 2).
 *
 * An empty layout is VALID and meaningful: it means "unconfigured", which the
 * panel renders as its legacy fallback rather than as a blank grid.
 *
 * @param cells        - The layout to check.
 * @param resolveType  - Resolves a field id to its type, for the photo rule.
 */
export function validateActiveZoneLayout(
  cells: readonly ActiveZoneLayoutCell[],
  resolveType: FieldTypeResolver,
): LayoutValidationResult {
  if (cells.length > ACTIVE_ZONE_CELL_COUNT) {
    return { ok: false, error: LAYOUT_ERRORS.TOO_MANY_CELLS };
  }

  const seenFields = new Set<string>();
  const covered = new Set<number>();

  for (const cell of cells) {
    // 1. Position within the grid.
    if (
      !Number.isInteger(cell.position) ||
      cell.position < 0 ||
      cell.position >= ACTIVE_ZONE_CELL_COUNT
    ) {
      return { ok: false, error: LAYOUT_ERRORS.POSITION_RANGE };
    }

    // 2. One cell per field.
    if (seenFields.has(cell.fieldDefinitionId)) {
      return { ok: false, error: LAYOUT_ERRORS.DUPLICATE_FIELD };
    }
    seenFields.add(cell.fieldDefinitionId);

    // 4. Two-row spans are photo-only and need room below.
    if (cell.rowSpan === 2) {
      const fieldType = resolveType(cell.fieldDefinitionId);
      if (fieldType === undefined) {
        return { ok: false, error: LAYOUT_ERRORS.UNKNOWN_FIELD };
      }
      if (fieldType !== "photo") {
        return { ok: false, error: LAYOUT_ERRORS.SPAN_NOT_PHOTO };
      }
      if (cell.position > MAX_SPANNING_POSITION) {
        return { ok: false, error: LAYOUT_ERRORS.SPAN_LAST_ROW };
      }
    }

    // 3 + 5. Claim every cell this placement covers; a clash is a collision.
    // Because all claims land in the 0..8 grid, this also caps total
    // consumption at 9 positions without a separate count.
    for (const pos of occupiedCells(cell)) {
      if (covered.has(pos)) {
        return {
          ok: false,
          error:
            cell.rowSpan === 2 && pos !== cell.position
              ? LAYOUT_ERRORS.SPAN_CELL_TAKEN
              : LAYOUT_ERRORS.CELL_COLLISION,
        };
      }
      covered.add(pos);
    }
  }

  return { ok: true };
}

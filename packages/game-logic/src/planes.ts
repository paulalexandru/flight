import type { Cell, PlaneOrientation, PlanePlacement } from "@flight/types";
import { isWithinBoard } from "./board";

/**
 * Forma clasică de avion din jocul "Avioane", ca offset-uri relative
 * la celula "cap" (head), orientată spre Nord (în sus).
 *
 *   . . X . .
 *   . X X X .
 *   X X X X X
 *   . . X . .
 *   . . X . .
 *
 * Head = celula din vârf (fuselaj față).
 */
const PLANE_SHAPE_NORTH: Cell[] = [
  { row: 0, col: 2 },
  { row: 1, col: 1 },
  { row: 1, col: 2 },
  { row: 1, col: 3 },
  { row: 2, col: 0 },
  { row: 2, col: 1 },
  { row: 2, col: 2 },
  { row: 2, col: 3 },
  { row: 2, col: 4 },
  { row: 3, col: 2 },
  { row: 4, col: 2 },
];

function rotateOffset(offset: Cell, orientation: PlaneOrientation): Cell {
  const { row, col } = offset;
  switch (orientation) {
    case "N":
      return { row, col };
    case "S":
      return { row: 4 - row, col: 4 - col };
    case "E":
      return { row: col, col: 4 - row };
    case "W":
      return { row: 4 - col, col: row };
  }
}

/** Returnează celulele absolute ocupate de un avion, date fiind poziția capului și orientarea. */
export function getPlaneCells(placement: PlanePlacement): Cell[] {
  return PLANE_SHAPE_NORTH.map((offset) => {
    const rotated = rotateOffset(offset, placement.orientation);
    return {
      row: placement.head.row + rotated.row - 2,
      col: placement.head.col + rotated.col - 2,
    };
  });
}

export function isValidPlanePlacement(
  placement: PlanePlacement,
  occupiedCells: Set<string>,
  cellKey: (cell: Cell) => string
): boolean {
  const cells = getPlaneCells(placement);
  return cells.every((cell) => isWithinBoard(cell) && !occupiedCells.has(cellKey(cell)));
}

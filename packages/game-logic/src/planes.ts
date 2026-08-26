import type { Cell, PlaneOrientation, PlanePlacement } from "@flight/types";
import { cellKey, isWithinBoard } from "./board";

/**
 * Forma avionului, ca offset-uri relative la celula "cap" (head = (0,0)),
 * orientată spre Nord (capul sus, corpul se extinde în jos):
 *
 *   . X X X .
 *   . . X . .
 *   X X X X X
 *   . . X . .   <- head (0,0)
 *
 * (echivalent cu a2,a3,a4 / b3 / c1,c2,c3,c4,c5 / d3=head, indexate de la 0)
 */
const PLANE_OFFSETS_NORTH: Cell[] = [
  { row: -3, col: -1 },
  { row: -3, col: 0 },
  { row: -3, col: 1 },
  { row: -2, col: 0 },
  { row: -1, col: -2 },
  { row: -1, col: -1 },
  { row: -1, col: 0 },
  { row: -1, col: 1 },
  { row: -1, col: 2 },
  { row: 0, col: 0 },
];

function rotateOffset(offset: Cell, orientation: PlaneOrientation): Cell {
  const { row, col } = offset;
  switch (orientation) {
    case "N":
      return { row, col };
    case "S":
      return { row: -row, col: -col };
    case "E":
      return { row: col, col: -row };
    case "W":
      return { row: -col, col: row };
  }
}

/** Returnează offset-urile avionului (relative la head=(0,0)) pentru o orientare dată. */
export function getPlaneShape(orientation: PlaneOrientation): Cell[] {
  return PLANE_OFFSETS_NORTH.map((offset) => rotateOffset(offset, orientation));
}

/** Returnează celulele absolute ocupate de un avion, date fiind poziția capului și orientarea. */
export function getPlaneCells(placement: PlanePlacement): Cell[] {
  return getPlaneShape(placement.orientation).map((offset) => ({
    row: placement.head.row + offset.row,
    col: placement.head.col + offset.col,
  }));
}

/** Toate celulele ocupate de o listă de avioane, opțional excluzând unul dintre ele (ex: cel mutat). */
export function getOccupiedCellKeys(planes: PlanePlacement[], excludePlaneId?: string): Set<string> {
  const keys = new Set<string>();
  for (const plane of planes) {
    if (plane.id === excludePlaneId) continue;
    for (const cell of getPlaneCells(plane)) {
      keys.add(cellKey(cell));
    }
  }
  return keys;
}

/** Verifică dacă un avion e complet pe tablă și nu se suprapune cu celule deja ocupate. */
export function isValidPlanePlacement(placement: PlanePlacement, occupiedCells: Set<string>): boolean {
  const cells = getPlaneCells(placement);
  return cells.every((cell) => isWithinBoard(cell) && !occupiedCells.has(cellKey(cell)));
}

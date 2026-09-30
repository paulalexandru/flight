import {
  BOARD_SIZE,
  cellKey,
  getOccupiedCellKeys,
  getPlaneCells,
  isValidPlanePlacement,
  isWithinBoard,
} from "@flight/game-logic";
import type { Cell, PlaneOrientation, PlanePlacement } from "@flight/types";

const ORIENTATIONS: PlaneOrientation[] = ["N", "E", "S", "W"];

export interface PuzzleState {
  /** Avionul-țintă (real, ascuns) - capul lui e soluția puzzle-ului. */
  plane: PlanePlacement;
  /** Toate avioanele generate pe tablă (țintă + eventuale avioane deja "scufundate" complet). */
  allPlanes: PlanePlacement[];
  /** Celulele din corpul avionului-țintă (fără cap) arătate deja ca "lovite". */
  revealedBodyCells: Cell[];
  /** Celulele altor avioane deja complet descoperite (corp, fără cap - capul lor separat). */
  otherPlanesBodyCells: Cell[];
  /** Capetele altor avioane deja complet descoperite. */
  otherPlanesHeadCells: Cell[];
  /** Celule "ratate" (fără avion), ca într-o partidă reală în desfășurare. */
  missCells: Cell[];
}

function randomOrientation(): PlaneOrientation {
  return ORIENTATIONS[Math.floor(Math.random() * ORIENTATIONS.length)];
}

function randomCell(): Cell {
  return { row: Math.floor(Math.random() * BOARD_SIZE), col: Math.floor(Math.random() * BOARD_SIZE) };
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Generează un set de N avioane aleatorii, fără suprapuneri, toate complet pe tablă. */
function generateRandomPlanes(count: number): PlanePlacement[] {
  const MAX_TRIES_PER_PLANE = 300;
  const result: PlanePlacement[] = [];
  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let tries = 0; tries < MAX_TRIES_PER_PLANE; tries++) {
      const candidate: PlanePlacement = {
        id: `puzzle-plane-${i}`,
        head: randomCell(),
        orientation: randomOrientation(),
      };
      const occupied = getOccupiedCellKeys(result);
      if (isValidPlanePlacement(candidate, occupied)) {
        result.push(candidate);
        placed = true;
        break;
      }
    }
    if (!placed) break;
  }
  return result;
}

/** Numără câte plasări posibile ale avionului-țintă (orice cap + orientare) sunt
 * compatibile cu TOATE constrângerile cunoscute: celulele deja dezvăluite din
 * corpul lui trebuie incluse (fără a cădea pe cap), iar plasarea nu poate atinge
 * nicio celulă deja ocupată de alte avioane sau marcată ca "ratată". */
function countMatchingPlacements(revealedKeys: string[], blockedKeys: Set<string>): number {
  let count = 0;
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      for (const orientation of ORIENTATIONS) {
        const candidate: PlanePlacement = { id: "", head: { row, col }, orientation };
        const cells = getPlaneCells(candidate);
        if (!cells.every(isWithinBoard)) continue;
        const headKey = cellKey(candidate.head);
        const cellKeys = new Set(cells.map(cellKey));
        if (cells.some((c) => blockedKeys.has(cellKey(c)))) continue;
        const allRevealedInside = revealedKeys.every((k) => cellKeys.has(k) && k !== headKey);
        if (allRevealedInside) count++;
      }
      if (count > 1) return count; // early exit, nu mai are rost să numărăm exact
    }
  }
  return count;
}

/**
 * Generează un puzzle nou care simulează o situație reală de joc: pe tablă pot
 * exista și alte avioane deja complet descoperite (ca niște avioane "scufundate"),
 * plus câteva celule ratate răzlețe - exact ca într-o partidă în desfășurare.
 * Din avionul-țintă dezvăluim progresiv celule din corp (fără cap), ținând cont
 * de TOATE aceste indicii (alte avioane + ratări), până când capul avionului-țintă
 * devine unica soluție posibilă pe toată tabla. Astfel jucătorul poate întotdeauna
 * deduce cu certitudine unde e capul, dintr-un singur click.
 */
export function generatePuzzle(): PuzzleState {
  const MAX_TRIES = 500;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    // Cu o probabilitate rezonabilă, adăugăm și alte 1-2 avioane deja "scufundate"
    // pe tablă, ca indicii suplimentare / distractoare realiste.
    const extraPlanesCount = Math.random() < 0.7 ? (Math.random() < 0.5 ? 1 : 2) : 0;
    const planes = generateRandomPlanes(1 + extraPlanesCount);
    if (planes.length === 0) continue;

    const targetIndex = Math.floor(Math.random() * planes.length);
    const targetPlane = planes[targetIndex];
    const otherPlanes = planes.filter((_, i) => i !== targetIndex);

    const targetCells = getPlaneCells(targetPlane);
    const targetBodyCells = targetCells.filter(
      (c) => !(c.row === targetPlane.head.row && c.col === targetPlane.head.col)
    );

    const otherPlanesBodyCells: Cell[] = [];
    const otherPlanesHeadCells: Cell[] = [];
    for (const plane of otherPlanes) {
      const cells = getPlaneCells(plane);
      const bodyCells = cells.filter((c) => !(c.row === plane.head.row && c.col === plane.head.col));
      // Celelalte avioane nu sunt neapărat complet descoperite - arătăm mereu
      // capul lor (deja "găsit"), dar doar un subset aleatoriu din corp (poate
      // fi de la 1 celulă până la tot corpul), ca o partidă reală în desfășurare.
      const revealCount = 1 + Math.floor(Math.random() * bodyCells.length);
      const revealedBody = shuffle(bodyCells).slice(0, revealCount);
      otherPlanesHeadCells.push(plane.head);
      otherPlanesBodyCells.push(...revealedBody);
    }

    // Celulele ocupate de TOATE avioanele (țintă + altele) - o "ratare" nu poate
    // cădea niciodată pe niciuna dintre ele, la fel cum o plasare alternativă a
    // avionului-țintă nu poate suprapune avioanele deja descoperite.
    const allOccupiedKeys = getOccupiedCellKeys(planes);

    // Câteva celule "ratate" răzlețe, ca indicii suplimentare de context (pe
    // celule cu adevărat goale, fără niciun avion).
    const emptyCells: Cell[] = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const key = cellKey({ row, col });
        if (!allOccupiedKeys.has(key)) emptyCells.push({ row, col });
      }
    }
    const missCount = Math.min(emptyCells.length, Math.floor(Math.random() * 6) + 2);
    const missCells = shuffle(emptyCells).slice(0, missCount);

    // Blocaj pentru plasările alternative ale avionului-țintă: orice celulă deja
    // ocupată de alte avioane, plus celulele ratate cunoscute.
    const blockedKeys = new Set<string>();
    for (const plane of otherPlanes) {
      for (const c of getPlaneCells(plane)) blockedKeys.add(cellKey(c));
    }
    for (const c of missCells) blockedKeys.add(cellKey(c));

    const shuffledBody = shuffle(targetBodyCells);
    const revealed: Cell[] = [];
    let solved = false;
    for (const cell of shuffledBody) {
      revealed.push(cell);
      const matches = countMatchingPlacements(revealed.map(cellKey), blockedKeys);
      if (matches === 1) {
        solved = true;
        break;
      }
    }

    if (solved) {
      return {
        plane: targetPlane,
        allPlanes: planes,
        revealedBodyCells: revealed,
        otherPlanesBodyCells,
        otherPlanesHeadCells,
        missCells,
      };
    }
    // Dacă am dezvăluit tot corpul țintei și tot nu e unic (foarte rar), încercăm din nou.
  }

  // Fallback extrem de improbabil: un singur avion simplu, tot corpul dezvăluit.
  const head = { row: 3, col: 3 };
  const orientation: PlaneOrientation = "N";
  const plane: PlanePlacement = { id: "puzzle-plane", head, orientation };
  const cells = getPlaneCells(plane);
  const bodyCells = cells.filter((c) => !(c.row === head.row && c.col === head.col));
  return {
    plane,
    allPlanes: [plane],
    revealedBodyCells: bodyCells,
    otherPlanesBodyCells: [],
    otherPlanesHeadCells: [],
    missCells: [],
  };
}

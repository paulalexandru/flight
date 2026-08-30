import { BOARD_SIZE, cellKey, getPlaneCells, getPlaneShape, isWithinBoard } from "@flight/game-logic";
import type { Cell, PlaneOrientation, PlanePlacement, ShotResult } from "@flight/types";

export type RobotDifficulty = "easy" | "medium" | "advanced" | "expert" | "cheating";

export const DIFFICULTY_LABELS: Record<RobotDifficulty, string> = {
  easy: "Foarte ușor",
  medium: "Ușor",
  advanced: "Mediu",
  expert: "Avansat",
  cheating: "Expert",
};

export const DIFFICULTY_DESCRIPTIONS: Record<RobotDifficulty, string> = {
  easy: "Robotul trage complet la întâmplare.",
  medium: "După o lovitură, robotul țintește celulele din jur pentru a găsi restul avionului.",
  advanced: "Robotul deduce forma avionului pornind de la lovitura cu cele mai puține variante posibile.",
  expert: "Robotul calculează probabilitatea poziției capului fiecărui avion, ca un jucător experimentat.",
  cheating: "Ca Expert, dar din când în când mai trage cu ochiul la o celulă din corpul unui avion.",
};

const ORIENTATIONS: PlaneOrientation[] = ["N", "E", "S", "W"];

type ShotEntry = { cell: Cell; status: ShotResult };

function pickRandomFrom(cells: Cell[]): Cell {
  return cells[Math.floor(Math.random() * cells.length)];
}

function getAllUnshotCells(shotKeys: Set<string>): Cell[] {
  const candidates: Cell[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cell = { row, col };
      if (!shotKeys.has(cellKey(cell))) candidates.push(cell);
    }
  }
  return candidates;
}

/** Nivel 2 (Mediu) - "hunt & target": după o lovitură reușită, țintește celulele
 * adiacente (N/S/E/V) ca să găsească restul avionului; dacă a găsit deja două
 * lovituri aliniate, preferă să continue în linie dreaptă. */
function pickHuntTarget(history: ShotEntry[], shotKeys: Set<string>): Cell | null {
  const hitCells = history.filter((s) => s.status === "hit" || s.status === "head").map((s) => s.cell);
  if (hitCells.length === 0) return null;

  const lineExtensions = new Map<string, Cell>();
  for (const a of hitCells) {
    for (const b of hitCells) {
      if (a === b) continue;
      if (a.row === b.row && Math.abs(a.col - b.col) === 1) {
        const dir = b.col - a.col;
        for (const ext of [
          { row: a.row, col: a.col - dir },
          { row: b.row, col: b.col + dir },
        ]) {
          if (isWithinBoard(ext) && !shotKeys.has(cellKey(ext))) lineExtensions.set(cellKey(ext), ext);
        }
      }
      if (a.col === b.col && Math.abs(a.row - b.row) === 1) {
        const dir = b.row - a.row;
        for (const ext of [
          { row: a.row - dir, col: a.col },
          { row: b.row + dir, col: b.col },
        ]) {
          if (isWithinBoard(ext) && !shotKeys.has(cellKey(ext))) lineExtensions.set(cellKey(ext), ext);
        }
      }
    }
  }
  if (lineExtensions.size > 0) return pickRandomFrom([...lineExtensions.values()]);

  const neighbors = new Map<string, Cell>();
  const deltas = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];
  for (const hit of hitCells) {
    for (const d of deltas) {
      const n = { row: hit.row + d.row, col: hit.col + d.col };
      if (isWithinBoard(n) && !shotKeys.has(cellKey(n))) neighbors.set(cellKey(n), n);
    }
  }
  if (neighbors.size === 0) return null;
  return pickRandomFrom([...neighbors.values()]);
}

/** Calculează, pentru toate plasările posibile de avion pe toată tabla, câte dintre
 * ele ar avea CAPUL în fiecare celulă netrasă încă (ținând cont doar de ratările deja
 * cunoscute). Se ține cont doar de capete (nu de tot corpul) fiindcă jocul se câștigă
 * găsind capul, nu scufundând avionul - folosit de nivelul Expert. */
function buildFrequencyMap(shotKeys: Set<string>, missKeys: Set<string>): Map<string, number> {
  const freq = new Map<string, number>();

  const tryPlacement = (head: Cell, orientation: PlaneOrientation) => {
    const headKey = cellKey(head);
    if (shotKeys.has(headKey)) return;
    const shape = getPlaneShape(orientation);
    const cells = shape.map((o) => ({ row: head.row + o.row, col: head.col + o.col }));
    if (!cells.every(isWithinBoard)) return;
    if (cells.some((c) => missKeys.has(cellKey(c)))) return;
    freq.set(headKey, (freq.get(headKey) ?? 0) + 1);
  };

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      for (const orientation of ORIENTATIONS) {
        tryPlacement({ row, col }, orientation);
      }
    }
  }

  return freq;
}

function pickMaxFrequency(freq: Map<string, number>): Cell | null {
  if (freq.size === 0) return null;
  let max = -1;
  for (const v of freq.values()) if (v > max) max = v;
  const best: Cell[] = [];
  for (const [key, v] of freq) {
    if (v !== max) continue;
    const [row, col] = key.split(":").map(Number);
    best.push({ row, col });
  }
  return pickRandomFrom(best);
}

/** Nivel 3 (Avansat): dintre toate plasările posibile de avion (orice poziție/orientare)
 * care sunt compatibile cu ratările cunoscute, alege plasarea care explică cele MAI MULTE
 * dintre loviturile deja date simultan (adică se potrivește cel mai bine cu forma reală
 * a avionului lovit), nu doar o singură celulă izolat - astfel deducția ține cont de
 * TOATE punctele ochite împreună, nu doar de una singură. Dacă mai multe plasări explică
 * la fel de multe lovituri, țintește capul cel mai frecvent dintre ele. */
function getShapeDeductionCandidates(history: ShotEntry[], shotKeys: Set<string>, missKeys: Set<string>): Cell[] {
  const headCells = history.filter((s) => s.status === "head").map((s) => s.cell);
  const allHitCells = history.filter((s) => s.status === "hit" || s.status === "head").map((s) => s.cell);
  if (allHitCells.length === 0) return [];

  // Pentru fiecare cap deja găsit, deducem orientarea cea mai probabilă a avionului
  // respectiv (cea susținută de cele mai multe din loviturile cunoscute) și excludem
  // TOATE celulele acelei forme complete din loviturile "relevante" - nu doar cele
  // conectate direct prin adiacență, fiindcă avionul are goluri (ex: coada e departe
  // de cap, fără celule netrase între ele) și rămânea altfel considerat greșit ca
  // fiind încă în joc.
  const excludedCellKeys = new Set<string>();
  for (const head of headCells) {
    let bestOrientation: PlaneOrientation | null = null;
    let bestSupport = -1;
    for (const orientation of ORIENTATIONS) {
      const cells = getPlaneCells({ id: "", head, orientation });
      if (!cells.every(isWithinBoard)) continue;
      const support = cells.reduce(
        (acc, c) => (allHitCells.some((h) => cellKey(h) === cellKey(c)) ? acc + 1 : acc),
        0
      );
      if (support > bestSupport) {
        bestSupport = support;
        bestOrientation = orientation;
      }
    }
    if (bestOrientation) {
      const cells = getPlaneCells({ id: "", head, orientation: bestOrientation });
      for (const c of cells) excludedCellKeys.add(cellKey(c));
    }
  }

  const relevantHitKeys = new Set<string>();
  for (const hit of allHitCells) {
    const key = cellKey(hit);
    if (!excludedCellKeys.has(key)) relevantHitKeys.add(key);
  }

  if (relevantHitKeys.size === 0) return [];

  let bestSupport = 0;
  const bestHeads: Cell[] = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      for (const orientation of ORIENTATIONS) {
        const head = { row, col };
        const headKey = cellKey(head);
        if (shotKeys.has(headKey)) continue; // capul deja tras, fie găsit fie ratat
        const cells = getPlaneShape(orientation).map((o) => ({ row: head.row + o.row, col: head.col + o.col }));
        if (!cells.every(isWithinBoard)) continue;
        if (cells.some((c) => missKeys.has(cellKey(c)))) continue;
        const support = cells.reduce((acc, c) => (relevantHitKeys.has(cellKey(c)) ? acc + 1 : acc), 0);
        if (support === 0) continue; // plasare fără nicio legătură cu loviturile relevante - ignorată
        if (support > bestSupport) {
          bestSupport = support;
          bestHeads.length = 0;
          bestHeads.push(head);
        } else if (support === bestSupport) {
          bestHeads.push(head);
        }
      }
    }
  }

  return bestHeads;
}

function pickShapeDeduction(history: ShotEntry[], shotKeys: Set<string>, missKeys: Set<string>): Cell | null {
  const bestHeads = getShapeDeductionCandidates(history, shotKeys, missKeys);
  if (bestHeads.length === 0) return null;

  const freq = new Map<string, number>();
  for (const head of bestHeads) {
    const key = cellKey(head);
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  return pickMaxFrequency(freq);
}

/** Nivel 4 (Expert): hartă de probabilitate pe toată tabla - clasicul algoritm
 * "probability density" din Battleship AI, fără să știe nimic ascuns. */
function pickHeatmap(shotKeys: Set<string>, missKeys: Set<string>): Cell | null {
  const freq = buildFrequencyMap(shotKeys, missKeys);
  return pickMaxFrequency(freq);
}

/** Logica de deducție + heatmap comună între Expert și Foarte greu (fără trișare):
 * dacă există lovituri relevante (dintr-un avion încă nerezolvat), țintește mereu
 * printre capetele candidate compatibile cu ele - indiferent câte variante sunt,
 * niciodată nu ignorăm loviturile cunoscute. Doar dacă nu există nicio lovitură
 * relevantă (căutare încă neînceput sau toate avioanele active rezolvate), foloseşte
 * harta de probabilitate pe toată tabla. */
function pickExpertOrCheating(
  history: ShotEntry[],
  shotKeys: Set<string>,
  missKeys: Set<string>,
  candidates: Cell[]
): Cell {
  const deductionCandidates = getShapeDeductionCandidates(history, shotKeys, missKeys);
  if (deductionCandidates.length > 0) {
    return pickRandomFrom(deductionCandidates);
  }
  return pickHeatmap(shotKeys, missKeys) ?? pickRandomFrom(candidates);
}

/** Nivel 5 (Foarte greu): joacă exact ca nivelul Expert (deducție + probabilitate, fără
 * trișare) majoritatea timpului, dar din când în când (aleator, la fiecare 2 sau 3
 * mutări) "trage cu ochiul" la o celulă din corpul (nu capul) unui avion nedescoperit
 * încă - un mic avantaj în plus față de Expert, nu o victorie instantă. */
function pickCheating(
  myPlanes: PlanePlacement[],
  history: ShotEntry[],
  shotKeys: Set<string>,
  missKeys: Set<string>,
  candidates: Cell[]
): Cell {
  // Alege dacă mutarea curentă e una de "tras cu ochiul", alternând intervale de 2 și
  // 3 mutări începând chiar de la a doua mutare a meciului (2, 5, 7, 10, 12, ...) - astfel
  // primul peek chiar se întâmplă garantat la a 2-a mutare, nu doar "din întâmplare".
  const currentMove = history.length + 1;
  let nextPeekMove = 0;
  let useTwo = true;
  while (nextPeekMove < currentMove) {
    nextPeekMove += useTwo ? 2 : 3;
    useTwo = !useTwo;
  }
  const shouldPeek = nextPeekMove === currentMove;

  if (!shouldPeek) {
    return pickExpertOrCheating(history, shotKeys, missKeys, candidates);
  }

  // Dacă există lovituri relevante (dintr-un avion nerezolvat), asta are prioritate
  // absolută față de "tras cu ochiul" - nu are sens să trișăm când oricum putem deduce
  // corect din loviturile deja date.
  const deductionCandidates = getShapeDeductionCandidates(history, shotKeys, missKeys);
  if (deductionCandidates.length > 0) {
    return pickRandomFrom(deductionCandidates);
  }

  {
    // Avioanele deja atinse (cel puțin o celulă lovită) dar cu capul încă negăsit -
    // pe astea le preferă, ca să ajungă mai repede la cap, în loc să înceapă un avion nou.
    const startedPlanes = myPlanes.filter(
      (plane) =>
        !shotKeys.has(cellKey(plane.head)) &&
        getPlaneCells(plane).some((c) => shotKeys.has(cellKey(c)))
    );
    const targetPlanes = startedPlanes.length > 0 ? startedPlanes : myPlanes;

    const bodyCells: Cell[] = [];
    for (const plane of targetPlanes) {
      if (shotKeys.has(cellKey(plane.head))) continue; // capul deja găsit, avionul e "rezolvat"
      const cells = getPlaneCells(plane).filter((c) => cellKey(c) !== cellKey(plane.head));
      for (const c of cells) {
        if (!shotKeys.has(cellKey(c))) bodyCells.push(c);
      }
    }
    if (bodyCells.length > 0) return pickRandomFrom(bodyCells);
  }
  return pickExpertOrCheating(history, shotKeys, missKeys, candidates);
}

/**
 * Alege următoarea celulă în care trage robotul, în funcție de dificultatea aleasă.
 * `myPlanes` e folosit doar la nivelul "cheating" (robotul își "amintește" pozițiile
 * avioanelor jucătorului).
 */
export function pickRobotShot(
  difficulty: RobotDifficulty,
  history: ShotEntry[],
  myPlanes: PlanePlacement[]
): Cell {
  const shotKeys = new Set(history.map((s) => cellKey(s.cell)));
  const missKeys = new Set(history.filter((s) => s.status === "miss").map((s) => cellKey(s.cell)));
  const candidates = getAllUnshotCells(shotKeys);

  switch (difficulty) {
    case "easy":
      return pickRandomFrom(candidates);
    case "medium":
      return pickHuntTarget(history, shotKeys) ?? pickRandomFrom(candidates);
    case "advanced":
      return (
        pickShapeDeduction(history, shotKeys, missKeys) ??
        pickHuntTarget(history, shotKeys) ??
        pickRandomFrom(candidates)
      );
    case "expert":
      return pickExpertOrCheating(history, shotKeys, missKeys, candidates);
    case "cheating":
      return pickCheating(myPlanes, history, shotKeys, missKeys, candidates);
  }
}

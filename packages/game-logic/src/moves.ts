import type { Cell, PlanePlacement, ShotResult } from "@flight/types";
import { cellKey } from "./board";
import { getPlaneCells } from "./planes";

/**
 * Determină rezultatul unei lovituri pe baza avioanelor plasate și a loviturilor anterioare.
 * `sunk` = ultima celulă rămasă dintr-un avion a fost lovită.
 */
export function resolveShot(
  cell: Cell,
  planes: PlanePlacement[],
  previousHitKeys: Set<string>
): { result: ShotResult; planeId: string | null } {
  const key = cellKey(cell);

  for (const plane of planes) {
    const planeCells = getPlaneCells(plane);
    const isHit = planeCells.some((c) => cellKey(c) === key);
    if (!isHit) continue;

    const hitKeysAfterThisShot = new Set(previousHitKeys);
    hitKeysAfterThisShot.add(key);

    const allHit = planeCells.every((c) => hitKeysAfterThisShot.has(cellKey(c)));
    return { result: allHit ? "sunk" : "hit", planeId: plane.id };
  }

  return { result: "miss", planeId: null };
}

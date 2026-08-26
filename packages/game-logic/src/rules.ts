import type { PlanePlacement, Shot } from "@flight/types";
import { cellKey } from "./board";
import { getPlaneCells } from "./planes";

/** Un jucător a pierdut când toate celulele tuturor avioanelor sale au fost lovite. */
export function hasPlayerLost(planes: PlanePlacement[], shotsAgainstPlayer: Shot[]): boolean {
  const hitKeys = new Set(
    shotsAgainstPlayer.filter((s) => s.result !== "miss").map((s) => cellKey(s.cell))
  );

  return planes.every((plane) => getPlaneCells(plane).every((c) => hitKeys.has(cellKey(c))));
}

export const TOTAL_PLANES_PER_PLAYER = 3;

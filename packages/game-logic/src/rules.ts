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

/**
 * Câștigi jocul când ai nimerit capul (`head`) fiecăruia dintre cele 3 avioane ale
 * adversarului — nu e nevoie să scufunzi tot avionul, doar să găsești capul.
 */
export function hasFoundAllPlaneHeads(planes: PlanePlacement[], shotsAgainstOpponent: Shot[]): boolean {
  const hitKeys = new Set(
    shotsAgainstOpponent.filter((s) => s.result !== "miss").map((s) => cellKey(s.cell))
  );

  return planes.every((plane) => hitKeys.has(cellKey(plane.head)));
}

export const TOTAL_PLANES_PER_PLAYER = 3;

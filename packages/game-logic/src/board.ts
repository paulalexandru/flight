import type { Cell } from "@flight/types";

export const BOARD_SIZE = 10;

export function isWithinBoard(cell: Cell): boolean {
  return cell.row >= 0 && cell.row < BOARD_SIZE && cell.col >= 0 && cell.col < BOARD_SIZE;
}

export function cellKey(cell: Cell): string {
  return `${cell.row}:${cell.col}`;
}

export function createEmptyOccupancy(): Set<string> {
  return new Set<string>();
}

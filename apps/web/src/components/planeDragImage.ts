import { getPlaneShape } from "@flight/game-logic";
import type { PlaneOrientation } from "@flight/types";
import { PLANE_COLORS, planeColorIndex } from "./PlaneTray";

/**
 * Construiește un element DOM temporar (nefixat pe pagină) care arată identic cu
 * avionul de pe tablă — contur solid pe exterior, punctat pe interiorul formei,
 * steluță albă pe capul avionului — și îl folosește ca imagine de drag nativă,
 * astfel încât fantoma din timpul tragerii să semene exact cu avionul real,
 * nu cu un dreptunghi gol sau cu preview-ul de pe grid dublat.
 */
export function setPlaneDragImage(
  e: React.DragEvent,
  orientation: PlaneOrientation,
  planeId: string
) {
  const cellSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell-size")) || 42;
  const shape = getPlaneShape(orientation);
  const rows = shape.map((c) => c.row);
  const cols = shape.map((c) => c.col);
  const minRow = Math.min(...rows, 0);
  const maxRow = Math.max(...rows, 0);
  const minCol = Math.min(...cols, 0);
  const maxCol = Math.max(...cols, 0);
  const height = maxRow - minRow + 1;
  const width = maxCol - minCol + 1;
  const occupied = new Set(shape.map((c) => `${c.row - minRow}:${c.col - minCol}`));
  const headKey = `${0 - minRow}:${0 - minCol}`;
  const color = PLANE_COLORS[planeColorIndex(planeId)];

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "-1000px";
  container.style.left = "-1000px";
  container.style.display = "grid";
  container.style.gridTemplateColumns = `repeat(${width}, ${cellSize}px)`;
  container.style.gridTemplateRows = `repeat(${height}, ${cellSize}px)`;

  const sameNeighbor = (r: number, c: number) => occupied.has(`${r}:${c}`);

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const key = `${r}:${c}`;
      const isOccupied = occupied.has(key);
      const cell = document.createElement("div");
      cell.style.width = `${cellSize}px`;
      cell.style.height = `${cellSize}px`;
      cell.style.display = "flex";
      cell.style.alignItems = "center";
      cell.style.justifyContent = "center";
      if (isOccupied) {
        cell.style.background = key === headKey ? color.background : color.background;
        const solid = `1px solid ${color.border}`;
        const dashed = `1px dashed ${color.border}`;
        cell.style.borderTop = sameNeighbor(r - 1, c) ? dashed : solid;
        cell.style.borderBottom = sameNeighbor(r + 1, c) ? dashed : solid;
        cell.style.borderLeft = sameNeighbor(r, c - 1) ? dashed : solid;
        cell.style.borderRight = sameNeighbor(r, c + 1) ? dashed : solid;
        if (key === headKey) {
          cell.style.color = "#fff";
          cell.style.fontSize = "15px";
          cell.style.textShadow = "0 0 2px #000";
          cell.textContent = "★";
        }
      }
      container.appendChild(cell);
    }
  }

  document.body.appendChild(container);
  const headRow = 0 - minRow;
  const headCol = 0 - minCol;
  e.dataTransfer.setDragImage(container, (headCol + 0.5) * cellSize, (headRow + 0.5) * cellSize);
  // Elementul e citit sincron de browser la setDragImage; îl putem elimina imediat după.
  requestAnimationFrame(() => {
    document.body.removeChild(container);
  });
}

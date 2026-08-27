import { getPlaneShape } from "@flight/game-logic";
import type { PlaneOrientation } from "@flight/types";
import { setEmptyDragImage, markDragging } from "./planeDragImage";

export interface TrayPlane {
  id: string;
  orientation: PlaneOrientation;
}

interface PlaneTrayProps {
  planes: TrayPlane[];
  onDragStart: (planeId: string) => void;
  onRotate: (planeId: string) => void;
}

const NEXT_ORIENTATION: Record<PlaneOrientation, PlaneOrientation> = {
  N: "E",
  E: "S",
  S: "W",
  W: "N",
};

// Aceleași culori ca pe tablă (Board.tsx), indexate stabil după id-ul avionului
// (ex: "tray-0" -> index 0), ca fiecare avion să-și păstreze culoarea indiferent
// de ordinea în care avioanele rămase sunt afișate în tavă.
export const PLANE_COLORS = [
  { border: "#3476a0", background: "#9adcf5" },
  { border: "#baaa45", background: "#dad25a" },
  { border: "#a437ca", background: "#dabefa" },
];

export function planeColorIndex(planeId: string): number {
  const match = /(\d+)/.exec(planeId);
  const n = match ? Number(match[1]) : 0;
  return n % PLANE_COLORS.length;
}

/** Randează forma reală a avionului, cu exact același stil ca pe tablă (contur
 * solid pe exterior, punctat între celulele proprii, steluță pe cap), la aceeași
 * mărime ca celulele de pe tablă. */
function PlanePreview({ orientation, planeId }: { orientation: PlaneOrientation; planeId: string }) {
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
  const sameNeighbor = (r: number, c: number) => occupied.has(`${r}:${c}`);

  const cells = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const key = `${r}:${c}`;
      const isOccupied = occupied.has(key);
      const solid = `1px solid ${color.border}`;
      const dashed = `1px dashed ${color.border}`;
      cells.push(
        <div
          key={key}
          style={{
            width: "var(--cell-size, 42px)",
            height: "var(--cell-size, 42px)",
            background: isOccupied ? color.background : "transparent",
            borderTop: isOccupied ? (sameNeighbor(r - 1, c) ? dashed : solid) : undefined,
            borderBottom: isOccupied ? (sameNeighbor(r + 1, c) ? dashed : solid) : undefined,
            borderLeft: isOccupied ? (sameNeighbor(r, c - 1) ? dashed : solid) : undefined,
            borderRight: isOccupied ? (sameNeighbor(r, c + 1) ? dashed : solid) : undefined,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          {key === headKey && (
            <span style={{ color: "#fff", fontSize: 15, textShadow: "0 0 2px #000" }}>★</span>
          )}
        </div>
      );
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${width}, var(--cell-size, 42px))`, gap: 0 }}>
      {cells}
    </div>
  );
}

/** Coloana din dreapta cu avionul curent de plasat (unul câte unul, cu contor pentru restul). */
export function PlaneTray({ planes, onDragStart, onRotate }: PlaneTrayProps) {
  const currentPlane = planes[0];

  return (
    <div className="plane-tray">
      <h4 className="plane-tray__title">Avion de plasat</h4>
      {!currentPlane && <p className="plane-tray__empty">Toate avioanele au fost plasate ✅</p>}
      {currentPlane && (
        <div className="plane-tray__current">
          <div
            className="plane-tray__item plane-tray__item--full"
            draggable
            onDragStart={(e) => {
              setEmptyDragImage(e);
              markDragging(e);
              onDragStart(currentPlane.id);
            }}
          >
            <PlanePreview orientation={currentPlane.orientation} planeId={currentPlane.id} />
            <button
              type="button"
              className="plane-tray__rotate"
              onClick={() => onRotate(currentPlane.id)}
              title="Rotește avionul"
            >
              ⟳
            </button>
          </div>
          {planes.length > 1 && <span className="plane-tray__count">×{planes.length}</span>}
        </div>
      )}
    </div>
  );
}

export { NEXT_ORIENTATION };

import { getPlaneShape } from "@flight/game-logic";
import type { PlaneOrientation } from "@flight/types";

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

/** Randează un mini-preview al formei avionului într-un grid mic, pentru tava laterală. */
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

  const cells = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const key = `${r}:${c}`;
      cells.push(
        <div
          key={key}
          style={{
            width: 10,
            height: 10,
            background: key === headKey ? "#fff" : occupied.has(key) ? color.background : "transparent",
            border: occupied.has(key) && key !== headKey ? `1px solid ${color.border}` : undefined,
            borderRadius: 2,
          }}
        />
      );
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${width}, 10px)`, gap: 1 }}>
      {cells}
    </div>
  );
}

/** Coloana din dreapta cu avioanele care nu au fost încă plasate pe tablă. */
export function PlaneTray({ planes, onDragStart, onRotate }: PlaneTrayProps) {
  return (
    <div className="plane-tray">
      <h4 className="plane-tray__title">Avioane de plasat</h4>
      {planes.length === 0 && <p className="plane-tray__empty">Toate avioanele au fost plasate ✅</p>}
      <div className="plane-tray__list">
        {planes.map((plane) => (
          <div
            key={plane.id}
            className="plane-tray__item"
            draggable
            onDragStart={() => onDragStart(plane.id)}
          >
            <PlanePreview orientation={plane.orientation} planeId={plane.id} />
            <button
              type="button"
              className="plane-tray__rotate"
              onClick={() => onRotate(plane.id)}
              title="Rotește avionul"
            >
              ⟳
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export { NEXT_ORIENTATION };

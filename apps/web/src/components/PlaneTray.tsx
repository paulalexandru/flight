import { useRef } from "react";
import { BOARD_SIZE, getPlaneShape } from "@flight/game-logic";
import type { PlaneOrientation } from "@flight/types";

// Cea mai mare latura pe care o poate avea avionul in oricare orientare (N/S: 3x4, E/W: 4x3)
// -- pastram cutia din jurul lui la aceasta dimensiune fixa, ca rotirea sa nu schimbe
// niciodata inaltimea coloanei din jur.
const PLANE_BOX_SIZE = 4;

export interface TrayPlane {
  id: string;
  orientation: PlaneOrientation;
}

interface PlaneTrayProps {
  planes: TrayPlane[];
  onDragStart: (planeId: string) => void;
  onRotate: (planeId: string) => void;
  /** Se declanșează mereu la finalul drag-ului (indiferent dacă a existat un drop
   * valid), ca starea de "avion tras" să nu rămână blocată dacă drop-ul eșuează. */
  onDragEnd?: () => void;
  /** Text informativ opțional afișat sub titlu, cât timp mai sunt avioane de plasat. */
  hint?: string;
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
 * solid pe exterior, punctat între celulele proprii, steluță pe cap). Cutia din jur
 * are mereu dimensiunea fixă PLANE_BOX_SIZE x PLANE_BOX_SIZE (indiferent de orientare,
 * ca rotirea să nu schimbe înălțimea coloanei), iar mărimea unei celule e calculată ca
 * fracțiune din lățimea containerului (100% * PLANE_BOX_SIZE / BOARD_SIZE), exact cât o
 * celulă de pe tablă (care are aceeași lățime de coloană) — fără valori fixe în pixeli. */
function PlanePreview({ orientation, planeId }: { orientation: PlaneOrientation; planeId: string }) {
  const shape = getPlaneShape(orientation);
  const rows = shape.map((c) => c.row);
  const cols = shape.map((c) => c.col);
  const minRow = Math.min(...rows, 0);
  const maxRow = Math.max(...rows, 0);
  const minCol = Math.min(...cols, 0);
  const maxCol = Math.max(...cols, 0);
  const shapeHeight = maxRow - minRow + 1;
  const shapeWidth = maxCol - minCol + 1;
  // Centram forma in cutia fixa PLANE_BOX_SIZE x PLANE_BOX_SIZE.
  const rowOffset = Math.floor((PLANE_BOX_SIZE - shapeHeight) / 2);
  const colOffset = Math.floor((PLANE_BOX_SIZE - shapeWidth) / 2);
  const occupied = new Set(
    shape.map((c) => `${c.row - minRow + rowOffset}:${c.col - minCol + colOffset}`),
  );
  const headKey = `${0 - minRow + rowOffset}:${0 - minCol + colOffset}`;
  const color = PLANE_COLORS[planeColorIndex(planeId)];
  const sameNeighbor = (r: number, c: number) => occupied.has(`${r}:${c}`);

  const cells = [];
  for (let r = 0; r < PLANE_BOX_SIZE; r++) {
    for (let c = 0; c < PLANE_BOX_SIZE; c++) {
      const key = `${r}:${c}`;
      const isOccupied = occupied.has(key);
      const solid = `1px solid ${color.border}`;
      const dashed = `1px dashed ${color.border}`;
      cells.push(
        <div
          key={key}
          style={{
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
    <div
      className="plane-tray__preview-box"
      style={{
        width: `${(100 * PLANE_BOX_SIZE) / BOARD_SIZE}%`,
        display: "grid",
        gridTemplateColumns: `repeat(${PLANE_BOX_SIZE}, 1fr)`,
        gridTemplateRows: `repeat(${PLANE_BOX_SIZE}, 1fr)`,
        aspectRatio: "1 / 1",
        gap: 0,
        margin: "0 auto",
      }}
    >
      {cells}
    </div>
  );
}

/** Coloana din dreapta cu avionul curent de plasat (unul câte unul, cu contor pentru restul). */
export function PlaneTray({ planes, onDragStart, onRotate, onDragEnd, hint }: PlaneTrayProps) {
  const currentPlane = planes[0];
  const emptyDragImageRef = useRef<HTMLImageElement | null>(null);

  if (!emptyDragImageRef.current && typeof Image !== "undefined") {
    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7";
    emptyDragImageRef.current = img;
  }

  return (
    <div className="plane-tray">
      <h4 className="plane-tray__title">Avion de plasat</h4>
      {hint && currentPlane && <p className="plane-tray__hint">{hint}</p>}
      {!currentPlane && <p className="plane-tray__empty">Toate avioanele au fost plasate ✅</p>}
      {currentPlane && (
        <div
          className="plane-tray__item"
          draggable
          onDragStart={(e) => {
            // Ascundem complet fantoma nativă (browserul ar arăta oricum un al doilea
            // avion peste previzualizarea deja desenată pe grid) — feedback-ul vizual
            // vine din previzualizarea colorată de pe tablă, nu dintr-o fantomă separată.
            e.dataTransfer.effectAllowed = "move";
            if (emptyDragImageRef.current) {
              e.dataTransfer.setDragImage(emptyDragImageRef.current, 0, 0);
            }
            onDragStart(currentPlane.id);
          }}
          onDragEnd={() => onDragEnd?.()}
        >
          <PlanePreview orientation={currentPlane.orientation} planeId={currentPlane.id} />
          <div className="plane-tray__controls">
            <button
              type="button"
              className="plane-tray__rotate"
              onClick={() => onRotate(currentPlane.id)}
              title="Rotește avionul"
            >
              ⟳ Rotește
            </button>
            {planes.length > 1 && <span className="plane-tray__count">×{planes.length}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export { NEXT_ORIENTATION };

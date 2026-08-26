import { BOARD_SIZE, getPlaneCells, isValidPlanePlacement, getOccupiedCellKeys } from "@flight/game-logic";
import type { Cell, PlanePlacement } from "@flight/types";
import { useState } from "react";

import type { ShotResult } from "@flight/types";
import { PLANE_COLORS, planeColorIndex } from "./PlaneTray";

interface BoardProps {
  onCellClick?: (cell: Cell) => void;
  markedCells?: { cell: Cell; status: ShotResult }[];
  /** Avioanele plasate deja pe tablă (editabile prin drag & drop dacă `onPlanesChange` e furnizat). */
  planes?: PlanePlacement[];
  onPlanesChange?: (planes: PlanePlacement[]) => void;
  /** Callback apelat când tabla acceptă drop-ul unui avion nou din tavă (nu unul deja plasat). */
  onDropNewPlane?: (head: Cell) => void;
  /** Id-ul avionului aflat curent în tragere (din tavă sau de pe tablă), pentru a-i arăta previzualizarea. */
  draggingOrientation?: PlanePlacement["orientation"];
  /** Dublu-click pe un avion deja plasat -> îl rotește. */
  onRotatePlane?: (planeId: string) => void;
}

export function Board({
  onCellClick,
  markedCells = [],
  planes = [],
  onPlanesChange,
  onDropNewPlane,
  draggingOrientation,
  onRotatePlane,
}: BoardProps) {
  const [hoverCell, setHoverCell] = useState<Cell | null>(null);
  const [draggingPlaneId, setDraggingPlaneId] = useState<string | null>(null);

  const rows = Array.from({ length: BOARD_SIZE }, (_, row) => row);
  const cols = Array.from({ length: BOARD_SIZE }, (_, col) => col);

  const statusFor = (row: number, col: number) =>
    markedCells.find((m) => m.cell.row === row && m.cell.col === col)?.status;

  const planeCellMap = new Map<string, string>(); // "row:col" -> planeId
  planes.forEach((plane) => {
    getPlaneCells(plane).forEach((cell) => {
      planeCellMap.set(`${cell.row}:${cell.col}`, plane.id);
    });
  });

  // Previzualizare: dacă tragem un avion (nou sau existent) peste tablă, calculăm
  // celulele pe care le-ar ocupa dacă am da drop acum, ca să le colorăm live.
  const activeOrientation = draggingPlaneId
    ? planes.find((p) => p.id === draggingPlaneId)?.orientation ?? draggingOrientation
    : draggingOrientation;

  const previewCells: Cell[] = [];
  let previewValid = false;
  if (hoverCell && activeOrientation) {
    const candidate: PlanePlacement = { id: draggingPlaneId ?? "__preview__", head: hoverCell, orientation: activeOrientation };
    const occupied = getOccupiedCellKeys(planes, draggingPlaneId ?? undefined);
    previewValid = isValidPlanePlacement(candidate, occupied);
    previewCells.push(...getPlaneCells(candidate));
  }
  const previewKeys = new Set(previewCells.map((c) => `${c.row}:${c.col}`));

  const handleDrop = (row: number, col: number) => {
    const head = { row, col };
    if (draggingPlaneId) {
      // Mutăm un avion deja plasat, păstrându-i orientarea curentă.
      const existing = planes.find((p) => p.id === draggingPlaneId);
      const orientation = existing?.orientation ?? "N";
      const candidate: PlanePlacement = { id: draggingPlaneId, head, orientation };
      const occupied = getOccupiedCellKeys(planes, draggingPlaneId);
      if (isValidPlanePlacement(candidate, occupied)) {
        onPlanesChange?.(planes.map((p) => (p.id === draggingPlaneId ? candidate : p)));
      }
    } else {
      onDropNewPlane?.(head);
    }
    setDraggingPlaneId(null);
    setHoverCell(null);
  };

  return (
    <div
      className="board-grid"
      style={{ display: "grid", gridTemplateColumns: `repeat(${BOARD_SIZE}, 42px)`, gap: 3 }}
      onDragLeave={() => setHoverCell(null)}
    >
      {rows.map((row) =>
        cols.map((col) => {
          const status = statusFor(row, col);
          const key = `${row}:${col}`;
          const occupyingPlaneId = planeCellMap.get(key);
          const planeColor =
            occupyingPlaneId !== undefined
              ? PLANE_COLORS[planeColorIndex(occupyingPlaneId)]
              : undefined;
          const isPreview = previewKeys.has(key);
          let background = status === "hit" || status === "sunk" ? "#e74c3c" : status === "miss" ? "#95a5a6" : "#3a5a78";
          if (status === "head") background = "#f1c40f";
          if (occupyingPlaneId && !status) background = planeColor?.background ?? "#81b64c";
          if (isPreview) background = previewValid ? "#b6e388" : "#e77b7b";

          return (
            <button
              key={key}
              draggable={Boolean(occupyingPlaneId && onPlanesChange)}
              onDragStart={() => {
                if (occupyingPlaneId) setDraggingPlaneId(occupyingPlaneId);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setHoverCell({ row, col });
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(row, col);
              }}
              onClick={() => onCellClick?.({ row, col })}
              onDoubleClick={() => {
                if (occupyingPlaneId) onRotatePlane?.(occupyingPlaneId);
              }}
              style={{
                width: 42,
                height: 42,
                background,
                border: occupyingPlaneId ? `1px solid ${planeColor?.border ?? "#5f9a3a"}` : "1px solid #2c2a27",
                cursor: occupyingPlaneId && onPlanesChange ? "grab" : onCellClick ? "pointer" : "default",
                fontSize: 20,
                lineHeight: "42px",
              }}
            >
              {status === "head" ? "★" : null}
            </button>
          );
        })
      )}
    </div>
  );
}

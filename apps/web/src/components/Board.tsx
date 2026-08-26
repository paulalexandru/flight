import { BOARD_SIZE, getPlaneCells, isValidPlanePlacement, getOccupiedCellKeys } from "@flight/game-logic";
import type { Cell, PlanePlacement } from "@flight/types";
import { useState } from "react";

import type { ShotResult } from "@flight/types";
import { PLANE_COLORS, planeColorIndex } from "./PlaneTray";
import cloudIconUrl from "../assets/cloud-icon.png";

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
  /** Id-ul avionului tras dintr-un tavă neplasată încă (pentru culoarea de previzualizare). */
  draggingPlaneIdFromTray?: string;
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
  draggingPlaneIdFromTray,
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
      style={{ display: "grid", gridTemplateColumns: `repeat(${BOARD_SIZE}, 42px)`, gap: 0 }}
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
          const previewPlaneId = draggingPlaneId ?? draggingPlaneIdFromTray;
          const previewColorPalette = previewPlaneId
            ? PLANE_COLORS[planeColorIndex(previewPlaneId)]
            : undefined;
          let background = (row + col) % 2 === 0 ? "#45423c" : "#4d4a42";
          if (occupyingPlaneId) background = planeColor?.background ?? "#81b64c";
          if (isPreview) background = previewColorPalette?.background ?? planeColor?.background ?? "#81b64c";

          let icon: string | null = null;
          if (status === "hit" || status === "sunk") icon = "❌";
          else if (status === "head") icon = "❌";

          // Pentru un avion, marginile spre celule ale ACELUIAȘI avion sunt punctate
          // (delimitare internă a formei), iar marginile spre exterior (afara avionului
          // sau spre alt avion) rămân continue, ca un contur clar al formei.
          // Când celula face parte din previzualizarea unui avion tras (plasare/mutare),
          // fundalul își păstrează culoarea proprie a avionului, dar conturul devine
          // verde (plasare validă) sau roșu (invalidă) în loc de culoarea avionului.
          let borderTop: string | undefined;
          let borderRight: string | undefined;
          let borderBottom: string | undefined;
          let borderLeft: string | undefined;
          if (isPreview) {
            const previewColor = previewValid ? "#2ecc71" : "#e74c3c";
            const ownColor = previewColorPalette?.border ?? planeColor?.border ?? "#5f9a3a";
            const solid = `2px solid ${previewColor}`;
            const dashed = `1px dashed ${ownColor}`;
            const sameNeighbor = (r: number, c: number) => previewKeys.has(`${r}:${c}`);
            borderTop = sameNeighbor(row - 1, col) ? dashed : solid;
            borderBottom = sameNeighbor(row + 1, col) ? dashed : solid;
            borderLeft = sameNeighbor(row, col - 1) ? dashed : solid;
            borderRight = sameNeighbor(row, col + 1) ? dashed : solid;
          } else if (occupyingPlaneId) {
            const solid = `1px solid ${planeColor?.border ?? "#5f9a3a"}`;
            const dashed = `1px dashed ${planeColor?.border ?? "#5f9a3a"}`;
            const sameNeighbor = (r: number, c: number) => planeCellMap.get(`${r}:${c}`) === occupyingPlaneId;
            borderTop = sameNeighbor(row - 1, col) ? dashed : solid;
            borderBottom = sameNeighbor(row + 1, col) ? dashed : solid;
            borderLeft = sameNeighbor(row, col - 1) ? dashed : solid;
            borderRight = sameNeighbor(row, col + 1) ? dashed : solid;
          } else {
            borderTop = borderRight = borderBottom = borderLeft = "1px solid #2c2a27";
          }

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
                borderTop,
                borderRight,
                borderBottom,
                borderLeft,
                cursor: occupyingPlaneId && onPlanesChange ? "grab" : onCellClick ? "pointer" : "default",
                fontSize: 20,
                lineHeight: "42px",
                position: "relative",
              }}
            >
              {status === "miss" && (
                <img
                  src={cloudIconUrl}
                  alt=""
                  width={28}
                  height={28}
                  style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
                />
              )}
              {icon && (
                <span
                  style={{
                    color: status === "miss" ? undefined : "#2ecc71",
                    position: "relative",
                    display: "inline-block",
                  }}
                >
                  {icon}
                  {status === "head" && (
                    <span
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        fontSize: 15,
                        color: "#fff",
                        textShadow: "0 0 2px #000",
                      }}
                    >
                      ★
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}

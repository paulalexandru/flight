import { BOARD_SIZE, getPlaneCells, isValidPlanePlacement, getOccupiedCellKeys } from "@flight/game-logic";
import type { Cell, PlanePlacement } from "@flight/types";
import { useRef, useState } from "react";

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
  /** Adnotări personale (click-dreapta) pe celule — "row:col" -> culoare hașură.
   * Folosite ca notițe proprii (ex: pe unde crezi că e avionul advers), nu au
   * legătură cu logica jocului. */
  annotations?: Record<string, string>;
  /** Click-dreapta pe o celulă (dacă e furnizat, dezactivează meniul contextual nativ). */
  onCellRightClick?: (cell: Cell) => void;
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
  annotations,
  onCellRightClick,
}: BoardProps) {
  const [hoverCell, setHoverCell] = useState<Cell | null>(null);
  const [draggingPlaneId, setDraggingPlaneId] = useState<string | null>(null);
  // Offset-ul (relativ la head) al celulei de care a fost apucat avionul la drag start,
  // ca să nu "sară" mereu capul avionului sub cursor, indiferent de unde a fost prins.
  const [dragGrabOffset, setDragGrabOffset] = useState<Cell | null>(null);
  // Informațiile despre mutarea în curs a unui avion deja plasat, ținute într-un ref
  // (nu state) ca să nu declanșăm re-render la fiecare micro-mișcare a pointerului
  // înainte de a depăși pragul de la care considerăm că e efectiv un "drag".
  const pointerDragRef = useRef<{
    pointerId: number;
    planeId: string;
    startX: number;
    startY: number;
    offset: Cell;
  } | null>(null);

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
    // Dacă mutăm un avion existent, capul lui nou nu e neapărat celula peste care
    // suntem acum — depinde de celula de care l-am apucat (cap, coadă sau mijloc).
    const previewHead =
      draggingPlaneId && dragGrabOffset
        ? { row: hoverCell.row - dragGrabOffset.row, col: hoverCell.col - dragGrabOffset.col }
        : hoverCell;
    const candidate: PlanePlacement = { id: draggingPlaneId ?? "__preview__", head: previewHead, orientation: activeOrientation };
    const occupied = getOccupiedCellKeys(planes, draggingPlaneId ?? undefined);
    previewValid = isValidPlanePlacement(candidate, occupied);
    previewCells.push(...getPlaneCells(candidate));
  }
  const previewKeys = new Set(previewCells.map((c) => `${c.row}:${c.col}`));

  const handleDrop = (row: number, col: number) => {
    if (draggingPlaneId) {
      // Mutăm un avion deja plasat, păstrându-i orientarea curentă și offset-ul
      // relativ la care a fost apucat (nu mai "sare" cu capul sub cursor).
      const existing = planes.find((p) => p.id === draggingPlaneId);
      const orientation = existing?.orientation ?? "N";
      const head = dragGrabOffset
        ? { row: row - dragGrabOffset.row, col: col - dragGrabOffset.col }
        : { row, col };
      const candidate: PlanePlacement = { id: draggingPlaneId, head, orientation };
      const occupied = getOccupiedCellKeys(planes, draggingPlaneId);
      if (isValidPlanePlacement(candidate, occupied)) {
        onPlanesChange?.(planes.map((p) => (p.id === draggingPlaneId ? candidate : p)));
      }
    } else {
      onDropNewPlane?.({ row, col });
    }
    setDraggingPlaneId(null);
    setDragGrabOffset(null);
    setHoverCell(null);
  };

  // Găsește celula de sub un punct de pe ecran (folosit la mutarea prin pointer events
  // a unui avion deja plasat, unde nu mai avem un target nativ de "dragover").
  const cellAtPoint = (x: number, y: number): Cell | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const cellEl = el?.closest("[data-row]") as HTMLElement | null;
    if (!cellEl) return null;
    const r = Number(cellEl.dataset.row);
    const c = Number(cellEl.dataset.col);
    if (Number.isNaN(r) || Number.isNaN(c)) return null;
    return { row: r, col: c };
  };

  const DRAG_THRESHOLD_PX = 4;

  const endPointerDrag = () => {
    pointerDragRef.current = null;
    setDraggingPlaneId(null);
    setDragGrabOffset(null);
    setHoverCell(null);
  };

  return (
    <div
      className="board-grid"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
        width: "100%",
        gap: 0,
      }}
      onDragLeave={() => setHoverCell(null)}
    >
      {rows.map((row) =>
        cols.map((col) => {
          const status = statusFor(row, col);
          const key = `${row}:${col}`;
          const occupyingPlaneId = planeCellMap.get(key);
          const annotationColor = annotations?.[key];
          // Pentru afișare (culoare/contur), ascundem avionul la poziția lui veche cât
          // timp e tras (drag) — dar `occupyingPlaneId` brut rămâne neschimbat, ca
          // atributul cursor/handlerele de pointer să rămână stabile pe elementul
          // aflat chiar sub cursor cât timp durează drag-ul.
          const planeIdForDisplay = (r: number, c: number) => {
            const id = planeCellMap.get(`${r}:${c}`);
            return id === draggingPlaneId ? undefined : id;
          };
          const displayPlaneId = planeIdForDisplay(row, col);
          const planeColor =
            displayPlaneId !== undefined
              ? PLANE_COLORS[planeColorIndex(displayPlaneId)]
              : undefined;
          const isPreview = previewKeys.has(key);
          const previewPlaneId = draggingPlaneId ?? draggingPlaneIdFromTray;
          const previewColorPalette = previewPlaneId
            ? PLANE_COLORS[planeColorIndex(previewPlaneId)]
            : undefined;
          let background = (row + col) % 2 === 0 ? "#45423c" : "#4d4a42";
          if (displayPlaneId) background = planeColor?.background ?? "#81b64c";
          if (isPreview) background = previewColorPalette?.background ?? planeColor?.background ?? "#81b64c";

          let icon: string | null = null;
          if (status === "hit" || status === "sunk") icon = "❌";
          else if (status === "head") icon = "❌";

          // Pentru un avion, marginile spre celule ale ACELUIAȘI avion sunt punctate
          // (delimitare internă a formei), iar marginile spre exterior (afara avionului
          // sau spre alt avion) rămân continue, ca un contur clar al formei.
          // Când celula face parte din previzualizarea unui avion tras (plasare/mutare),
          // fundalul își păstrează culoarea proprie a avionului; conturul rămâne cel
          // normal (culoarea avionului) când plasarea e validă, și devine roșu doar
          // când e invalidă — fără indicator verde de "valid".
          let borderTop: string | undefined;
          let borderRight: string | undefined;
          let borderBottom: string | undefined;
          let borderLeft: string | undefined;
          if (isPreview) {
            const ownColor = previewColorPalette?.border ?? planeColor?.border ?? "#5f9a3a";
            const solid = previewValid ? `1px solid ${ownColor}` : "2px solid #e74c3c";
            const dashed = `1px dashed ${ownColor}`;
            const sameNeighbor = (r: number, c: number) => previewKeys.has(`${r}:${c}`);
            borderTop = sameNeighbor(row - 1, col) ? dashed : solid;
            borderBottom = sameNeighbor(row + 1, col) ? dashed : solid;
            borderLeft = sameNeighbor(row, col - 1) ? dashed : solid;
            borderRight = sameNeighbor(row, col + 1) ? dashed : solid;
          } else if (displayPlaneId) {
            const solid = `1px solid ${planeColor?.border ?? "#5f9a3a"}`;
            const dashed = `1px dashed ${planeColor?.border ?? "#5f9a3a"}`;
            const sameNeighbor = (r: number, c: number) => planeIdForDisplay(r, c) === displayPlaneId;
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
              data-row={row}
              data-col={col}
              onPointerDown={(e) => {
                // Doar click stânga (mouse) sau atingere/pen pornesc mutarea unui avion
                // deja plasat; restul (click dreapta etc.) sunt ignorate.
                if (!occupyingPlaneId || !onPlanesChange) return;
                if (e.pointerType === "mouse" && e.button !== 0) return;
                const existing = planes.find((p) => p.id === occupyingPlaneId);
                if (!existing) return;
                pointerDragRef.current = {
                  pointerId: e.pointerId,
                  planeId: occupyingPlaneId,
                  startX: e.clientX,
                  startY: e.clientY,
                  offset: { row: row - existing.head.row, col: col - existing.head.col },
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const drag = pointerDragRef.current;
                if (!drag || drag.pointerId !== e.pointerId) return;
                const movedPx = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
                // Nu ridicăm avionul de pe grid decât după ce mișcarea depășește un prag
                // mic — altfel un simplu click/dublu-click ar "ridica" avionul degeaba.
                if (!draggingPlaneId && movedPx < DRAG_THRESHOLD_PX) return;
                if (!draggingPlaneId) {
                  setDraggingPlaneId(drag.planeId);
                  setDragGrabOffset(drag.offset);
                }
                const cell = cellAtPoint(e.clientX, e.clientY);
                if (cell) setHoverCell(cell);
              }}
              onPointerUp={(e) => {
                const drag = pointerDragRef.current;
                if (!drag || drag.pointerId !== e.pointerId) return;
                if (draggingPlaneId) {
                  const cell = cellAtPoint(e.clientX, e.clientY) ?? hoverCell;
                  if (cell) {
                    handleDrop(cell.row, cell.col);
                  } else {
                    endPointerDrag();
                  }
                }
                pointerDragRef.current = null;
              }}
              onPointerCancel={() => endPointerDrag()}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
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
              onContextMenu={(e) => {
                if (!onCellRightClick) return;
                e.preventDefault();
                // Nu are sens să adaugi o hașură nouă pe o celulă unde s-a tras deja
                // și a fost "apă" (nor) - acolo sigur nu poate fi un avion. Dar dacă
                // celula era deja hașurată, tot trebuie să poți anula hașurarea.
                if (status === "miss" && !annotationColor) return;
                onCellRightClick({ row, col });
              }}
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                background,
                borderTop,
                borderRight,
                borderBottom,
                borderLeft,
                cursor:
                  occupyingPlaneId && onPlanesChange
                    ? draggingPlaneId === occupyingPlaneId
                      ? "grabbing"
                      : "grab"
                    : onCellClick
                      ? "pointer"
                      : "default",
                touchAction: occupyingPlaneId && onPlanesChange ? "none" : undefined,
                fontSize: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              {annotationColor && (
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: `repeating-linear-gradient(45deg, ${annotationColor} 0, ${annotationColor} 4px, transparent 4px, transparent 10px)`,
                    opacity: 0.6,
                    pointerEvents: "none",
                  }}
                />
              )}
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

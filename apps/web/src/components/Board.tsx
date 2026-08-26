import { BOARD_SIZE } from "@flight/game-logic";
import type { Cell } from "@flight/types";

interface BoardProps {
  onCellClick?: (cell: Cell) => void;
  markedCells?: { cell: Cell; status: "hit" | "miss" | "sunk" }[];
}

export function Board({ onCellClick, markedCells = [] }: BoardProps) {
  const rows = Array.from({ length: BOARD_SIZE }, (_, row) => row);
  const cols = Array.from({ length: BOARD_SIZE }, (_, col) => col);

  const statusFor = (row: number, col: number) =>
    markedCells.find((m) => m.cell.row === row && m.cell.col === col)?.status;

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${BOARD_SIZE}, 32px)`, gap: 2 }}>
      {rows.map((row) =>
        cols.map((col) => {
          const status = statusFor(row, col);
          return (
            <button
              key={`${row}-${col}`}
              onClick={() => onCellClick?.({ row, col })}
              style={{
                width: 32,
                height: 32,
                background: status === "hit" || status === "sunk" ? "#e74c3c" : status === "miss" ? "#95a5a6" : "#3498db",
              }}
            />
          );
        })
      )}
    </div>
  );
}

// Tipuri partajate între server și client (web/mobile).

export type Cell = {
  row: number; // 0-9
  col: number; // 0-9
};

export type PlaneOrientation = "N" | "S" | "E" | "W";

export type PlanePlacement = {
  id: string;
  head: Cell; // celula "cap" a avionului, restul formei se calculează din orientare
  orientation: PlaneOrientation;
};

export type ShotResult = "hit" | "miss" | "sunk";

export type Shot = {
  cell: Cell;
  result: ShotResult;
  byPlayerId: string;
};

export type GameStatus = "waiting" | "placing" | "in_progress" | "finished";

export interface Player {
  id: string;
  username: string;
}

export interface GameState {
  id: string;
  status: GameStatus;
  players: Player[];
  currentTurnPlayerId: string | null;
  shots: Shot[];
  winnerId: string | null;
}

// --- Evenimente Socket.io (client <-> server) ---

export interface ClientToServerEvents {
  "game:join": (payload: { gameId: string }) => void;
  "game:placePlanes": (payload: { gameId: string; planes: PlanePlacement[] }) => void;
  "game:shoot": (payload: { gameId: string; cell: Cell }) => void;
  "game:resign": (payload: { gameId: string }) => void;
}

export interface ServerToClientEvents {
  "game:state": (state: GameState) => void;
  "game:error": (payload: { message: string }) => void;
}

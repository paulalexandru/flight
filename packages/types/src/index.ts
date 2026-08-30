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

export type ShotResult = "hit" | "miss" | "sunk" | "head";

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

  // Matchmaking simplu + prezență în sală (fază curentă, fără logică de joc încă)
  "matchmaking:findMatch": () => void;
  "matchmaking:cancel": () => void;
  "room:join": (payload: { gameId: string }) => void;
  "room:leave": (payload: { gameId: string }) => void;

  // Plasare avioane + luptă propriu-zisă (în memorie, per sală)
  "placement:ready": (payload: { gameId: string; planes: PlanePlacement[] }) => void;
  "battle:shoot": (payload: { gameId: string; cell: Cell }) => void;
}

export interface ServerToClientEvents {
  "matchmaking:matched": (payload: { gameId: string }) => void;
  "room:state": (payload: { gameId: string; playerIds: string[] }) => void;
  "room:activity": (payload: { gameId: string; playerId: string; type: "joined" | "left"; at: number }) => void;

  // Numărul total de utilizatori conectați la site în acest moment (nu doar
  // cei dintr-o sală anume) — afișat în bara de navigare.
  "presence:onlineCount": (payload: { count: number }) => void;

  "game:state": (state: GameState) => void;
  "game:error": (payload: { message: string }) => void;

  // Confirmă cine e gata (a plasat avioanele) în sala curentă.
  "placement:status": (payload: { gameId: string; readyPlayerIds: string[] }) => void;
  // Ambii jucători sunt gata -> începe lupta; se alege aleator cine mută primul.
  "battle:started": (payload: { gameId: string; firstPlayerId: string }) => void;
  "battle:shot": (payload: { gameId: string; byPlayerId: string; cell: Cell; result: ShotResult }) => void;
  "battle:over": (payload: {
    gameId: string;
    winnerId: string;
    // Avioanele ambilor jucători (indexate după playerId), dezvăluite la finalul
    // partidei, ca fiecare jucător să vadă cum era aranjată tabla adversarului.
    planes: Record<string, PlanePlacement[]>;
  }) => void;
  // Trimis jucătorului care (re)intră într-o sală, ca să-și poată reconstrui local
  // starea jocului aflat deja în desfășurare (dacă a ieșit și a revenit, de exemplu).
  "battle:sync": (payload: {
    gameId: string;
    myPlanes: PlanePlacement[] | null;
    readyPlayerIds: string[];
    started: boolean;
    isMyTurn: boolean;
    winnerId: string | null;
    myShots: Shot[];
    incomingShots: Shot[];
    // Avioanele adversarului, populate doar dacă jocul s-a terminat deja (altfel `null`).
    opponentPlanes: PlanePlacement[] | null;
  }) => void;
}

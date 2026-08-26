import type { GameState, Player, PlanePlacement, Shot } from "@flight/types";
import { hasPlayerLost, resolveShot } from "@flight/game-logic";

/**
 * Starea partidelor active, ținută în memoria procesului (fără Redis).
 * Suficient pentru un singur server; de revizuit dacă se scalează orizontal.
 */
interface InternalGame extends GameState {
  planesByPlayerId: Record<string, PlanePlacement[]>;
}

const games = new Map<string, InternalGame>();

export function createGame(gameId: string, host: Player): InternalGame {
  const game: InternalGame = {
    id: gameId,
    status: "waiting",
    players: [host],
    currentTurnPlayerId: null,
    shots: [],
    winnerId: null,
    planesByPlayerId: {},
  };
  games.set(gameId, game);
  return game;
}

export function getGame(gameId: string): InternalGame | undefined {
  return games.get(gameId);
}

export function joinGame(gameId: string, player: Player): InternalGame | null {
  const game = games.get(gameId);
  if (!game || game.players.length >= 2) return null;
  game.players.push(player);
  game.status = "placing";
  return game;
}

export function placePlanes(
  gameId: string,
  playerId: string,
  planes: PlanePlacement[]
): InternalGame | null {
  const game = games.get(gameId);
  if (!game) return null;
  game.planesByPlayerId[playerId] = planes;

  const allPlaced = game.players.every((p) => game.planesByPlayerId[p.id]?.length);
  if (allPlaced) {
    game.status = "in_progress";
    game.currentTurnPlayerId = game.players[0].id;
  }
  return game;
}

export function shoot(
  gameId: string,
  byPlayerId: string,
  cell: Shot["cell"]
): { game: InternalGame; shot: Shot } | null {
  const game = games.get(gameId);
  if (!game || game.status !== "in_progress" || game.currentTurnPlayerId !== byPlayerId) {
    return null;
  }

  const opponent = game.players.find((p) => p.id !== byPlayerId);
  if (!opponent) return null;

  const opponentPlanes = game.planesByPlayerId[opponent.id] ?? [];
  const previousHitKeys = new Set(
    game.shots
      .filter((s) => s.byPlayerId === byPlayerId && s.result !== "miss")
      .map((s) => `${s.cell.row}:${s.cell.col}`)
  );

  const { result } = resolveShot(cell, opponentPlanes, previousHitKeys);
  const shotRecord: Shot = { cell, result, byPlayerId };
  game.shots.push(shotRecord);

  const shotsAgainstOpponent = game.shots.filter((s) => s.byPlayerId === byPlayerId);
  if (hasPlayerLost(opponentPlanes, shotsAgainstOpponent)) {
    game.status = "finished";
    game.winnerId = byPlayerId;
  } else if (result === "miss") {
    game.currentTurnPlayerId = opponent.id;
  }

  return { game, shot: shotRecord };
}

export function resign(gameId: string, playerId: string): InternalGame | null {
  const game = games.get(gameId);
  if (!game) return null;
  const opponent = game.players.find((p) => p.id !== playerId);
  game.status = "finished";
  game.winnerId = opponent?.id ?? null;
  return game;
}

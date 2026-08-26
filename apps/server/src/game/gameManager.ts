import type { GameState, Player, PlanePlacement, Shot } from "@flight/types";
import { hasPlayerLost, resolveShot } from "@flight/game-logic";
import {
  finishGame,
  insertGame,
  recordMove,
  setSecondPlayer,
  updateGameStatus,
  upsertGuestUser,
} from "../db/gamesRepository";

/**
 * Starea partidelor active, ținută în memoria procesului (fără Redis).
 * Suficient pentru un singur server; de revizuit dacă se scalează orizontal.
 */
interface InternalGame extends GameState {
  planesByPlayerId: Record<string, PlanePlacement[]>;
}

const games = new Map<string, InternalGame>();

export async function createGame(gameId: string, host: Player): Promise<InternalGame> {
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

  await upsertGuestUser(host.id, host.username);
  await insertGame(gameId, host.id);

  return game;
}

export function getGame(gameId: string): InternalGame | undefined {
  return games.get(gameId);
}

export async function joinGame(gameId: string, player: Player): Promise<InternalGame | null> {
  const game = games.get(gameId);
  if (!game || game.players.length >= 2) return null;
  game.players.push(player);
  game.status = "placing";

  await upsertGuestUser(player.id, player.username);
  await setSecondPlayer(gameId, player.id);

  return game;
}

export async function placePlanes(
  gameId: string,
  playerId: string,
  planes: PlanePlacement[]
): Promise<InternalGame | null> {
  const game = games.get(gameId);
  if (!game) return null;
  game.planesByPlayerId[playerId] = planes;

  const allPlaced = game.players.every((p) => game.planesByPlayerId[p.id]?.length);
  if (allPlaced) {
    game.status = "in_progress";
    game.currentTurnPlayerId = game.players[0].id;
    await updateGameStatus(gameId, "in_progress");
  }
  return game;
}

export async function shoot(
  gameId: string,
  byPlayerId: string,
  cell: Shot["cell"]
): Promise<{ game: InternalGame; shot: Shot } | null> {
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
  await recordMove(gameId, byPlayerId, cell, result);

  const shotsAgainstOpponent = game.shots.filter((s) => s.byPlayerId === byPlayerId);
  if (hasPlayerLost(opponentPlanes, shotsAgainstOpponent)) {
    game.status = "finished";
    game.winnerId = byPlayerId;
    await finishGame(gameId, byPlayerId);
  } else if (result === "miss") {
    game.currentTurnPlayerId = opponent.id;
  }

  return { game, shot: shotRecord };
}

export async function resign(gameId: string, playerId: string): Promise<InternalGame | null> {
  const game = games.get(gameId);
  if (!game) return null;
  const opponent = game.players.find((p) => p.id !== playerId);
  game.status = "finished";
  game.winnerId = opponent?.id ?? null;
  await finishGame(gameId, opponent?.id ?? null);
  return game;
}

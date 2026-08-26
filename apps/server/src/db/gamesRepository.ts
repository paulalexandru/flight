import type { Cell, GameStatus, ShotResult } from "@flight/types";
import { pool } from "./mysql";

/** Creează jucătorul dacă nu există deja (guest, fără parolă/email). */
export async function upsertGuestUser(id: string, username: string): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, username, is_guest)
     VALUES (?, ?, TRUE)
     ON DUPLICATE KEY UPDATE username = VALUES(username)`,
    [id, username]
  );
}

export async function insertGame(gameId: string, player1Id: string): Promise<void> {
  await pool.query(
    `INSERT INTO games (id, player1_id, status) VALUES (?, ?, 'waiting')
     ON DUPLICATE KEY UPDATE id = id`,
    [gameId, player1Id]
  );
}

export async function setSecondPlayer(gameId: string, player2Id: string): Promise<void> {
  await pool.query(
    `UPDATE games SET player2_id = ?, status = 'placing' WHERE id = ?`,
    [player2Id, gameId]
  );
}

export async function updateGameStatus(gameId: string, status: GameStatus): Promise<void> {
  await pool.query(`UPDATE games SET status = ? WHERE id = ?`, [status, gameId]);
}

export async function recordMove(
  gameId: string,
  playerId: string,
  cell: Cell,
  result: ShotResult
): Promise<void> {
  await pool.query(
    `INSERT INTO moves (game_id, player_id, row_index, col_index, result) VALUES (?, ?, ?, ?, ?)`,
    [gameId, playerId, cell.row, cell.col, result]
  );
}

export async function finishGame(gameId: string, winnerId: string | null): Promise<void> {
  await pool.query(
    `UPDATE games SET status = 'finished', winner_id = ?, finished_at = NOW() WHERE id = ?`,
    [winnerId, gameId]
  );
}

export interface GameHistoryEntry {
  id: string;
  player1_id: string;
  player2_id: string | null;
  status: GameStatus;
  winner_id: string | null;
  created_at: Date;
  finished_at: Date | null;
}

/** Istoricul partidelor unui jucător (finalizate sau în desfășurare), cele mai recente primele. */
export async function getGameHistoryForPlayer(playerId: string): Promise<GameHistoryEntry[]> {
  const [rows] = await pool.query(
    `SELECT id, player1_id, player2_id, status, winner_id, created_at, finished_at
     FROM games
     WHERE player1_id = ? OR player2_id = ?
     ORDER BY created_at DESC`,
    [playerId, playerId]
  );
  return rows as GameHistoryEntry[];
}

export interface MoveHistoryEntry {
  player_id: string;
  row_index: number;
  col_index: number;
  result: ShotResult;
  created_at: Date;
}

export async function getMovesForGame(gameId: string): Promise<MoveHistoryEntry[]> {
  const [rows] = await pool.query(
    `SELECT player_id, row_index, col_index, result, created_at
     FROM moves
     WHERE game_id = ?
     ORDER BY created_at ASC`,
    [gameId]
  );
  return rows as MoveHistoryEntry[];
}

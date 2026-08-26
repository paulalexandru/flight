import type { Cell, PlanePlacement, Shot } from "@flight/types";
import { isValidPlanePlacement, getOccupiedCellKeys, resolveShot, hasPlayerLost, TOTAL_PLANES_PER_PLAYER, cellKey } from "@flight/game-logic";

/**
 * Stare de luptă în memorie, per sală (gameId). Nu depinde de MySQL — ținem
 * doar cât timp cei doi jucători sunt conectați în aceeași sală.
 */
interface BattleState {
  gameId: string;
  planesByPlayer: Map<string, PlanePlacement[]>;
  readyPlayerIds: Set<string>;
  started: boolean;
  currentTurnPlayerId: string | null;
  shotsByShooter: Map<string, Shot[]>; // loviturile date DE fiecare jucător (asupra adversarului)
  winnerId: string | null;
}

const battles = new Map<string, BattleState>();

function getOrCreateBattle(gameId: string): BattleState {
  let battle = battles.get(gameId);
  if (!battle) {
    battle = {
      gameId,
      planesByPlayer: new Map(),
      readyPlayerIds: new Set(),
      started: false,
      currentTurnPlayerId: null,
      shotsByShooter: new Map(),
      winnerId: null,
    };
    battles.set(gameId, battle);
  }
  return battle;
}

export function resetBattle(gameId: string): void {
  battles.delete(gameId);
}

export function submitPlacement(
  gameId: string,
  playerId: string,
  planes: PlanePlacement[]
): { ok: true } | { ok: false; error: string } {
  if (planes.length !== TOTAL_PLANES_PER_PLAYER) {
    return { ok: false, error: `Trebuie plasate exact ${TOTAL_PLANES_PER_PLAYER} avioane.` };
  }

  for (const plane of planes) {
    const alreadyOccupied = getOccupiedCellKeys(planes, plane.id);
    if (!isValidPlanePlacement(plane, alreadyOccupied)) {
      return { ok: false, error: "Plasare invalidă (suprapunere sau în afara tablei)." };
    }
  }

  const battle = getOrCreateBattle(gameId);
  battle.planesByPlayer.set(playerId, planes);
  battle.readyPlayerIds.add(playerId);
  return { ok: true };
}

export function getReadyPlayerIds(gameId: string): string[] {
  return Array.from(battles.get(gameId)?.readyPlayerIds ?? []);
}

/**
 * Verifică dacă ambii jucători din sală (playerIds) au plasat avioanele.
 * Dacă da și lupta nu a început încă, pornește lupta cu un jucător ales aleator.
 */
export function tryStartBattle(
  gameId: string,
  roomPlayerIds: string[]
): { started: true; firstPlayerId: string } | { started: false } {
  const battle = getOrCreateBattle(gameId);
  if (battle.started) return { started: false };
  if (roomPlayerIds.length !== 2) return { started: false };
  const allReady = roomPlayerIds.every((id) => battle.readyPlayerIds.has(id));
  if (!allReady) return { started: false };

  battle.started = true;
  const firstPlayerId = roomPlayerIds[Math.floor(Math.random() * roomPlayerIds.length)];
  battle.currentTurnPlayerId = firstPlayerId;
  return { started: true, firstPlayerId };
}

export function isBattleStarted(gameId: string): boolean {
  return battles.get(gameId)?.started ?? false;
}

export function shoot(
  gameId: string,
  shooterPlayerId: string,
  opponentPlayerId: string,
  cell: Cell
):
  | { ok: true; result: Shot["result"]; gameOver: boolean }
  | { ok: false; error: string } {
  const battle = battles.get(gameId);
  if (!battle || !battle.started) {
    return { ok: false, error: "Lupta nu a început încă." };
  }
  if (battle.currentTurnPlayerId !== shooterPlayerId) {
    return { ok: false, error: "Nu este rândul tău." };
  }

  const opponentPlanes = battle.planesByPlayer.get(opponentPlayerId) ?? [];
  const previousShots = battle.shotsByShooter.get(shooterPlayerId) ?? [];
  const alreadyShot = previousShots.some((s) => cellKey(s.cell) === cellKey(cell));
  if (alreadyShot) {
    return { ok: false, error: "Ai tras deja în această celulă." };
  }

  const previousHitKeys = new Set(
    previousShots.filter((s) => s.result !== "miss").map((s) => cellKey(s.cell))
  );
  const { result } = resolveShot(cell, opponentPlanes, previousHitKeys);

  const shot: Shot = { cell, result, byPlayerId: shooterPlayerId };
  battle.shotsByShooter.set(shooterPlayerId, [...previousShots, shot]);

  const gameOver = hasPlayerLost(opponentPlanes, battle.shotsByShooter.get(shooterPlayerId) ?? []);
  if (gameOver) {
    battle.winnerId = shooterPlayerId;
  } else if (result === "miss") {
    // Rândul trece la adversar doar dacă a fost ratare.
    battle.currentTurnPlayerId = opponentPlayerId;
  }

  return { ok: true, result, gameOver };
}

export function getWinnerId(gameId: string): string | null {
  return battles.get(gameId)?.winnerId ?? null;
}

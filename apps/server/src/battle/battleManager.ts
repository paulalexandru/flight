import type { Cell, PlanePlacement, Shot } from "@flight/types";
import { isValidPlanePlacement, getOccupiedCellKeys, resolveShot, hasFoundAllPlaneHeads, cellKey, TOTAL_PLANES_PER_PLAYER } from "@flight/game-logic";

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

export function isBattleOver(gameId: string): boolean {
  return battles.get(gameId)?.winnerId != null;
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
  if (battle.winnerId) {
    return { ok: false, error: "Jocul s-a terminat deja." };
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

  const gameOver = hasFoundAllPlaneHeads(opponentPlanes, battle.shotsByShooter.get(shooterPlayerId) ?? []);
  if (gameOver) {
    battle.winnerId = shooterPlayerId;
  } else {
    // Fiecare jucător are dreptul la o singură mutare pe rând, indiferent de rezultat.
    battle.currentTurnPlayerId = opponentPlayerId;
  }

  return { ok: true, result, gameOver };
}

export function getWinnerId(gameId: string): string | null {
  return battles.get(gameId)?.winnerId ?? null;
}

/**
 * Un jucător a părăsit sala (voluntar sau prin deconectare) în timp ce o luptă
 * era deja în desfășurare și nefinalizată -> adversarul câștigă automat prin
 * abandon (nu are sens să continue jocul cu un singur jucător prezent).
 * Întoarce id-ul câștigătorului doar dacă acest abandon chiar a decis jocul
 * (nu dacă lupta nu începuse încă sau era deja terminată).
 */
export function forfeitBattle(gameId: string, leavingPlayerId: string): string | null {
  const battle = battles.get(gameId);
  if (!battle || !battle.started || battle.winnerId) return null;
  const opponentId = Array.from(battle.planesByPlayer.keys()).find((id) => id !== leavingPlayerId);
  if (!opponentId) return null;
  battle.winnerId = opponentId;
  return opponentId;
}

/** Avioanele plasate de un jucător anume, într-o sală (folosit la finalul jocului
 * pentru a le dezvălui adversarului). */
export function getPlanesFor(gameId: string, playerId: string): PlanePlacement[] {
  return battles.get(gameId)?.planesByPlayer.get(playerId) ?? [];
}

/**
 * Instantaneu al stării de luptă pentru un jucător anume, folosit pentru a-l
 * "resincroniza" dacă a ieșit din sală (fără să termine jocul) și a reintrat.
 */
export function getBattleSyncFor(
  gameId: string,
  playerId: string,
  opponentId: string | null
): {
  myPlanes: PlanePlacement[] | null;
  readyPlayerIds: string[];
  started: boolean;
  isMyTurn: boolean;
  winnerId: string | null;
  myShots: Shot[];
  incomingShots: Shot[];
  opponentPlanes: PlanePlacement[] | null;
} {
  const battle = battles.get(gameId);
  if (!battle) {
    return {
      myPlanes: null,
      readyPlayerIds: [],
      started: false,
      isMyTurn: false,
      winnerId: null,
      myShots: [],
      incomingShots: [],
      opponentPlanes: null,
    };
  }
  return {
    myPlanes: battle.planesByPlayer.get(playerId) ?? null,
    readyPlayerIds: Array.from(battle.readyPlayerIds),
    started: battle.started,
    isMyTurn: battle.currentTurnPlayerId === playerId,
    winnerId: battle.winnerId,
    myShots: battle.shotsByShooter.get(playerId) ?? [],
    incomingShots: opponentId ? battle.shotsByShooter.get(opponentId) ?? [] : [],
    // Dezvăluim avioanele adversarului doar dacă jocul s-a terminat deja — altfel
    // ar fi un avantaj neloial să le vezi în timp ce lupta e încă în desfășurare.
    opponentPlanes: battle.winnerId && opponentId ? battle.planesByPlayer.get(opponentId) ?? [] : null,
  };
}

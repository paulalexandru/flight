import type { Server } from "socket.io";
import type { Cell, ClientToServerEvents, PlanePlacement, ServerToClientEvents, Shot } from "@flight/types";
import { isValidPlanePlacement, getOccupiedCellKeys, resolveShot, hasFoundAllPlaneHeads, cellKey, TOTAL_PLANES_PER_PLAYER } from "@flight/game-logic";
import { removePlayerFromRoom, getRoomRoster } from "../rooms/roomRoster";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;

// Fiecare jucător are 30 de secunde (comune, aceeași fereastră) să-și plaseze
// avioanele; dacă expiră fără ca AMBII să fi apăsat "Gata", partida se anulează
// (fără câștigător/pierzător) și se repornește o fereastră nouă de plasare.
const PLACEMENT_WINDOW_MS = 30_000;
// Ceas de șah: fiecare jucător are 5 minute în total, consumate DOAR cât timp e
// rândul lui. Dacă îi expiră timpul în timpul rândului lui, pierde automat.
const BATTLE_CLOCK_MS = 5 * 60_000;

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
  // Setat când meciul a fost anulat (ex: un jucător nu și-a plasat avioanele
  // la timp) — sala nu mai poate fi refolosită de niciunul dintre cei doi.
  cancelled: boolean;
  // Fereastra de plasare (30s comune) — doar înainte ca lupta să înceapă.
  placementDeadline: number | null;
  placementTimer: NodeJS.Timeout | null;
  // Ceasul de șah al luptei (5 min/jucător, scade doar în rândul propriu).
  battleClockMs: Map<string, number>;
  turnStartedAt: number | null;
  turnTimer: NodeJS.Timeout | null;
  // Adevărat cât timp ceasul de luptă e "înghețat" (un jucător a ieșit din sală
  // în timpul luptei) — reluăm de unde am rămas când revine, fără să-i scădem
  // timp nimănui cât lipsește.
  clockPaused: boolean;
}

const battles = new Map<string, BattleState>();
let ioRef: AppServer | null = null;

/** Trebuie apelat o singură dată la pornirea serverului, ca temporizatoarele
 * interne (plasare/ceas de luptă) să poată emite evenimente către clienți. */
export function initBattleTimers(io: AppServer): void {
  ioRef = io;
}

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
      cancelled: false,
      placementDeadline: null,
      placementTimer: null,
      battleClockMs: new Map(),
      turnStartedAt: null,
      turnTimer: null,
      clockPaused: false,
    };
    battles.set(gameId, battle);
  }
  return battle;
}

function clearPlacementTimer(battle: BattleState): void {
  if (battle.placementTimer) {
    clearTimeout(battle.placementTimer);
    battle.placementTimer = null;
  }
  battle.placementDeadline = null;
}

function clearTurnTimer(battle: BattleState): void {
  if (battle.turnTimer) {
    clearTimeout(battle.turnTimer);
    battle.turnTimer = null;
  }
}

export function resetBattle(gameId: string): void {
  const battle = battles.get(gameId);
  if (battle) {
    clearPlacementTimer(battle);
    clearTurnTimer(battle);
  }
  battles.delete(gameId);
}

/**
 * Pornește (sau repornește) fereastra de 30s de plasare pentru o sală, dacă
 * lupta nu a început deja. Se apelează când sala ajunge la 2 jucători. Dacă
 * expiră fără ca ambii să fi confirmat plasarea, resetăm plasările/ready-ul
 * ambilor și repornim o fereastră nouă (nimeni nu câștigă/pierde din asta).
 */
export function startPlacementWindow(gameId: string, roomPlayerIds: string[]): void {
  const battle = getOrCreateBattle(gameId);
  if (battle.started || battle.winnerId) return;
  if (battle.placementTimer) return; // deja pornită
  battle.placementDeadline = Date.now() + PLACEMENT_WINDOW_MS;
  ioRef?.to(gameId).emit("placement:deadline", { gameId, deadline: battle.placementDeadline });
  battle.placementTimer = setTimeout(() => {
    battle.placementTimer = null;
    battle.placementDeadline = null;
    if (battle.started || battle.winnerId) return;
    const allReady = roomPlayerIds.length === 2 && roomPlayerIds.every((id) => battle.readyPlayerIds.has(id));
    if (allReady) return; // improbabil (ar fi pornit deja lupta), dar nu anulăm dacă totuși sunt gata
    const readyCount = roomPlayerIds.filter((id) => battle.readyPlayerIds.has(id)).length;
    const blamedPlayerId = readyCount === 1 ? roomPlayerIds.find((id) => !battle.readyPlayerIds.has(id)) ?? null : null;
    battle.planesByPlayer.clear();
    battle.readyPlayerIds.clear();
    if (readyCount === 1) {
      // Un jucător a plasat la timp, celălalt nu -> vinovatul e scos din sală,
      // meciul se anulează definitiv (nu repornim o fereastră nouă); sala rămâne
      // marcată drept încheiată, ca niciunul din cei doi să nu mai fie repartizat
      // automat înapoi în ea printr-un matchmaking ulterior.
      battle.cancelled = true;
      if (blamedPlayerId) {
        removePlayerFromRoom(gameId, blamedPlayerId);
      }
      ioRef?.to(gameId).emit("placement:cancelled", { gameId, blamedPlayerId });
      ioRef?.to(gameId).emit("room:state", { gameId, playerIds: getRoomRoster(gameId) });
    } else {
      // Niciunul dintre cei doi nu și-a plasat avioanele la timp -> ambii sunt
      // scoși din sală (fără vinovat unic), meciul se anulează definitiv.
      battle.cancelled = true;
      roomPlayerIds.forEach((id) => removePlayerFromRoom(gameId, id));
      ioRef?.to(gameId).emit("placement:cancelled", { gameId, blamedPlayerId: null, bothBlamed: true });
      ioRef?.to(gameId).emit("room:state", { gameId, playerIds: getRoomRoster(gameId) });
    }
  }, PLACEMENT_WINDOW_MS);
}

/** Oprește fereastra de plasare (ex: un jucător a ieșit din sală, sub 2 prezenți). */
export function cancelPlacementWindow(gameId: string): void {
  const battle = battles.get(gameId);
  if (!battle) return;
  clearPlacementTimer(battle);
}

export function getPlacementDeadline(gameId: string): number | null {
  return battles.get(gameId)?.placementDeadline ?? null;
}

/** Programează pierderea automată a jucătorului aflat la rând dacă îi expiră
 * ceasul de 5 minute înainte să tragă. */
function armTurnTimer(gameId: string, battle: BattleState, activePlayerId: string): void {
  clearTurnTimer(battle);
  const remaining = battle.battleClockMs.get(activePlayerId) ?? 0;
  battle.turnTimer = setTimeout(() => {
    battle.turnTimer = null;
    if (!battle.started || battle.winnerId) return;
    if (battle.currentTurnPlayerId !== activePlayerId) return;
    battle.battleClockMs.set(activePlayerId, 0);
    const opponentId = Array.from(battle.planesByPlayer.keys()).find((id) => id !== activePlayerId);
    if (!opponentId) return;
    battle.winnerId = opponentId;
    const planes: Record<string, PlanePlacement[]> = {
      [activePlayerId]: battle.planesByPlayer.get(activePlayerId) ?? [],
      [opponentId]: battle.planesByPlayer.get(opponentId) ?? [],
    };
    ioRef?.to(gameId).emit("battle:over", { gameId, winnerId: opponentId, planes, reason: "timeout" });
  }, Math.max(0, remaining));
}

/** Pune pauza pe ceasul de luptă (ex: adversarul jucătorului aflat la rând iese
 * din sală) — oprim temporizatorul de expirare a rândului și "înghețăm" timpul
 * scurs până acum, ca jucătorul rămas să nu-și piardă timpul cât lipsește celălalt.
 * IMPORTANT: dacă cel care a ieșit este chiar jucătorul aflat la rând, ceasul LUI
 * trebuie să continue să curgă normal (penalizare pentru că a plecat pe propria
 * mutare) - punem pauză doar când cel plecat NU e cel aflat la rând. */
export function pauseBattleClock(gameId: string, leavingPlayerId: string): void {
  const battle = battles.get(gameId);
  if (!battle || !battle.started || battle.winnerId || battle.clockPaused) return;
  if (battle.currentTurnPlayerId === leavingPlayerId) return;
  if (battle.turnStartedAt != null && battle.currentTurnPlayerId) {
    const elapsed = Date.now() - battle.turnStartedAt;
    const remaining = battle.battleClockMs.get(battle.currentTurnPlayerId) ?? 0;
    battle.battleClockMs.set(battle.currentTurnPlayerId, Math.max(0, remaining - elapsed));
  }
  clearTurnTimer(battle);
  battle.turnStartedAt = null;
  battle.clockPaused = true;
  ioRef?.to(gameId).emit("battle:clock", { gameId, ...getBattleClockSnapshot(gameId) });
}

/** Repornește ceasul de luptă exact de unde a rămas, pentru jucătorul aflat la
 * rând (ex: adversarul a revenit la timp în sală). */
export function resumeBattleClock(gameId: string): void {
  const battle = battles.get(gameId);
  if (!battle || !battle.started || battle.winnerId || !battle.clockPaused) return;
  battle.clockPaused = false;
  if (battle.currentTurnPlayerId) {
    battle.turnStartedAt = Date.now();
    armTurnTimer(gameId, battle, battle.currentTurnPlayerId);
  }
  ioRef?.to(gameId).emit("battle:clock", { gameId, ...getBattleClockSnapshot(gameId) });
}

export function getBattleClockSnapshot(
  gameId: string
): { clockByPlayer: Record<string, number>; currentTurnPlayerId: string | null; turnStartedAt: number | null } {
  const battle = battles.get(gameId);
  if (!battle) return { clockByPlayer: {}, currentTurnPlayerId: null, turnStartedAt: null };
  return {
    clockByPlayer: Object.fromEntries(battle.battleClockMs),
    currentTurnPlayerId: battle.currentTurnPlayerId,
    turnStartedAt: battle.turnStartedAt,
  };
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
  clearPlacementTimer(battle);
  const firstPlayerId = roomPlayerIds[Math.floor(Math.random() * roomPlayerIds.length)];
  battle.currentTurnPlayerId = firstPlayerId;
  battle.turnStartedAt = Date.now();
  for (const id of roomPlayerIds) {
    if (!battle.battleClockMs.has(id)) battle.battleClockMs.set(id, BATTLE_CLOCK_MS);
  }
  armTurnTimer(gameId, battle, firstPlayerId);
  return { started: true, firstPlayerId };
}

export function isBattleStarted(gameId: string): boolean {
  return battles.get(gameId)?.started ?? false;
}

/**
 * Rezumatul tuturor luptelor aflate în acest moment în desfășurare (pentru
 * lista "meciuri în progres" din lobby-ul de pe pagina principală). O luptă e
 * considerată "în desfășurare" dacă a început, nu are încă un câștigător și
 * nu a fost anulată. Numărul de mutări = totalul loviturilor date de ambii jucători.
 */
export function getActiveBattlesSummary(
  roomRosterByGameId: (gameId: string) => string[]
): Array<{ gameId: string; playerIds: string[]; currentTurnPlayerId: string | null; moveCount: number }> {
  const result: Array<{ gameId: string; playerIds: string[]; currentTurnPlayerId: string | null; moveCount: number }> = [];
  for (const [gameId, battle] of battles.entries()) {
    if (!battle.started || battle.winnerId != null || battle.cancelled) continue;
    const playerIds = roomRosterByGameId(gameId);
    if (playerIds.length !== 2) continue;
    let moveCount = 0;
    for (const shots of battle.shotsByShooter.values()) {
      moveCount += shots.length;
    }
    result.push({ gameId, playerIds, currentTurnPlayerId: battle.currentTurnPlayerId, moveCount });
  }
  return result;
}

export function isBattleOver(gameId: string): boolean {
  const battle = battles.get(gameId);
  return battle?.winnerId != null || battle?.cancelled === true;
}

/** Marchează o sală drept încheiată/anulată definitiv (nu mai poate fi refolosită
 * de niciun jucător printr-un matchmaking ulterior) - folosit când un jucător
 * iese din sală înainte ca lupta să fi început (fază de plasare avioane).
 * Anunță jucătorul rămas (dacă mai e prezent) că meciul s-a anulat, la fel ca
 * atunci când cineva nu apucă să plaseze avioanele la timp. */
export function cancelBattleForLeave(gameId: string, leavingPlayerId: string): void {
  const battle = battles.get(gameId);
  if (!battle) return;
  if (battle.cancelled || battle.started) return;
  battle.cancelled = true;
  clearPlacementTimer(battle);
  battle.placementDeadline = null;
  ioRef?.to(gameId).emit("placement:cancelled", { gameId, blamedPlayerId: leavingPlayerId });
  ioRef?.to(gameId).emit("room:state", { gameId, playerIds: getRoomRoster(gameId) });
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

  // Scădem din ceasul jucătorului care tocmai a mutat timpul scurs efectiv în
  // rândul lui (ceas de șah - timpul curge doar cât timp e rândul tău).
  if (battle.turnStartedAt != null) {
    const elapsed = Date.now() - battle.turnStartedAt;
    const remaining = battle.battleClockMs.get(shooterPlayerId) ?? BATTLE_CLOCK_MS;
    battle.battleClockMs.set(shooterPlayerId, Math.max(0, remaining - elapsed));
  }
  clearTurnTimer(battle);

  const gameOver = hasFoundAllPlaneHeads(opponentPlanes, battle.shotsByShooter.get(shooterPlayerId) ?? []);
  if (gameOver) {
    battle.winnerId = shooterPlayerId;
    battle.turnStartedAt = null;
  } else {
    // Fiecare jucător are dreptul la o singură mutare pe rând, indiferent de rezultat.
    battle.currentTurnPlayerId = opponentPlayerId;
    battle.turnStartedAt = Date.now();
    armTurnTimer(gameId, battle, opponentPlayerId);
  }

  return { ok: true, result, gameOver };
}

export function getWinnerId(gameId: string): string | null {
  return battles.get(gameId)?.winnerId ?? null;
}

/**
 * Instantaneu al loviturilor ambilor jucători dintr-o sală, pentru un spectator
 * care tocmai a intrat (fără drept de operare, doar de vizualizare). Diferă de
 * `getBattleSyncFor` prin faptul că NU dezvăluie avioanele nimănui cât timp
 * jocul e în desfășurare (doar loviturile date, ca pe cele două table publice).
 */
export function getSpectatorSyncFor(
  gameId: string,
  playerIds: string[]
): {
  started: boolean;
  winnerId: string | null;
  shotsByPlayer: Record<string, Shot[]>;
  planesByPlayer: Record<string, PlanePlacement[]> | null;
  placementDeadline: number | null;
  clockByPlayer: Record<string, number>;
  currentTurnPlayerId: string | null;
  turnStartedAt: number | null;
} {
  const battle = battles.get(gameId);
  if (!battle) {
    return {
      started: false,
      winnerId: null,
      shotsByPlayer: {},
      planesByPlayer: null,
      placementDeadline: null,
      clockByPlayer: {},
      currentTurnPlayerId: null,
      turnStartedAt: null,
    };
  }
  const shotsByPlayer: Record<string, Shot[]> = {};
  for (const id of playerIds) {
    shotsByPlayer[id] = battle.shotsByShooter.get(id) ?? [];
  }
  // La fel ca la final de joc pentru jucători, dezvăluim avioanele ambilor doar
  // dacă jocul chiar s-a terminat deja.
  const planesByPlayer = battle.winnerId
    ? Object.fromEntries(playerIds.map((id) => [id, battle.planesByPlayer.get(id) ?? []]))
    : null;
  return {
    started: battle.started,
    winnerId: battle.winnerId,
    shotsByPlayer,
    planesByPlayer,
    placementDeadline: battle.placementDeadline,
    clockByPlayer: Object.fromEntries(battle.battleClockMs),
    currentTurnPlayerId: battle.currentTurnPlayerId,
    turnStartedAt: battle.turnStartedAt,
  };
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
  clearTurnTimer(battle);
  clearPlacementTimer(battle);
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
  placementDeadline: number | null;
  clockByPlayer: Record<string, number>;
  turnStartedAt: number | null;
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
      placementDeadline: null,
      clockByPlayer: {},
      turnStartedAt: null,
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
    placementDeadline: battle.placementDeadline,
    clockByPlayer: Object.fromEntries(battle.battleClockMs),
    turnStartedAt: battle.turnStartedAt,
  };
}

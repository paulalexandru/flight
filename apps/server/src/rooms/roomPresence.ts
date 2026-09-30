import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, PlanePlacement, ServerToClientEvents } from "@flight/types";
import { setPlayerGame } from "./activeGames";
import {
  addPlayerToRoom,
  removePlayerFromRoom,
  getRoomRoster,
  addSpectatorToRoom,
  removeSpectatorFromRoom,
  isPlayerInRoom,
} from "./roomRoster";
import { getBattleSyncFor, forfeitBattle, getPlanesFor, getSpectatorSyncFor, startPlacementWindow, isBattleStarted, cancelBattleForLeave, pauseBattleClock, resumeBattleClock } from "../battle/battleManager";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

function broadcastRoomState(io: AppServer, gameId: string): void {
  io.to(gameId).emit("room:state", { gameId, playerIds: getRoomRoster(gameId) });
}

/**
 * Un jucător poate ieși din sală fără să piardă imediat (ex: pierdere de conexiune,
 * click accidental) — abandonul se declară abia dacă NU revine în intervalul de grație.
 * Regulă: maxim 3 ieșiri per meci, cu un total de 30s de grație împărțit între ele
 * (nu 30s la fiecare ieșire, ci 30s cumulate pe tot meciul). Dacă la o ieșire timpul
 * rămas din cele 30s expiră fără să revină, sau dacă iese a 4-a oară, pierde automat.
 */
const LEAVE_GRACE_BUDGET_MS = 30_000;
const MAX_LEAVES_PER_MATCH = 3;
const pendingForfeitTimers = new Map<string, NodeJS.Timeout>();
// Câte ieșiri a făcut deja fiecare jucător în meciul curent.
const leaveCountByKey = new Map<string, number>();
// Cât timp de grație mai are fiecare jucător din cele 30s comune (scade cu timpul
// petrecut efectiv în afara sălii, indiferent la câte ieșiri e împărțit).
const graceBudgetRemainingByKey = new Map<string, number>();
// Timestamp-ul la care a început ieșirea curentă (ca să calculăm cât a stat afară
// dacă revine înainte să expire temporizatorul).
const leaveStartedAtByKey = new Map<string, number>();

function forfeitTimerKey(gameId: string, playerId: string): string {
  return `${gameId}:${playerId}`;
}

// Câte tab-uri/conexiuni socket active are un jucător ÎN ACEEAȘI SALĂ. Necesar
// pentru ca deconectarea/ieșirea dintr-un singur tab (deschis în paralel cu
// altul, cu același playerId stabil) să NU declanșeze imediat abandonul cât
// timp mai există măcar un tab conectat efectiv la acea sală.
const roomConnectionCountByKey = new Map<string, number>();

function registerRoomConnection(gameId: string, playerId: string): number {
  const key = forfeitTimerKey(gameId, playerId);
  const count = (roomConnectionCountByKey.get(key) ?? 0) + 1;
  roomConnectionCountByKey.set(key, count);
  return count;
}

/** Scade contorul; returnează true doar dacă a fost ultima conexiune rămasă. */
function unregisterRoomConnection(gameId: string, playerId: string): boolean {
  const key = forfeitTimerKey(gameId, playerId);
  const count = (roomConnectionCountByKey.get(key) ?? 1) - 1;
  if (count <= 0) {
    roomConnectionCountByKey.delete(key);
    return true;
  }
  roomConnectionCountByKey.set(key, count);
  return false;
}

/** Resetează complet contorul de ieșiri/bugetul de grație (apelat la finalul meciului). */
export function resetLeaveTrackingForGame(gameId: string, playerIds: string[]): void {
  for (const playerId of playerIds) {
    const key = forfeitTimerKey(gameId, playerId);
    leaveCountByKey.delete(key);
    graceBudgetRemainingByKey.delete(key);
    leaveStartedAtByKey.delete(key);
    roomConnectionCountByKey.delete(key);
  }
}

function cancelPendingForfeit(io: AppServer, gameId: string, playerId: string): void {
  const key = forfeitTimerKey(gameId, playerId);
  const timer = pendingForfeitTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    pendingForfeitTimers.delete(key);
    io.to(gameId).emit("forfeit:cancelled", { gameId, playerId });
  }
  // A revenit la timp - scădem din bugetul de grație doar timpul cât a stat
  // efectiv afară (nu tot intervalul alocat inițial).
  const leftAt = leaveStartedAtByKey.get(key);
  if (leftAt != null) {
    const elapsed = Date.now() - leftAt;
    const remaining = graceBudgetRemainingByKey.get(key) ?? LEAVE_GRACE_BUDGET_MS;
    graceBudgetRemainingByKey.set(key, Math.max(0, remaining - elapsed));
    leaveStartedAtByKey.delete(key);
  }
}

/**
 * Dacă jucătorul care tocmai a plecat era într-o luptă în desfășurare (neterminată),
 * programăm abandonul adversarului câștigător după o perioadă de grație (nu imediat),
 * ca să-i lăsăm timp să revină (deconectare temporară, click greșit etc.). Dacă revine
 * la timp, `cancelPendingForfeit` anulează acest temporizator. Adversarul rămas în sală
 * vede o numărătoare inversă (deadline absolut) până la abandonul automat.
 *
 * Regulă nouă: maxim 3 ieșiri per meci; cele 3 ieșiri împart un total de 30s de grație
 * (nu 30s fiecare). Dacă bugetul rămas e deja 0, sau e a 4-a ieșire, abandonul e imediat.
 */
function schedulePossibleForfeit(io: AppServer, gameId: string, leavingPlayerId: string): void {
  cancelPendingForfeit(io, gameId, leavingPlayerId);
  const key = forfeitTimerKey(gameId, leavingPlayerId);

  const leaveCount = (leaveCountByKey.get(key) ?? 0) + 1;
  leaveCountByKey.set(key, leaveCount);
  leaveStartedAtByKey.set(key, Date.now());

  const budgetRemaining = graceBudgetRemainingByKey.get(key) ?? LEAVE_GRACE_BUDGET_MS;

  const declareForfeit = () => {
    pendingForfeitTimers.delete(key);
    leaveStartedAtByKey.delete(key);
    if (isPlayerInRoom(gameId, leavingPlayerId)) return;
    const winnerId = forfeitBattle(gameId, leavingPlayerId);
    if (!winnerId) return;
    const planes: Record<string, PlanePlacement[]> = {
      [leavingPlayerId]: getPlanesFor(gameId, leavingPlayerId),
      [winnerId]: getPlanesFor(gameId, winnerId),
    };
    io.to(gameId).emit("battle:over", { gameId, winnerId, planes });
    resetLeaveTrackingForGame(gameId, [leavingPlayerId, winnerId]);
  };

  // A 4-a ieșire sau bugetul de grație deja epuizat -> abandon imediat, fără
  // altă numărătoare inversă.
  if (leaveCount > MAX_LEAVES_PER_MATCH || budgetRemaining <= 0) {
    declareForfeit();
    return;
  }

  const deadline = Date.now() + budgetRemaining;
  io.to(gameId).emit("forfeit:pending", { gameId, playerId: leavingPlayerId, deadline });
  const timer = setTimeout(declareForfeit, budgetRemaining);
  pendingForfeitTimers.set(key, timer);
}


/**
 * Prezență simplă în sala de joc: cine face parte momentan din camera `gameId`.
 * Identificatorul jucătorului e un id stabil (persistat client-side în localStorage),
 * NU socket.id — altfel o reconectare ar apărea ca un jucător complet nou.
 */
export function registerRoomHandlers(io: AppServer, socket: AppSocket, playerId: string): void {
  socket.on("room:join", ({ gameId }) => {
    socket.join(gameId);
    setPlayerGame(playerId, gameId);

    // Dacă acest playerId era deja jucător în sală (reconectare) sau sala are
    // sub 2 jucători, intră ca jucător propriu-zis; altfel devine spectator
    // (poate doar privi, fără niciun drept de operare).
    const wasAlreadyPlayer = isPlayerInRoom(gameId, playerId);
    const joinedAsPlayer = addPlayerToRoom(gameId, playerId);

    if (joinedAsPlayer) {
      registerRoomConnection(gameId, playerId);
      // A revenit la timp - anulăm orice abandon programat pentru el.
      cancelPendingForfeit(io, gameId, playerId);
      // Dacă ceasul de luptă era în pauză (adversarul lipsea), îl repornim
      // exact de unde a rămas pentru jucătorul aflat la rând.
      resumeBattleClock(gameId);
      if (!wasAlreadyPlayer) {
        io.to(gameId).emit("room:activity", { gameId, playerId, type: "joined", at: Date.now() });
      }
      broadcastRoomState(io, gameId);

      // Sala tocmai a ajuns la 2 jucători (sau era deja) -> pornim fereastra de
      // 30s de plasare, dacă lupta n-a început deja.
      const roomRoster = getRoomRoster(gameId);
      if (roomRoster.length === 2) {
        startPlacementWindow(gameId, roomRoster);
      }

      // Dacă acest jucător avea deja o partidă în desfășurare în această sală
      // (ex: a ieșit fără să termine jocul și a revenit), îi retrimitem starea
      // completă ca să-și poată reconstrui local avioanele/loviturile/rândul.
      const opponentId = getRoomRoster(gameId).find((id) => id !== playerId) ?? null;
      const sync = getBattleSyncFor(gameId, playerId, opponentId);
      socket.emit("battle:sync", { gameId, ...sync });
      socket.emit("room:role", { gameId, role: "player", playerIds: getRoomRoster(gameId) });
    } else {
      // Spectator: nu participă la logica jocului, doar vede sala. Nu declanșăm
      // niciun eveniment de "joined" în jurnalul de activitate al jucătorilor.
      addSpectatorToRoom(gameId, playerId);
      socket.emit("room:role", { gameId, role: "spectator", playerIds: getRoomRoster(gameId) });
      // Retrimitem imediat toate loviturile deja date de cei 2 jucători, ca
      // spectatorul să vadă din prima starea curentă a meciului (nu doar tabla goală).
      const sync = getSpectatorSyncFor(gameId, getRoomRoster(gameId));
      socket.emit("spectator:sync", { gameId, ...sync });
    }
  });

  // Mesaj de chat trimis în sala curentă - difuzat tuturor celor prezenți (jucători
  // și spectatori). Nu se persistă nicăieri, doar retransmis live.
  socket.on("room:chatMessage", ({ gameId, text }) => {
    if (!socket.rooms.has(gameId)) return;
    const trimmed = text.trim().slice(0, 300);
    if (!trimmed) return;
    io.to(gameId).emit("room:chatMessage", { gameId, playerId, text: trimmed, at: Date.now() });
  });

  // Ieșire voluntară din sală (ex: utilizatorul navighează înapoi la pagina principală,
  // pierde conexiunea sau dă accidental click). Dacă lupta era în desfășurare, NU
  // pierde imediat - are la dispoziție o perioadă de grație (FORFEIT_GRACE_PERIOD_MS)
  // să revină în sală înainte ca abandonul să fie declarat definitiv.
  // Păstrăm playerId -> gameId (activeGames) ca să putem readuce jucătorul înapoi în
  // aceeași sală dacă apasă din nou "Play now" cât timp adversarul e încă acolo.
  socket.on("room:leave", ({ gameId }) => {
    if (!socket.rooms.has(gameId)) return;
    socket.leave(gameId);
    if (isPlayerInRoom(gameId, playerId)) {
      // Dacă mai există alt tab/conexiune activă a ACESTUI jucător în aceeași
      // sală, nu tratăm asta ca o ieșire reală - jucătorul e în continuare
      // "prezent" prin celălalt tab.
      const wasLastConnection = unregisterRoomConnection(gameId, playerId);
      if (!wasLastConnection) return;

      removePlayerFromRoom(gameId, playerId);
      io.to(gameId).emit("room:activity", { gameId, playerId, type: "left", at: Date.now() });
      broadcastRoomState(io, gameId);
      if (isBattleStarted(gameId)) {
        schedulePossibleForfeit(io, gameId, playerId);
        // Ceasul de luptă se oprește temporar cât timp adversarul lipsește, ca
        // jucătorul rămas să nu-și piardă timpul din propriul ceas de 5 minute.
        pauseBattleClock(gameId, playerId);
      } else {
        // Ieșire în faza de plasare a avioanelor (lupta n-a început încă) -> sala
        // se invalidează definitiv, niciunul din cei doi nu mai poate reintra în ea.
        cancelPendingForfeit(io, gameId, playerId);
        cancelBattleForLeave(gameId, playerId);
      }
    } else {
      removeSpectatorFromRoom(gameId, playerId);
    }
  });

  socket.on("disconnecting", () => {
    const gameRooms = Array.from(socket.rooms).filter((room) => room !== socket.id);
    socket.once("disconnect", () => {
      gameRooms.forEach((gameId) => {
        if (isPlayerInRoom(gameId, playerId)) {
          // La fel ca la room:leave: dacă mai are alt tab conectat la aceeași
          // sală, nu declanșăm nimic - jucătorul rămâne "prezent".
          const wasLastConnection = unregisterRoomConnection(gameId, playerId);
          if (!wasLastConnection) return;

          removePlayerFromRoom(gameId, playerId);
          io.to(gameId).emit("room:activity", { gameId, playerId, type: "left", at: Date.now() });
          broadcastRoomState(io, gameId);
          if (isBattleStarted(gameId)) {
            schedulePossibleForfeit(io, gameId, playerId);
            pauseBattleClock(gameId, playerId);
          } else {
            cancelPendingForfeit(io, gameId, playerId);
            cancelBattleForLeave(gameId, playerId);
          }
        } else {
          removeSpectatorFromRoom(gameId, playerId);
        }
      });
    });
  });
}


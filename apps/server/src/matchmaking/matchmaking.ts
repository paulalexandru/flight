import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@flight/types";
import { getPlayerGame } from "../rooms/activeGames";
import { getRoomRoster, getRoomIdForPlayer } from "../rooms/roomRoster";
import { isBattleOver } from "../battle/battleManager";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Coadă de matchmaking simplă: cel mult un jucător așteaptă la un moment dat.
 * Ținută în memoria procesului — se resetează la restart, suficient pentru un singur server.
 */
let waitingSocket: AppSocket | null = null;
let waitingPlayerId: string | null = null;
let nextGameId = 1;

// Socket-ul curent (ultimul conectat) al fiecărui playerId — necesar ca să putem
// trimite o provocare directă (challenge) unui jucător anume, indiferent dacă
// el aștepta sau nu în coada de matchmaking anonim.
const socketByPlayerId = new Map<string, AppSocket>();

// Cât timp are cel provocat să răspundă (accept/refuz) înainte ca provocarea
// să expire automat.
const CHALLENGE_RESPONSE_WINDOW_MS = 20_000;
let nextChallengeId = 1;

interface PendingChallenge {
  challengeId: string;
  fromPlayerId: string;
  targetPlayerId: string;
  timer: NodeJS.Timeout;
}

// O singură provocare în așteptare per pereche - ținută după challengeId.
const pendingChallenges = new Map<string, PendingChallenge>();

// Cerere de revanșă în așteptare, per sală (gameId) - cel mult una la un
// moment dat, la fel ca la provocările directe.
const pendingRematches = new Map<string, { fromPlayerId: string; targetPlayerId: string }>();

function clearPendingChallenge(challengeId: string): void {
  const challenge = pendingChallenges.get(challengeId);
  if (!challenge) return;
  clearTimeout(challenge.timer);
  pendingChallenges.delete(challengeId);
}

/** Anulează orice altă provocare încă în așteptare care implică unul din cei doi jucători. */
function clearChallengesInvolving(io: AppServer, playerId: string): void {
  for (const [challengeId, challenge] of Array.from(pendingChallenges.entries())) {
    if (challenge.fromPlayerId === playerId || challenge.targetPlayerId === playerId) {
      clearPendingChallenge(challengeId);
      const fromSocket = socketByPlayerId.get(challenge.fromPlayerId);
      const targetSocket = socketByPlayerId.get(challenge.targetPlayerId);
      fromSocket?.emit("matchmaking:challengeEnded", { challengeId, reason: "cancelled" });
      targetSocket?.emit("matchmaking:challengeEnded", { challengeId, reason: "cancelled" });
    }
  }
  void io;
}

export function registerMatchmakingHandlers(io: AppServer, socket: AppSocket, playerId: string): void {
  socketByPlayerId.set(playerId, socket);
  socket.on("matchmaking:findMatch", () => {
    // Dacă acest jucător avea deja o sală activă (a ieșit fără să termine jocul)
    // și adversarul e încă acolo, îl ducem direct înapoi, fără matchmaking nou.
    // Excepție: dacă partida s-a terminat deja (are un câștigător), nu îl mai
    // readucem în ea — pornește o căutare nouă, ca la o partidă complet nouă.
    const previousGameId = getPlayerGame(playerId);
    if (previousGameId && !isBattleOver(previousGameId)) {
      const roster = getRoomRoster(previousGameId).filter((id) => id !== playerId);
      if (roster.length > 0) {
        socket.emit("matchmaking:matched", { gameId: previousGameId });
        return;
      }
    }

    if (waitingSocket && waitingSocket.connected && waitingPlayerId !== playerId) {
      const opponent = waitingSocket;
      waitingSocket = null;
      waitingPlayerId = null;

      const gameId = String(nextGameId++);
      socket.emit("matchmaking:matched", { gameId });
      opponent.emit("matchmaking:matched", { gameId });
    } else {
      waitingSocket = socket;
      waitingPlayerId = playerId;
    }
  });

  // Anulează căutarea acestui socket dacă acesta părăsește pagina de așteptare
  // fără să fi fost potrivit încă (ex: navighează înapoi, sau remontări duble în dev).
  socket.on("matchmaking:cancel", () => {
    if (waitingPlayerId === playerId) {
      waitingSocket = null;
      waitingPlayerId = null;
    }
  });

  // Provocare directă a unui jucător anume (din lista de jucători online de pe
  // pagina principală). Nu creează sala imediat - trimite o cerere de acceptare
  // celui provocat, care are un interval limitat de timp să răspundă.
  socket.on("matchmaking:challenge", ({ targetPlayerId }) => {
    if (targetPlayerId === playerId) {
      socket.emit("matchmaking:challengeFailed", { targetPlayerId, reason: "not-found" });
      return;
    }
    if (getRoomIdForPlayer(playerId) != null) {
      socket.emit("matchmaking:challengeFailed", { targetPlayerId, reason: "you-are-busy" });
      return;
    }
    const targetSocket = socketByPlayerId.get(targetPlayerId);
    if (!targetSocket || !targetSocket.connected) {
      socket.emit("matchmaking:challengeFailed", { targetPlayerId, reason: "not-found" });
      return;
    }
    if (getRoomIdForPlayer(targetPlayerId) != null) {
      socket.emit("matchmaking:challengeFailed", { targetPlayerId, reason: "busy" });
      return;
    }

    const challengeId = String(nextChallengeId++);
    const deadline = Date.now() + CHALLENGE_RESPONSE_WINDOW_MS;
    const timer = setTimeout(() => {
      pendingChallenges.delete(challengeId);
      socket.emit("matchmaking:challengeEnded", { challengeId, reason: "expired" });
      targetSocket.emit("matchmaking:challengeEnded", { challengeId, reason: "expired" });
    }, CHALLENGE_RESPONSE_WINDOW_MS);

    pendingChallenges.set(challengeId, { challengeId, fromPlayerId: playerId, targetPlayerId, timer });

    socket.emit("matchmaking:challengeSent", { challengeId, targetPlayerId, deadline });
    targetSocket.emit("matchmaking:challengeReceived", { challengeId, fromPlayerId: playerId, deadline });
  });

  // Provocatorul își retrage provocarea înainte ca celălalt să fi răspuns.
  socket.on("matchmaking:challengeCancel", ({ challengeId }) => {
    const challenge = pendingChallenges.get(challengeId);
    if (!challenge || challenge.fromPlayerId !== playerId) return;
    clearPendingChallenge(challengeId);
    const targetSocket = socketByPlayerId.get(challenge.targetPlayerId);
    targetSocket?.emit("matchmaking:challengeEnded", { challengeId, reason: "cancelled" });
  });

  // Răspunsul celui provocat.
  socket.on("matchmaking:challengeRespond", ({ challengeId, accept }) => {
    const challenge = pendingChallenges.get(challengeId);
    if (!challenge || challenge.targetPlayerId !== playerId) return;
    clearPendingChallenge(challengeId);

    const fromSocket = socketByPlayerId.get(challenge.fromPlayerId);

    if (!accept) {
      fromSocket?.emit("matchmaking:challengeEnded", { challengeId, reason: "declined" });
      return;
    }

    // A acceptat - verificăm din nou că niciunul dintre ei nu a ajuns între timp
    // ocupat (ex: a acceptat alt meci în timp ce dialogul era deschis).
    if (getRoomIdForPlayer(playerId) != null || getRoomIdForPlayer(challenge.fromPlayerId) != null) {
      fromSocket?.emit("matchmaking:challengeFailed", { targetPlayerId: playerId, reason: "busy" });
      return;
    }
    if (!fromSocket || !fromSocket.connected) {
      return;
    }

    // Oricare dintre cei doi poate fi și în coada de așteptare anonimă -> îl scoatem din ea.
    if (waitingPlayerId === playerId || waitingPlayerId === challenge.fromPlayerId) {
      waitingSocket = null;
      waitingPlayerId = null;
    }

    const gameId = String(nextGameId++);
    socket.emit("matchmaking:matched", { gameId });
    fromSocket.emit("matchmaking:matched", { gameId });
  });

  // Cerere de revanșă: un jucător dintr-o sală deja terminată vrea să joace din
  // nou cu ACELAȘI adversar. Nu creează sala imediat - trimite o cerere de
  // acceptare celuilalt, la fel ca la o provocare directă.
  socket.on("rematch:request", ({ gameId }) => {
    const roster = getRoomRoster(gameId);
    const targetPlayerId = roster.find((id) => id !== playerId);
    if (!targetPlayerId) return; // adversarul nu mai e în sala respectivă
    const targetSocket = socketByPlayerId.get(targetPlayerId);
    if (!targetSocket || !targetSocket.connected) return;
    // Dacă unul dintre ei a intrat între timp în ALT joc (nu în sala curentă,
    // deja terminată), cererea nu mai are sens.
    const myRoomId = getRoomIdForPlayer(playerId);
    const targetRoomId = getRoomIdForPlayer(targetPlayerId);
    if ((myRoomId != null && myRoomId !== gameId) || (targetRoomId != null && targetRoomId !== gameId)) return;

    pendingRematches.set(gameId, { fromPlayerId: playerId, targetPlayerId });
    targetSocket.emit("rematch:requested", { gameId, fromPlayerId: playerId });
  });

  // Răspunsul celui provocat la revanșă.
  socket.on("rematch:respond", ({ gameId, accept }) => {
    const pending = pendingRematches.get(gameId);
    if (!pending || pending.targetPlayerId !== playerId) return;
    pendingRematches.delete(gameId);

    const fromSocket = socketByPlayerId.get(pending.fromPlayerId);

    if (!accept) {
      fromSocket?.emit("rematch:declined", { gameId });
      return;
    }

    const myRoomId = getRoomIdForPlayer(playerId);
    const fromRoomId = getRoomIdForPlayer(pending.fromPlayerId);
    if ((myRoomId != null && myRoomId !== gameId) || (fromRoomId != null && fromRoomId !== gameId)) {
      fromSocket?.emit("rematch:declined", { gameId });
      return;
    }
    if (!fromSocket || !fromSocket.connected) return;

    const newGameId = String(nextGameId++);
    socket.emit("matchmaking:matched", { gameId: newGameId });
    fromSocket.emit("matchmaking:matched", { gameId: newGameId });
  });

  socket.on("disconnect", () => {
    if (waitingPlayerId === playerId) {
      waitingSocket = null;
      waitingPlayerId = null;
    }
    if (socketByPlayerId.get(playerId) === socket) {
      socketByPlayerId.delete(playerId);
    }
    clearChallengesInvolving(io, playerId);
    for (const [gameId, pending] of Array.from(pendingRematches.entries())) {
      if (pending.fromPlayerId === playerId || pending.targetPlayerId === playerId) {
        pendingRematches.delete(gameId);
      }
    }
  });
}


import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, PlanePlacement, ServerToClientEvents } from "@flight/types";
import { setPlayerGame } from "./activeGames";
import { addPlayerToRoom, removePlayerFromRoom, getRoomRoster } from "./roomRoster";
import { getBattleSyncFor, forfeitBattle, getPlanesFor } from "../battle/battleManager";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

function broadcastRoomState(io: AppServer, gameId: string): void {
  io.to(gameId).emit("room:state", { gameId, playerIds: getRoomRoster(gameId) });
}

/**
 * Dacă jucătorul care tocmai a plecat era într-o luptă în desfășurare (neterminată),
 * adversarul câștigă automat prin abandon — anunțăm sala exact ca la un final normal
 * de joc (battle:over), cu avioanele ambilor jucători dezvăluite.
 */
function handlePossibleForfeit(io: AppServer, gameId: string, leavingPlayerId: string): void {
  const winnerId = forfeitBattle(gameId, leavingPlayerId);
  if (!winnerId) return;
  const planes: Record<string, PlanePlacement[]> = {
    [leavingPlayerId]: getPlanesFor(gameId, leavingPlayerId),
    [winnerId]: getPlanesFor(gameId, winnerId),
  };
  io.to(gameId).emit("battle:over", { gameId, winnerId, planes });
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
    addPlayerToRoom(gameId, playerId);
    io.to(gameId).emit("room:activity", { gameId, playerId, type: "joined", at: Date.now() });
    broadcastRoomState(io, gameId);

    // Dacă acest jucător avea deja o partidă în desfășurare în această sală
    // (ex: a ieșit fără să termine jocul și a revenit), îi retrimitem starea
    // completă ca să-și poată reconstrui local avioanele/loviturile/rândul.
    const opponentId = getRoomRoster(gameId).find((id) => id !== playerId) ?? null;
    const sync = getBattleSyncFor(gameId, playerId, opponentId);
    socket.emit("battle:sync", { gameId, ...sync });
  });

  // Ieșire voluntară din sală (ex: utilizatorul navighează înapoi la pagina principală,
  // sau pleacă să joace cu robotul). Dacă lupta era în desfășurare, se consideră
  // abandon -> adversarul câștigă automat.
  // Păstrăm playerId -> gameId (activeGames) ca să putem readuce jucătorul înapoi în
  // aceeași sală dacă apasă din nou "Play now" cât timp adversarul e încă acolo.
  socket.on("room:leave", ({ gameId }) => {
    if (!socket.rooms.has(gameId)) return;
    socket.leave(gameId);
    removePlayerFromRoom(gameId, playerId);
    io.to(gameId).emit("room:activity", { gameId, playerId, type: "left", at: Date.now() });
    broadcastRoomState(io, gameId);
    handlePossibleForfeit(io, gameId, playerId);
  });

  socket.on("disconnecting", () => {
    const gameRooms = Array.from(socket.rooms).filter((room) => room !== socket.id);
    socket.once("disconnect", () => {
      gameRooms.forEach((gameId) => {
        removePlayerFromRoom(gameId, playerId);
        io.to(gameId).emit("room:activity", { gameId, playerId, type: "left", at: Date.now() });
        broadcastRoomState(io, gameId);
        handlePossibleForfeit(io, gameId, playerId);
      });
    });
  });
}


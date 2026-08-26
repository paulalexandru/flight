import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@flight/types";
import { setPlayerGame } from "./activeGames";
import { addPlayerToRoom, removePlayerFromRoom, getRoomRoster } from "./roomRoster";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

function broadcastRoomState(io: AppServer, gameId: string): void {
  io.to(gameId).emit("room:state", { gameId, playerIds: getRoomRoster(gameId) });
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
  });

  // Ieșire voluntară din sală (ex: utilizatorul navighează înapoi la pagina principală).
  // Păstrăm playerId -> gameId (activeGames) ca să putem readuce jucătorul înapoi în
  // aceeași sală dacă apasă din nou "Play now" cât timp adversarul e încă acolo.
  socket.on("room:leave", ({ gameId }) => {
    if (!socket.rooms.has(gameId)) return;
    socket.leave(gameId);
    removePlayerFromRoom(gameId, playerId);
    io.to(gameId).emit("room:activity", { gameId, playerId, type: "left", at: Date.now() });
    broadcastRoomState(io, gameId);
  });

  socket.on("disconnecting", () => {
    const gameRooms = Array.from(socket.rooms).filter((room) => room !== socket.id);
    socket.once("disconnect", () => {
      gameRooms.forEach((gameId) => {
        removePlayerFromRoom(gameId, playerId);
        io.to(gameId).emit("room:activity", { gameId, playerId, type: "left", at: Date.now() });
        broadcastRoomState(io, gameId);
      });
    });
  });
}

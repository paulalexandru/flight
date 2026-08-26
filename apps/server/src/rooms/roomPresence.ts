import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@flight/types";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

function broadcastRoomState(io: AppServer, gameId: string): void {
  const room = io.sockets.adapter.rooms.get(gameId);
  const playerIds = room ? Array.from(room) : [];
  io.to(gameId).emit("room:state", { gameId, playerIds });
}

/**
 * Prezență simplă în sala de joc: cine e conectat momentan la camera `gameId`.
 * Identificatorul jucătorului e, deocamdată, id-ul de socket (fără autentificare reală).
 */
export function registerRoomHandlers(io: AppServer, socket: AppSocket): void {
  socket.on("room:join", ({ gameId }) => {
    socket.join(gameId);
    io.to(gameId).emit("room:activity", { gameId, playerId: socket.id, type: "joined", at: Date.now() });
    broadcastRoomState(io, gameId);
  });

  socket.on("disconnecting", () => {
    const gameRooms = Array.from(socket.rooms).filter((room) => room !== socket.id);
    socket.once("disconnect", () => {
      gameRooms.forEach((gameId) => {
        io.to(gameId).emit("room:activity", { gameId, playerId: socket.id, type: "left", at: Date.now() });
        broadcastRoomState(io, gameId);
      });
    });
  });
}

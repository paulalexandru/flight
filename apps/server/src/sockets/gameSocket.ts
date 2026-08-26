import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@flight/types";
import { createGame, getGame, joinGame, placePlanes, resign, shoot } from "../game/gameManager";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/** Identifică jucătorul curent din socket (placeholder — de înlocuit cu auth reală/JWT). */
function getPlayerFromSocket(socket: AppSocket): { id: string; username: string } {
  const id = (socket.handshake.auth?.playerId as string) ?? socket.id;
  const username = (socket.handshake.auth?.username as string) ?? `Player-${socket.id.slice(0, 5)}`;
  return { id, username };
}

export function registerGameSocketHandlers(io: AppServer): void {
  io.on("connection", (socket: AppSocket) => {
    const player = getPlayerFromSocket(socket);

    socket.on("game:join", ({ gameId }) => {
      let game = getGame(gameId);
      if (!game) {
        game = createGame(gameId, player);
      } else {
        const joined = joinGame(gameId, player);
        if (!joined) {
          socket.emit("game:error", { message: "Partida este deja plină." });
          return;
        }
        game = joined;
      }

      socket.join(gameId);
      io.to(gameId).emit("game:state", game);
    });

    socket.on("game:placePlanes", ({ gameId, planes }) => {
      const game = placePlanes(gameId, player.id, planes);
      if (!game) {
        socket.emit("game:error", { message: "Partida nu a fost găsită." });
        return;
      }
      io.to(gameId).emit("game:state", game);
    });

    socket.on("game:shoot", ({ gameId, cell }) => {
      const outcome = shoot(gameId, player.id, cell);
      if (!outcome) {
        socket.emit("game:error", { message: "Mutare invalidă." });
        return;
      }
      io.to(gameId).emit("game:state", outcome.game);
    });

    socket.on("game:resign", ({ gameId }) => {
      const game = resign(gameId, player.id);
      if (!game) return;
      io.to(gameId).emit("game:state", game);
    });
  });
}

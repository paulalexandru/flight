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

    socket.on("game:join", async ({ gameId }) => {
      try {
        let game = getGame(gameId);
        if (!game) {
          game = await createGame(gameId, player);
        } else {
          const joined = await joinGame(gameId, player);
          if (!joined) {
            socket.emit("game:error", { message: "Partida este deja plină." });
            return;
          }
          game = joined;
        }

        socket.join(gameId);
        io.to(gameId).emit("game:state", game);
      } catch (error) {
        console.error("game:join failed", error);
        socket.emit("game:error", { message: "Nu s-a putut crea/alătura partida." });
      }
    });

    socket.on("game:placePlanes", async ({ gameId, planes }) => {
      try {
        const game = await placePlanes(gameId, player.id, planes);
        if (!game) {
          socket.emit("game:error", { message: "Partida nu a fost găsită." });
          return;
        }
        io.to(gameId).emit("game:state", game);
      } catch (error) {
        console.error("game:placePlanes failed", error);
        socket.emit("game:error", { message: "Nu s-au putut salva avioanele." });
      }
    });

    socket.on("game:shoot", async ({ gameId, cell }) => {
      try {
        const outcome = await shoot(gameId, player.id, cell);
        if (!outcome) {
          socket.emit("game:error", { message: "Mutare invalidă." });
          return;
        }
        io.to(gameId).emit("game:state", outcome.game);
      } catch (error) {
        console.error("game:shoot failed", error);
        socket.emit("game:error", { message: "Nu s-a putut înregistra mutarea." });
      }
    });

    socket.on("game:resign", async ({ gameId }) => {
      try {
        const game = await resign(gameId, player.id);
        if (!game) return;
        io.to(gameId).emit("game:state", game);
      } catch (error) {
        console.error("game:resign failed", error);
        socket.emit("game:error", { message: "Nu s-a putut abandona partida." });
      }
    });
  });
}

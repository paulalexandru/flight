import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@flight/types";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Coadă de matchmaking simplă: cel mult un jucător așteaptă la un moment dat.
 * Ținută în memoria procesului — se resetează la restart, suficient pentru un singur server.
 */
let waitingSocket: AppSocket | null = null;
let nextGameId = 1;

export function registerMatchmakingHandlers(io: AppServer, socket: AppSocket): void {
  socket.on("matchmaking:findMatch", () => {
    if (waitingSocket && waitingSocket.connected && waitingSocket.id !== socket.id) {
      const opponent = waitingSocket;
      waitingSocket = null;

      const gameId = String(nextGameId++);
      socket.emit("matchmaking:matched", { gameId });
      opponent.emit("matchmaking:matched", { gameId });
    } else {
      waitingSocket = socket;
    }
  });

  // Anulează căutarea acestui socket dacă acesta părăsește pagina de așteptare
  // fără să fi fost potrivit încă (ex: navighează înapoi, sau remontări duble în dev).
  socket.on("matchmaking:cancel", () => {
    if (waitingSocket?.id === socket.id) {
      waitingSocket = null;
    }
  });

  socket.on("disconnect", () => {
    if (waitingSocket?.id === socket.id) {
      waitingSocket = null;
    }
  });
}

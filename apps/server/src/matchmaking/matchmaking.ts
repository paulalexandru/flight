import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@flight/types";
import { getPlayerGame } from "../rooms/activeGames";
import { getRoomRoster } from "../rooms/roomRoster";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Coadă de matchmaking simplă: cel mult un jucător așteaptă la un moment dat.
 * Ținută în memoria procesului — se resetează la restart, suficient pentru un singur server.
 */
let waitingSocket: AppSocket | null = null;
let waitingPlayerId: string | null = null;
let nextGameId = 1;

export function registerMatchmakingHandlers(io: AppServer, socket: AppSocket, playerId: string): void {
  socket.on("matchmaking:findMatch", () => {
    // Dacă acest jucător avea deja o sală activă (a ieșit fără să termine jocul)
    // și adversarul e încă acolo, îl ducem direct înapoi, fără matchmaking nou.
    const previousGameId = getPlayerGame(playerId);
    if (previousGameId) {
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

  socket.on("disconnect", () => {
    if (waitingPlayerId === playerId) {
      waitingSocket = null;
      waitingPlayerId = null;
    }
  });
}

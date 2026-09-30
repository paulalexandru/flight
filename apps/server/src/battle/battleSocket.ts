import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, PlanePlacement, ServerToClientEvents } from "@flight/types";
import { getRoomRoster, isPlayerInRoom } from "../rooms/roomRoster";
import {
  submitPlacement,
  getReadyPlayerIds,
  tryStartBattle,
  isBattleStarted,
  shoot,
  getWinnerId,
  getPlanesFor,
  resetBattle,
  cancelPlacementWindow,
  getBattleClockSnapshot,
} from "./battleManager";
import { resetLeaveTrackingForGame } from "../rooms/roomPresence";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

function otherPlayerId(gameId: string, playerId: string): string | null {
  const roster = getRoomRoster(gameId);
  return roster.find((id) => id !== playerId) ?? null;
}

/**
 * Fază de plasare avioane + luptă (în memorie, per sală). Se bazează pe rosterul
 * de sală existent (roomRoster) pentru a ști care sunt cei 2 jucători.
 */
export function registerBattleHandlers(io: AppServer, socket: AppSocket, playerId: string): void {
  socket.on("placement:ready", ({ gameId, planes }) => {
    // Spectatorii nu pot participa la joc - orice acțiune de plasare/tragere e
    // ignorată dacă playerId nu e unul dintre cei 2 jucători reali ai sălii.
    if (!isPlayerInRoom(gameId, playerId)) {
      socket.emit("game:error", { message: "Ești doar spectator în această sală." });
      return;
    }
    const result = submitPlacement(gameId, playerId, planes);
    if (!result.ok) {
      socket.emit("game:error", { message: result.error });
      return;
    }

    io.to(gameId).emit("placement:status", { gameId, readyPlayerIds: getReadyPlayerIds(gameId) });
    io.to(gameId).emit("room:activity", { gameId, playerId, type: "placed", at: Date.now() });

    const roomPlayerIds = getRoomRoster(gameId);
    const startResult = tryStartBattle(gameId, roomPlayerIds);
    if (startResult.started) {
      io.to(gameId).emit("battle:started", { gameId, firstPlayerId: startResult.firstPlayerId });
      const clockSnapshot = getBattleClockSnapshot(gameId);
      io.to(gameId).emit("battle:clock", { gameId, ...clockSnapshot });
    }
  });

  socket.on("battle:shoot", ({ gameId, cell }) => {
    if (!isPlayerInRoom(gameId, playerId)) {
      socket.emit("game:error", { message: "Ești doar spectator în această sală." });
      return;
    }
    if (!isBattleStarted(gameId)) {
      socket.emit("game:error", { message: "Lupta nu a început încă." });
      return;
    }
    const opponentId = otherPlayerId(gameId, playerId);
    if (!opponentId) {
      socket.emit("game:error", { message: "Adversarul nu mai este în sală." });
      return;
    }

    const result = shoot(gameId, playerId, opponentId, cell);
    if (!result.ok) {
      socket.emit("game:error", { message: result.error });
      return;
    }

    io.to(gameId).emit("battle:shot", { gameId, byPlayerId: playerId, cell, result: result.result });

    if (result.gameOver) {
      const winnerId = getWinnerId(gameId);
      if (winnerId) {
        // Dezvăluim avioanele ambilor jucători, ca fiecare să vadă cum era
        // aranjată tabla adversarului la finalul partidei.
        const planes: Record<string, PlanePlacement[]> = {
          [playerId]: getPlanesFor(gameId, playerId),
          [opponentId]: getPlanesFor(gameId, opponentId),
        };
        io.to(gameId).emit("battle:over", { gameId, winnerId, planes });
        resetLeaveTrackingForGame(gameId, [playerId, opponentId]);
      }
    } else {
      const clockSnapshot = getBattleClockSnapshot(gameId);
      io.to(gameId).emit("battle:clock", { gameId, ...clockSnapshot });
    }
  });

  // Dacă sala rămâne fără jucători, resetăm starea de luptă (o partidă nouă
  // va porni curat data viitoare când doi jucători intră în aceeași sală).
  socket.on("room:leave", ({ gameId }) => {
    const roster = getRoomRoster(gameId);
    if (roster.length === 0) {
      resetBattle(gameId);
    } else if (roster.length < 2) {
      cancelPlacementWindow(gameId);
    }
  });
}

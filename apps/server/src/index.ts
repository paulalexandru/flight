import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@flight/types";
import { healthRouter } from "./routes/health";
import { historyRouter } from "./routes/history";
import { registerMatchmakingHandlers } from "./matchmaking/matchmaking";
import { registerRoomHandlers } from "./rooms/roomPresence";
import { registerBattleHandlers } from "./battle/battleSocket";
import { registerConnection, unregisterConnection, getOnlineUsersCount } from "./rooms/roomRoster";

const PORT = Number(process.env.PORT ?? 4000);
// CLIENT_ORIGIN acceptă o listă separată prin virgulă (ex: pentru acces din rețea locală).
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim());

const app = express();
app.use(cors({ origin: CLIENT_ORIGINS }));
app.use(express.json());
app.use("/health", healthRouter);
app.use("/api", historyRouter);

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGINS },
});

// Faza curentă: doar matchmaking + prezență în sală, fără logica jocului încă
// (game:join/placePlanes/shoot rămân definite în types pentru etapa următoare).
io.on("connection", (socket) => {
  const playerId = String(socket.handshake.auth?.playerId ?? socket.id);
  registerMatchmakingHandlers(io, socket, playerId);
  registerRoomHandlers(io, socket, playerId);
  registerBattleHandlers(io, socket, playerId);

  // Numărul total de utilizatori conectați la site (indiferent de sală) —
  // recalculat și retransmis tuturor la fiecare conectare/deconectare.
  registerConnection(playerId);
  io.emit("presence:onlineCount", { count: getOnlineUsersCount() });

  socket.on("disconnect", () => {
    unregisterConnection(playerId);
    io.emit("presence:onlineCount", { count: getOnlineUsersCount() });
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Flight server listening on http://0.0.0.0:${PORT}`);
});

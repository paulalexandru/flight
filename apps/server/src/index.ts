import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@flight/types";
import { healthRouter } from "./routes/health";
import { historyRouter } from "./routes/history";
import { registerGameSocketHandlers } from "./sockets/gameSocket";

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());
app.use("/health", healthRouter);
app.use("/api", historyRouter);

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

registerGameSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`Flight server listening on http://localhost:${PORT}`);
});

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, GameState, ServerToClientEvents } from "@flight/types";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:4000";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useSocket() {
  const socketRef = useRef<AppSocket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket: AppSocket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on("game:state", setGameState);
    socket.on("game:error", ({ message }) => setError(message));

    return () => {
      socket.disconnect();
    };
  }, []);

  return { socket: socketRef.current, gameState, error };
}

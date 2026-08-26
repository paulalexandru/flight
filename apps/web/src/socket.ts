import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@flight/types";

// Dacă VITE_SERVER_URL nu e setat, deducem adresa serverului din hostname-ul paginii curente
// (funcționează automat atât pe localhost, cât și accesat din rețea locală via IP).
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? `http://${window.location.hostname}:4000`;

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Instanță unică de socket, partajată de toate paginile — se păstrează conectată
// pe parcursul navigării între rute în cadrul aceluiași tab de browser.
export const socket: AppSocket = io(SERVER_URL, { autoConnect: true });

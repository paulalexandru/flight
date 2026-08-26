import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@flight/types";

// Dacă VITE_SERVER_URL nu e setat, deducem adresa serverului din hostname-ul paginii curente
// (funcționează automat atât pe localhost, cât și accesat din rețea locală via IP).
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? `http://${window.location.hostname}:4000`;

const PLAYER_ID_STORAGE_KEY = "flight:playerId";

// `crypto.randomUUID()` este disponibil doar în context "securizat" (HTTPS sau
// localhost) — accesul din rețeaua locală prin IP simplu (http://192.168.x.x)
// nu se califică, deci avem nevoie de un fallback manual care nu depinde de asta.
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `player-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Id de jucător persistent (independent de conexiunea socket), salvat în localStorage.
// Necesar pentru a recunoaște același jucător după o reconectare (socket.id se schimbă),
// astfel încât server-ul să îl poată readuce corect în sala în care era.
function getOrCreatePlayerId(): string {
  const existing = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY);
  if (existing) return existing;
  const created = generateId();
  window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, created);
  return created;
}

export const playerId = getOrCreatePlayerId();

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Instanță unică de socket, partajată de toate paginile — se păstrează conectată
// pe parcursul navigării între rute în cadrul aceluiași tab de browser.
export const socket: AppSocket = io(SERVER_URL, { autoConnect: true, auth: { playerId } });


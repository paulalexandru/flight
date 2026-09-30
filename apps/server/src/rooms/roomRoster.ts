/**
 * Registru al jucătorilor (id stabil, nu socket.id) prezenți în fiecare sală.
 * Necesar pentru ca un jucător reconectat (socket.id nou) să fie recunoscut
 * ca fiind "tot el" în lista de jucători afișată. O sală are strict maxim 2
 * "jucători" propriu-ziși — orice altcineva care intră cu același gameId
 * devine automat spectator (vezi mai jos), fără să afecteze logica jocului.
 */
const gameRosters = new Map<string, Set<string>>();
// Mapare inversă: playerId -> gameId, ca să putem verifica rapid dacă un
// jucător e deja "ocupat" (are o sală activă) fără să scanăm toate sălile.
const playerToRoomId = new Map<string, string>();

/** Returnează true dacă playerId a fost adăugat ca JUCĂTOR (roster < 2 sau deja prezent). */
export function addPlayerToRoom(gameId: string, playerId: string): boolean {
  const roster = gameRosters.get(gameId) ?? new Set<string>();
  if (!roster.has(playerId) && roster.size >= 2) {
    return false;
  }
  roster.add(playerId);
  gameRosters.set(gameId, roster);
  playerToRoomId.set(playerId, gameId);
  return true;
}

export function removePlayerFromRoom(gameId: string, playerId: string): void {
  const roster = gameRosters.get(gameId);
  if (!roster) return;
  roster.delete(playerId);
  if (roster.size === 0) {
    gameRosters.delete(gameId);
  }
  if (playerToRoomId.get(playerId) === gameId) {
    playerToRoomId.delete(playerId);
  }
}

/** Sala în care se află în prezent playerId ca jucător (nu spectator), dacă există. */
export function getRoomIdForPlayer(playerId: string): string | undefined {
  return playerToRoomId.get(playerId);
}


export function getRoomRoster(gameId: string): string[] {
  return Array.from(gameRosters.get(gameId) ?? []);
}

export function isPlayerInRoom(gameId: string, playerId: string): boolean {
  return gameRosters.get(gameId)?.has(playerId) ?? false;
}

/**
 * Spectatori: oricine intră într-o sală care are deja 2 jucători. Nu au niciun
 * drept de operare (nu pot plasa avioane, nu pot trage) — pot doar vedea cele
 * două table (nedescoperite) și id-urile celor 2 jucători care se înfruntă.
 */
const roomSpectators = new Map<string, Set<string>>();

export function addSpectatorToRoom(gameId: string, playerId: string): void {
  const spectators = roomSpectators.get(gameId) ?? new Set<string>();
  spectators.add(playerId);
  roomSpectators.set(gameId, spectators);
}

export function removeSpectatorFromRoom(gameId: string, playerId: string): void {
  const spectators = roomSpectators.get(gameId);
  if (!spectators) return;
  spectators.delete(playerId);
  if (spectators.size === 0) {
    roomSpectators.delete(gameId);
  }
}

export function isSpectatorInRoom(gameId: string, playerId: string): boolean {
  return roomSpectators.get(gameId)?.has(playerId) ?? false;
}

/**
 * Numărul de conexiuni socket active pentru fiecare playerId (id stabil, nu
 * socket.id) — un jucător cu mai multe tab-uri/dispozitive deschise numără o
 * singură dată în totalul de utilizatori online.
 */
const connectionsByPlayer = new Map<string, number>();

export function registerConnection(playerId: string): void {
  connectionsByPlayer.set(playerId, (connectionsByPlayer.get(playerId) ?? 0) + 1);
}

export function unregisterConnection(playerId: string): void {
  const count = connectionsByPlayer.get(playerId) ?? 0;
  if (count <= 1) {
    connectionsByPlayer.delete(playerId);
  } else {
    connectionsByPlayer.set(playerId, count - 1);
  }
}

export function getOnlineUsersCount(): number {
  return connectionsByPlayer.size;
}

/** Lista efectivă a playerId-urilor curent online (nu doar numărul lor). */
export function getOnlinePlayerIds(): string[] {
  return Array.from(connectionsByPlayer.keys());
}
